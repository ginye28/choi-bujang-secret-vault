import { withEventLog } from '../src/event-log.mjs';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { checkDeviceProof, createDeviceStore } from '../src/device-proof.mjs';
import { hasStoredInstructorPermission } from '../src/instructor-access.mjs';
import {
  announcementDatabaseId,
  announcementResourceId,
  isAnnouncementResourceId,
} from '../src/resource-ids.mjs';

let services;

function getServices() {
  if (services) return services;

  const config = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
  if (typeof supabaseUrl !== 'string' || !supabaseUrl.trim()
      || typeof supabaseSecretKey !== 'string' || !supabaseSecretKey.trim()) {
    throw new Error('server_not_configured');
  }

  const verifyLogin = createLoginVerifier({ config, supabaseSecretKey });
  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  services = { verifyLogin, supabase, secret: supabaseSecretKey };
  return services;
}

function queryId(request) {
  if (request.query && Object.hasOwn(request.query, 'id')) {
    return typeof request.query.id === 'string' ? request.query.id : null;
  }
  try {
    const url = new URL(request.url, 'http://localhost');
    return url.searchParams.has('id') ? url.searchParams.get('id') : undefined;
  } catch {
    return undefined;
  }
}

function announcementFromRow(row) {
  return { id: announcementResourceId(row.id), title: row.title, body: row.content };
}

async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  let currentServices;
  try {
    currentServices = getServices();
  } catch {
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }

  let identity;
  try {
    identity = await currentServices.verifyLogin(request.headers?.authorization);
  } catch {
    identity = null;
  }
  if (!identity?.userId) {
    return response.status(401).json({ error: 'UNAUTHORIZED' });
  }

  // 설치형 앱 표시가 붙은 요청은 승인된 기기의 서명이 있어야 합니다(11단계).
  const proof = await checkDeviceProof({
    request, identity, loadDevice: (deviceId) => createDeviceStore(currentServices.supabase).load(deviceId),
    secret: currentServices.secret,
  });
  if (proof.required && !proof.ok) {
    return response.status(401).json({ error: 'DEVICE_PROOF_REQUIRED', reason: proof.reason });
  }

  // 공지는 로그인한 사용자 누구나 읽을 수 있습니다. 수정·등록·삭제는 서버에 저장된
  // 강사 권한(app_metadata.role)이 있을 때만 시도할 수 있고, 화면 메뉴나 요청 본문의
  // role 은 보지 않습니다. 저장된 권한을 확인할 수 없으면 허용하지 않습니다.
  if (request.method !== 'GET') {
    let instructorAllowed = false;
    try {
      instructorAllowed = await hasStoredInstructorPermission(currentServices.supabase, identity);
    } catch {
      instructorAllowed = false;
    }
    if (!instructorAllowed) {
      return response.status(403).json({ error: 'FORBIDDEN', reason: 'INSTRUCTOR_REQUIRED' });
    }
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const id = queryId(request);
  const hasId = id !== undefined;
  if (hasId && !isAnnouncementResourceId(id)) {
    return response.status(400).json({ error: 'INVALID_ID' });
  }

  const supabase = currentServices.supabase;
  try {
    if (!hasId) {
      const { data, error } = await supabase
        .from('instructor_announcements')
        .select('id, title, content')
        .order('created_at', { ascending: false });
      if (error || !Array.isArray(data)) {
        return response.status(500).json({ error: 'ANNOUNCEMENTS_SERVICE_UNAVAILABLE' });
      }
      return response.status(200).json(data.map(announcementFromRow));
    }

    const { data, error } = await supabase
      .from('instructor_announcements')
      .select('id, title, content')
      .eq('id', announcementDatabaseId(id))
      .maybeSingle();
    if (error) return response.status(500).json({ error: 'ANNOUNCEMENTS_SERVICE_UNAVAILABLE' });
    if (!data) return response.status(404).json({ error: 'NOT_FOUND' });
    return response.status(200).json(announcementFromRow(data));
  } catch {
    return response.status(500).json({ error: 'ANNOUNCEMENTS_SERVICE_UNAVAILABLE' });
  }
}

// 응답을 보내기 전에 요청·결과를 서버 요청 기록에 남깁니다(12단계).
export default withEventLog(handler);

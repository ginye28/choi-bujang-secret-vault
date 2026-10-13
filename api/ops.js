import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { checkDeviceProof, createDeviceStore } from '../src/device-proof.mjs';
import { BACKUP_PREFIX } from '../src/note-backup.mjs';
import { buildOpsReport, runLocalChecks } from '../src/ops-room.mjs';

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

// 서버에 남긴 배포 점검 기록(scripts/verify-all.mjs 가 만든 파일). 없으면 빈 목록입니다.
function readDeployedRows() {
  try {
    const log = JSON.parse(readFileSync(new URL('../docs/verification-log.json', import.meta.url), 'utf8'));
    return Array.isArray(log.deployedRows) ? log.deployedRows.slice(0, 40) : [];
  } catch {
    return [];
  }
}

// GET /api/ops — 탈환 작전실 요약(12단계). 로그인한 사용자 본인의 복구 버전·기기 상태 숫자와
// 서버가 지금 실행한 점검 결과만 돌려줍니다. 메모 제목·본문은 읽지도 돌려주지도 않습니다.
export default async function handler(request, response) {
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
    return response.status(401).json({ error: 'UNAUTHORIZED', reason: 'LOGIN_REQUIRED' });
  }
  const store = createDeviceStore(currentServices.supabase);
  const proof = await checkDeviceProof({
    request, identity, loadDevice: (deviceId) => store.load(deviceId), secret: currentServices.secret,
  });
  if (proof.required && !proof.ok) {
    return response.status(401).json({ error: 'DEVICE_PROOF_REQUIRED', reason: proof.reason });
  }
  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  try {
    const { data, error } = await currentServices.supabase
      .from('training_notes')
      .select('title, created_at')
      .eq('owner_id', identity.userId)
      .like('title', `${BACKUP_PREFIX}%`)
      .order('created_at', { ascending: true })
      .limit(500);
    if (error || !Array.isArray(data)) throw error ?? new Error('recovery_lookup_failed');
    const devices = await store.listOwned(identity.userId);
    const rows = await runLocalChecks();
    return response.status(200).json(buildOpsReport({
      rows, deployedRows: readDeployedRows(), recovery: data, devices,
    }));
  } catch {
    return response.status(500).json({ error: 'OPS_SERVICE_UNAVAILABLE' });
  }
}

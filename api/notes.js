import { withEventLog } from '../src/event-log.mjs';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { isNoteResourceId } from '../src/resource-ids.mjs';
import { checkDeviceProof, createDeviceStore } from '../src/device-proof.mjs';
import { BACKUP_LIKE, backupCurrentNote, isBackupTitle, recordBackup } from '../src/note-backup.mjs';

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

function requestBody(request) {
  let body = request.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body;
}

function isNoteBody(body) {
  return body && typeof body.title === 'string' && typeof body.body === 'string';
}

function noteFromRow(row) {
  return { id: row.id, title: row.title, body: row.content };
}

// 사본 저장은 메모 API 의 응답을 막지 않도록 최선 노력으로 합니다. 실패 사실만 서버 로그에 남깁니다.
async function saveBackupSafely(supabase, note) {
  try { await recordBackup(supabase, note); } catch { console.error('note_backup_failed'); }
}

async function backupBeforeChange(supabase, target) {
  try { await backupCurrentNote(supabase, target); } catch { console.error('note_backup_failed'); }
}

function notFound(response) {
  // Same response for absent and non-owned notes prevents ID enumeration.
  return response.status(404).json({ error: 'NOT_FOUND', reason: 'OWNER_MISMATCH_OR_NOT_FOUND' });
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
    return response.status(401).json({ error: 'UNAUTHORIZED', reason: 'LOGIN_REQUIRED' });
  }

  // 설치형 앱 표시가 붙은 요청은 승인된 기기의 서명이 있어야 합니다(11단계). 표시가 없으면 기존 규칙 그대로입니다.
  const proof = await checkDeviceProof({
    request, identity, loadDevice: (deviceId) => createDeviceStore(currentServices.supabase).load(deviceId),
    secret: currentServices.secret,
  });
  if (proof.required && !proof.ok) {
    return response.status(401).json({ error: 'DEVICE_PROOF_REQUIRED', reason: proof.reason });
  }

  const id = queryId(request);
  const hasId = id !== undefined;
  if (hasId && !isNoteResourceId(id)) {
    return response.status(400).json({ error: 'INVALID_ID' });
  }

  const { method } = request;
  const supabase = currentServices.supabase;

  try {
    if (method === 'GET' && !hasId) {
      const { data, error } = await supabase
        .from('training_notes')
        .select('id, title, content')
        .eq('owner_id', identity.userId)
        .not('title', 'like', BACKUP_LIKE);
      if (error || !Array.isArray(data)) {
        return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      }
      return response.status(200).json(data.map(noteFromRow));
    }

    if (method === 'GET' && hasId) {
      const { data, error } = await supabase
        .from('training_notes')
        .select('id, title, content')
        .eq('id', id)
        .eq('owner_id', identity.userId)
        .maybeSingle();
      if (error) return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      if (!data || isBackupTitle(data.title)) return notFound(response);
      return response.status(200).json(noteFromRow(data));
    }

    if (method === 'POST' && !hasId) {
      const body = requestBody(request);
      if (!isNoteBody(body)) return response.status(400).json({ error: 'INVALID_BODY' });
      if (body.id !== undefined && !isNoteResourceId(body.id)) {
        return response.status(400).json({ error: 'INVALID_ID' });
      }

      const idToCreate = body.id ?? randomUUID();
      const { data, error } = await supabase
        .from('training_notes')
        .insert({
          id: idToCreate,
          owner_id: identity.userId,
          title: body.title,
          content: body.body,
        })
        .select('id')
        .single();
      if (error?.code === '23505') {
        return response.status(409).json({ error: 'CONFLICT' });
      }
      if (error || !data) {
        return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      }
      await saveBackupSafely(supabase, { id: data.id, owner: identity.userId, title: body.title, content: body.body });
      return response.status(201).json({ id: data.id });
    }

    if (method === 'PUT' && hasId) {
      const body = requestBody(request);
      if (!isNoteBody(body)) return response.status(400).json({ error: 'INVALID_BODY' });
      await backupBeforeChange(supabase, { id, owner: identity.userId });
      const { data, error } = await supabase
        .from('training_notes')
        .update({ title: body.title, content: body.body })
        .eq('id', id)
        .eq('owner_id', identity.userId)
        .select('id')
        .maybeSingle();
      if (error) return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      if (!data) return notFound(response);
      return response.status(200).json({ id: data.id });
    }

    if (method === 'DELETE' && hasId) {
      await backupBeforeChange(supabase, { id, owner: identity.userId });
      const { data, error } = await supabase
        .from('training_notes')
        .delete()
        .eq('id', id)
        .eq('owner_id', identity.userId)
        .select('id')
        .maybeSingle();
      if (error) return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
      if (!data) return notFound(response);
      return response.status(200).json({ id: data.id });
    }

    response.setHeader('Allow', 'GET, POST, PUT, DELETE');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  } catch {
    return response.status(500).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }
}

// 응답을 보내기 전에 요청·결과를 서버 요청 기록에 남깁니다(12단계).
export default withEventLog(handler);

import { withEventLog } from '../src/event-log.mjs';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { hasStoredInstructorPermission } from '../src/instructor-access.mjs';
import {
  checkDeviceProof, createDeviceStore, decideNewDevice, isDeviceId, issueTicket, newDeviceId,
  tokenIssuedAt,
} from '../src/device-proof.mjs';

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

function requestBody(request) {
  let body = request.body;
  if (Buffer.isBuffer(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { return null; }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return body;
}

function summary(record) {
  return { deviceId: record.deviceId, status: record.status, registered: record.status === 'approved' };
}

// /api/device — 기기 승인 요청, 승인 상태 확인, 요청별 서명(티켓) 발급(11단계).
// 기기 번호와 서명은 서버가 만들고, 브라우저에는 기기 서명 정보가 없습니다. 승인 여부도 서버가 정합니다:
// 이 사용자의 첫 기기이거나 로그인한 지 얼마 안 된 요청이면 승인하고, 그 밖에는 승인된 기기의 서명
// 요청 또는 서버에 저장된 강사 권한(action: 'approve')이 있어야 승인됩니다. 화면의 버튼 값은 쓰지 않습니다.
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

  const store = createDeviceStore(currentServices.supabase);
  try {
    if (request.method === 'GET') {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const deviceId = request.query?.deviceId ?? url.searchParams.get('deviceId');
      if (deviceId === null || deviceId === undefined) {
        const devices = await store.listOwned(identity.userId);
        return response.status(200).json({ devices: devices.map(summary) });
      }
      if (!isDeviceId(deviceId)) return response.status(400).json({ error: 'INVALID_DEVICE_ID' });
      const record = await store.load(deviceId);
      if (!record || record.owner !== identity.userId) {
        return response.status(404).json({ error: 'DEVICE_NOT_FOUND', registered: false });
      }
      return response.status(200).json(summary(record));
    }

    if (request.method !== 'POST') {
      response.setHeader('Allow', 'GET, POST');
      return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    }
    const body = requestBody(request);
    if (body === null) return response.status(400).json({ error: 'INVALID_BODY' });

    if (body.action === 'request') {
      const owned = await store.listOwned(identity.userId);
      const approvedCount = owned.filter((record) => record.status === 'approved').length;
      const iat = tokenIssuedAt(request.headers?.authorization);
      const loginAgeSeconds = iat === null ? Number.NaN : Math.floor(Date.now() / 1000) - iat;
      const decision = decideNewDevice({ approvedCount, loginAgeSeconds });
      const record = {
        v: 2, deviceId: newDeviceId(), owner: identity.userId, status: decision.status,
        reason: decision.reason, requestedAt: new Date().toISOString(),
      };
      await store.save(record);
      return response.status(200).json({ ...summary(record), reason: decision.reason });
    }

    if (body.action === 'ticket') {
      // 승인된 이 사용자의 기기에만, 요청 하나(방식·경로·본문 해시)에 대한 짧은 티켓을 줍니다.
      if (!isDeviceId(body.deviceId)) return response.status(400).json({ error: 'INVALID_DEVICE_ID' });
      const record = await store.load(body.deviceId);
      if (!record || record.owner !== identity.userId) return response.status(404).json({ error: 'DEVICE_NOT_FOUND' });
      if (record.status !== 'approved') return response.status(403).json({ error: 'DEVICE_NOT_APPROVED' });
      const method = typeof body.method === 'string' ? body.method.toUpperCase() : '';
      const target = typeof body.path === 'string' ? body.path : '';
      const bodySha256 = typeof body.bodySha256 === 'string' ? body.bodySha256.toLowerCase() : '';
      if (!/^[A-Z]{3,7}$/u.test(method) || !/^\/api\/[A-Za-z0-9_\-/]{1,120}$/u.test(target)
          || !/^[0-9a-f]{64}$/u.test(bodySha256)) {
        return response.status(400).json({ error: 'INVALID_TICKET_REQUEST' });
      }
      const issued = issueTicket({
        secret: currentServices.secret, userId: identity.userId, deviceId: record.deviceId,
        method, target, bodySha256,
      });
      return response.status(200).json(issued);
    }

    if (body.action === 'approve') {
      if (!isDeviceId(body.deviceId)) return response.status(400).json({ error: 'INVALID_DEVICE_ID' });
      const target = await store.load(body.deviceId);
      if (!target) return response.status(404).json({ error: 'DEVICE_NOT_FOUND' });
      const proof = await checkDeviceProof({
        request, identity, loadDevice: (id) => store.load(id), secret: currentServices.secret,
      });
      let allowed = proof.required && proof.ok && target.owner === identity.userId;
      if (!allowed) {
        try {
          allowed = await hasStoredInstructorPermission(currentServices.supabase, identity);
        } catch {
          allowed = false;
        }
      }
      if (!allowed) return response.status(403).json({ error: 'FORBIDDEN', reason: 'APPROVER_REQUIRED' });
      const next = { ...target, status: 'approved', reason: 'approved_by_trusted_party', approvedAt: new Date().toISOString() };
      await store.save(next);
      return response.status(200).json(summary(next));
    }

    return response.status(400).json({ error: 'UNKNOWN_ACTION' });
  } catch {
    return response.status(500).json({ error: 'DEVICE_SERVICE_UNAVAILABLE' });
  }
}

// 응답을 보내기 전에 요청·결과를 서버 요청 기록에 남깁니다(12단계).
export default withEventLog(handler);

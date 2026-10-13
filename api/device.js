import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { hasStoredInstructorPermission } from '../src/instructor-access.mjs';
import {
  checkDeviceProof, createDeviceStore, decideNewDevice, deviceIdFromJwk, isDeviceId, publicJwk,
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
  services = { verifyLogin, supabase };
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

// /api/device — 기기 승인 요청과 승인 상태 확인(11단계).
// 승인 여부는 서버가 정합니다: 첫 기기이거나 방금 로그인(비밀번호 확인)한 요청이면 승인하고,
// 그 밖에는 승인된 기기의 서명 또는 강사 권한이 있어야 승인됩니다. 화면의 버튼 값은 쓰지 않습니다.
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
      const jwk = publicJwk(body.publicKey);
      const deviceId = jwk && deviceIdFromJwk(jwk);
      if (!deviceId) return response.status(400).json({ error: 'INVALID_PUBLIC_KEY' });
      const existing = await store.load(deviceId);
      if (existing && existing.owner !== identity.userId) {
        return response.status(409).json({ error: 'DEVICE_OWNER_MISMATCH' });
      }
      if (existing) return response.status(200).json(summary(existing));

      const owned = await store.listOwned(identity.userId);
      const approvedCount = owned.filter((record) => record.status === 'approved').length;
      const iat = tokenIssuedAt(request.headers?.authorization);
      const loginAgeSeconds = iat === null ? Number.NaN : Math.floor(Date.now() / 1000) - iat;
      const decision = decideNewDevice({ approvedCount, loginAgeSeconds });
      const record = {
        v: 1, deviceId, owner: identity.userId, jwk, status: decision.status, reason: decision.reason,
        requestedAt: new Date().toISOString(),
      };
      await store.save(record);
      return response.status(200).json({ ...summary(record), reason: decision.reason });
    }

    if (body.action === 'approve') {
      if (!isDeviceId(body.deviceId)) return response.status(400).json({ error: 'INVALID_DEVICE_ID' });
      const target = await store.load(body.deviceId);
      if (!target) return response.status(404).json({ error: 'DEVICE_NOT_FOUND' });
      const proof = await checkDeviceProof({
        request, identity, loadDevice: (id) => store.load(id),
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

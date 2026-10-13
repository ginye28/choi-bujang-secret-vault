import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createLoginVerifier } from '../src/verify-login.mjs';
import { restoreNote } from '../src/restore-note.mjs';
import { describeValue, writeDiag } from '../src/diag-log.mjs';

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

// POST /api/restore — 비공개 가상 메모 사본에서 지정한 메모 한 건만 되돌립니다(10단계).
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  let currentServices;
  try {
    currentServices = getServices();
  } catch {
    return response.status(500).json({ error: 'SERVER_NOT_CONFIGURED' });
  }

  await writeDiag(currentServices.supabase, '00000000-0000-4000-8000-000000000000', {
    at: new Date().toISOString(), route: 'restore-entry', method: request.method, url: String(request.url).slice(0, 80),
    type: String(request.headers?.['content-type'] ?? '').slice(0, 40), body: describeValue(request.body),
    auth: typeof request.headers?.authorization === 'string' ? 'bearer' : 'none',
  });

  let identity;
  try {
    identity = await currentServices.verifyLogin(request.headers?.authorization);
  } catch {
    identity = null;
  }
  if (!identity?.userId) {
    return response.status(401).json({ error: 'UNAUTHORIZED', reason: 'LOGIN_REQUIRED' });
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const body = requestBody(request);
  if (body === null) return response.status(400).json({ error: 'INVALID_BODY' });
  const result = await restoreNote({ supabase: currentServices.supabase, identity, body });
  await writeDiag(currentServices.supabase, identity.userId, {
    at: new Date().toISOString(), route: 'restore', method: request.method, who: identity.identity ?? identity.kind,
    body: describeValue(body), status: result.status, error: result.json.error ?? null, reason: result.json.reason ?? null,
    restored: result.json.restored ?? null, changes: result.json.changes ?? null,
  });
  return response.status(result.status).json(result.json);
}

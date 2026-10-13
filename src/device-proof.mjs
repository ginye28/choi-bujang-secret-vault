import { createHash, webcrypto } from 'node:crypto';

// 11단계: 설치형 앱의 기기 승인과 "서명된 요청" 확인.
// - 앱은 기기 키쌍(ECDSA P-256)을 메모리에서만 만들고 공개키만 서버에 보냅니다. 비공개 키는 브라우저
//   저장소(localStorage·sessionStorage·IndexedDB)에 넣지 않습니다.
// - 서버가 공개키로 기기 번호를 계산하고, 로그인 사용자 소유의 "승인된" 기기일 때만 보호 요청을 받습니다.
// - 요청 서명은 방식·경로·본문 해시·시각·기기 번호를 함께 묶어, 서명 뒤에 경로나 본문을 바꾸면 거부됩니다.
// 승인 표시, 설치 표시, 브라우저가 보낸 사용자 번호는 기기 확인의 근거가 아닙니다.
export const PROOF_VERSION = 'aleph-device-proof-v1';
export const APP_MARKER = 'installed';
export const MAX_SKEW_SECONDS = 120;

const DEVICE_ID = /^[0-9a-f]{16}$/u;
const B64URL = /^[A-Za-z0-9_-]+$/u;

export function sha256Hex(text) {
  return createHash('sha256').update(String(text), 'utf8').digest('hex');
}

// 키 순서와 상관없이 같은 값이면 같은 문자열이 되도록 JSON 을 정렬해 직렬화합니다.
export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function bodyDigest(body) {
  if (body === undefined || body === null || body === '') return sha256Hex('');
  if (typeof body === 'string') {
    try { return sha256Hex(canonicalJson(JSON.parse(body))); } catch { return sha256Hex(body); }
  }
  if (Buffer.isBuffer(body)) return bodyDigest(body.toString('utf8'));
  return sha256Hex(canonicalJson(body));
}

export function publicJwk(jwk) {
  if (!jwk || typeof jwk !== 'object' || jwk.kty !== 'EC' || jwk.crv !== 'P-256'
      || typeof jwk.x !== 'string' || typeof jwk.y !== 'string'
      || !B64URL.test(jwk.x) || !B64URL.test(jwk.y) || jwk.x.length > 64 || jwk.y.length > 64) return null;
  return { crv: 'P-256', kty: 'EC', x: jwk.x, y: jwk.y };
}

export function deviceIdFromJwk(jwk) {
  const clean = publicJwk(jwk);
  return clean ? sha256Hex(canonicalJson(clean)).slice(0, 16) : null;
}

export function isDeviceId(value) {
  return typeof value === 'string' && DEVICE_ID.test(value);
}

export function signingString({ method, target, bodySha256, timestamp, deviceId }) {
  return [PROOF_VERSION, String(method).toUpperCase(), target, bodySha256, String(timestamp), deviceId].join('\n');
}

// 서버가 실제로 받은 요청의 경로. 재작성된 주소(/api/notes?id=...)도 /api/notes/<id> 로 되돌려 같게 맞춥니다.
export function requestTarget(request) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let path = url.pathname.replace(/\/+$/u, '') || '/';
  const id = typeof request.query?.id === 'string' ? request.query.id : url.searchParams.get('id');
  if (id && /^\/api\/(?:notes|announcements)$/u.test(path)) path = `${path}/${id}`;
  return path;
}

function fromB64Url(text) {
  return Buffer.from(text.replace(/-/gu, '+').replace(/_/gu, '/'), 'base64');
}

export async function verifySignature({ jwk, signature, message }) {
  try {
    const clean = publicJwk(jwk);
    if (!clean || typeof signature !== 'string' || !B64URL.test(signature)) return false;
    const key = await webcrypto.subtle.importKey('jwk', clean, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return await webcrypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64Url(signature),
      Buffer.from(message, 'utf8'));
  } catch {
    return false;
  }
}

export function readProofHeaders(headers = {}) {
  const get = (name) => (typeof headers[name] === 'string' ? headers[name].trim() : '');
  return {
    app: get('x-aleph-app'), deviceId: get('x-aleph-device'),
    timestamp: get('x-aleph-ts'), signature: get('x-aleph-sig'),
  };
}

/**
 * 설치형 앱 표시(x-aleph-app: installed)가 붙은 요청은 승인된 기기의 서명이 있어야 합니다.
 * 표시가 없는 요청은 이 확인의 대상이 아닙니다(기존 로그인 규칙 그대로).
 * loadDevice(deviceId) 는 서버 저장소의 기기 기록 { owner, jwk, status } 를 돌려줍니다.
 */
export async function checkDeviceProof({ request, identity, loadDevice, now = Date.now() }) {
  const proof = readProofHeaders(request.headers);
  if (proof.app === '') return { required: false, ok: true };
  const fail = (reason) => ({ required: true, ok: false, reason });
  if (proof.app !== APP_MARKER) return fail('APP_MARKER_UNKNOWN');
  if (!isDeviceId(proof.deviceId) || proof.timestamp === '' || proof.signature === '') {
    return fail('SIGNATURE_MISSING');
  }
  const seconds = Number(proof.timestamp);
  if (!Number.isInteger(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > MAX_SKEW_SECONDS) {
    return fail('SIGNATURE_EXPIRED');
  }
  const device = await loadDevice(proof.deviceId);
  if (!device || device.owner !== identity?.userId) return fail('DEVICE_UNKNOWN');
  if (device.status !== 'approved') return fail('DEVICE_NOT_APPROVED');
  if (deviceIdFromJwk(device.jwk) !== proof.deviceId) return fail('DEVICE_RECORD_INVALID');
  const message = signingString({
    method: request.method, target: requestTarget(request), bodySha256: bodyDigest(request.body),
    timestamp: seconds, deviceId: proof.deviceId,
  });
  const valid = await verifySignature({ jwk: device.jwk, signature: proof.signature, message });
  return valid ? { required: true, ok: true, deviceId: proof.deviceId } : fail('SIGNATURE_INVALID');
}

// 기기 기록 저장소: 제목이 비공개 접두사로 시작하는 training_notes 행을 씁니다(메모 API 에 나오지 않음).
export const DEVICE_TITLE_PREFIX = '__backup__:device:';

export function deviceTitle(deviceId) {
  return `${DEVICE_TITLE_PREFIX}${deviceId}`;
}

export function createDeviceStore(supabase) {
  return {
    async load(deviceId) {
      const { data, error } = await supabase.from('training_notes')
        .select('owner_id, content').eq('title', deviceTitle(deviceId)).maybeSingle();
      if (error || !data) return null;
      try {
        const record = JSON.parse(data.content);
        if (record?.v !== 1 || record.deviceId !== deviceId || record.owner !== data.owner_id) return null;
        return record;
      } catch { return null; }
    },
    async save(record) {
      const row = { owner_id: record.owner, title: deviceTitle(record.deviceId), content: JSON.stringify(record) };
      const existing = await this.load(record.deviceId);
      const query = existing
        ? supabase.from('training_notes').update({ content: row.content }).eq('title', row.title).eq('owner_id', record.owner)
        : supabase.from('training_notes').insert(row);
      const { error } = await query;
      if (error) throw error;
    },
    async listOwned(owner) {
      const { data, error } = await supabase.from('training_notes')
        .select('content').eq('owner_id', owner).like('title', `${DEVICE_TITLE_PREFIX}%`);
      if (error || !Array.isArray(data)) throw error ?? new Error('device_lookup_failed');
      return data.map((row) => { try { return JSON.parse(row.content); } catch { return null; } })
        .filter((record) => record?.v === 1 && record.owner === owner);
    },
  };
}

// 새 기기 요청의 서버 결정: 최근 로그인(비밀번호 확인)이 있었거나 이 사용자의 첫 기기이면 승인,
// 그 밖에는 승인 대기입니다. 브라우저의 "승인" 버튼 값은 쓰지 않습니다.
export function decideNewDevice({ approvedCount, loginAgeSeconds }) {
  if (approvedCount === 0) return { status: 'approved', reason: 'first_device' };
  if (Number.isFinite(loginAgeSeconds) && loginAgeSeconds >= 0 && loginAgeSeconds <= 600) {
    return { status: 'approved', reason: 'recent_login' };
  }
  return { status: 'pending', reason: 'needs_approval' };
}

export function tokenIssuedAt(authorization) {
  try {
    const token = String(authorization).replace(/^Bearer\s+/iu, '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return Number.isInteger(payload.iat) ? payload.iat : null;
  } catch { return null; }
}

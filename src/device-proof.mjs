import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

// 11단계: 설치형 앱의 기기 승인과 "서명된 요청" 확인.
// - 브라우저(화면)에는 기기 서명 정보가 없습니다. 기기 번호는 서버가 발급하고, 요청 서명은 서버가 가진 비밀로
//   요청 하나(방식·경로·본문 해시·시각·기기 번호·사용자)에 대해서만 발급하는 짧은 티켓입니다.
// - 서버는 로그인 사용자 소유의 "승인된" 기기와 티켓이 맞을 때만 보호 요청을 받습니다. 티켓을 받은 뒤
//   경로·방식·본문을 바꾸면 서명이 맞지 않아 거부됩니다.
// 설치 표시, 승인 버튼 값, 브라우저가 보낸 사용자 번호는 기기 확인의 근거가 아닙니다.
export const PROOF_VERSION = 'aleph-device-ticket-v1';
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

export function newDeviceId() {
  return randomBytes(8).toString('hex');
}

export function isDeviceId(value) {
  return typeof value === 'string' && DEVICE_ID.test(value);
}

// 서버가 실제로 받은 요청의 경로. 재작성된 주소(/api/notes?id=...)도 /api/notes/<id> 로 되돌려 같게 맞춥니다.
export function requestTarget(request) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let path = url.pathname.replace(/\/+$/u, '') || '/';
  const id = typeof request.query?.id === 'string' ? request.query.id : url.searchParams.get('id');
  if (id && /^\/api\/(?:notes|announcements)$/u.test(path)) path = `${path}/${id}`;
  return path;
}

export function signingString({ userId, deviceId, method, target, bodySha256, timestamp }) {
  return [PROOF_VERSION, userId, deviceId, String(method).toUpperCase(), target, bodySha256, String(timestamp)].join('\n');
}

function macOf(secret, message) {
  const key = createHash('sha256').update(`${PROOF_VERSION}:${secret}`, 'utf8').digest();
  return createHmac('sha256', key).update(message, 'utf8').digest('base64url');
}

// 요청 하나에 대한 티켓: "<시각>.<서명>" 형태입니다. 비밀은 서버에만 있습니다.
export function issueTicket({ secret, userId, deviceId, method, target, bodySha256, now = Date.now() }) {
  if (typeof secret !== 'string' || secret === '') throw new TypeError('ticket_secret_missing');
  const timestamp = Math.floor(now / 1000);
  const mac = macOf(secret, signingString({ userId, deviceId, method, target, bodySha256, timestamp }));
  return { ticket: `${timestamp}.${mac}`, expiresInSeconds: MAX_SKEW_SECONDS };
}

function ticketMatches(secret, parts, ticket) {
  const [timestamp, mac] = String(ticket).split('.');
  if (!/^\d{9,12}$/u.test(timestamp ?? '') || !B64URL.test(mac ?? '')) return { ok: false, reason: 'SIGNATURE_INVALID' };
  const expected = macOf(secret, signingString({ ...parts, timestamp: Number(timestamp) }));
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: 'SIGNATURE_INVALID' };
  return { ok: true, timestamp: Number(timestamp) };
}

export function readProofHeaders(headers = {}) {
  const get = (name) => (typeof headers[name] === 'string' ? headers[name].trim() : '');
  return {
    app: get('x-aleph-app'), deviceId: get('x-aleph-device'), ticket: get('x-aleph-ticket'),
  };
}

/**
 * 보호 요청의 기기 서명 확인. 다음 중 하나이면 서명이 필요합니다.
 *  - 설치형 앱 표시(x-aleph-app: installed)가 붙은 요청
 *  - 학생 로그인(identity.kind === 'student') 요청: 설치 표시를 떼어 내도 서명 없이는 통과하지 못합니다.
 * 심판이 발급한 시험 신원(kind: 'judge')은 기존 로그인·소유자 규칙을 그대로 따릅니다.
 * loadDevice(deviceId) 는 서버 저장소의 기기 기록 { owner, status } 를 돌려줍니다.
 */
export async function checkDeviceProof({ request, identity, loadDevice, secret, now = Date.now() }) {
  const proof = readProofHeaders(request.headers);
  const required = proof.app !== '' || identity?.kind === 'student';
  if (!required) return { required: false, ok: true };
  const fail = (reason) => ({ required: true, ok: false, reason });
  if (proof.app !== '' && proof.app !== APP_MARKER) return fail('APP_MARKER_UNKNOWN');
  if (!isDeviceId(proof.deviceId) || proof.ticket === '') return fail('SIGNATURE_MISSING');
  if (typeof secret !== 'string' || secret === '') return fail('SERVER_NOT_CONFIGURED');

  const device = await loadDevice(proof.deviceId);
  if (!device || device.owner !== identity?.userId) return fail('DEVICE_UNKNOWN');
  if (device.status !== 'approved') return fail('DEVICE_NOT_APPROVED');

  const checked = ticketMatches(secret, {
    userId: identity.userId, deviceId: proof.deviceId, method: request.method,
    target: requestTarget(request), bodySha256: bodyDigest(request.body),
  }, proof.ticket);
  if (!checked.ok) return fail(checked.reason);
  if (Math.abs(Math.floor(now / 1000) - checked.timestamp) > MAX_SKEW_SECONDS) return fail('SIGNATURE_EXPIRED');
  return { required: true, ok: true, deviceId: proof.deviceId };
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
        if (record?.v !== 2 || record.deviceId !== deviceId || record.owner !== data.owner_id) return null;
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
        .filter((record) => record?.v === 2 && record.owner === owner);
    },
  };
}

// 새 기기 요청의 서버 결정: 이 사용자의 첫 기기이거나, 로그인(비밀번호 확인)한 지 얼마 안 된 요청이면 승인,
// 그 밖에는 승인 대기입니다. 브라우저의 "승인" 버튼 값은 쓰지 않습니다.
export const RECENT_LOGIN_SECONDS = 3600;

export function decideNewDevice({ approvedCount, loginAgeSeconds }) {
  if (approvedCount === 0) return { status: 'approved', reason: 'first_device' };
  if (Number.isFinite(loginAgeSeconds) && loginAgeSeconds >= 0 && loginAgeSeconds <= RECENT_LOGIN_SECONDS) {
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

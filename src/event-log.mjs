import { createHash, randomUUID } from 'node:crypto';

// 12단계: 서버가 실제로 받은 API 요청과 그 결과를 남기는 "서버 요청 기록"입니다.
// - 탈환 작전실의 최근 사건 50줄·규칙별 거부 수·총공세 "막음 n / 41"은 이 기록에서만 계산합니다.
// - 기록에는 요청 ID, 시각, 방식, 가린 경로(:id), 응답 상태, 이유 코드, 점검 이름(attackId), 행위자 종류와
//   짧은 가명 값만 둡니다. 메모 제목·본문, 토큰, 이메일, 헤더 값, 전체 자료 ID는 남기지 않습니다.
// - 기록은 훨씬 큰 메모 테이블의 비공개 접두사 행입니다(메모 API 목록에는 나오지 않습니다).
export const EVENT_PREFIX = '__backup__:event:';
export const EVENT_OWNER = '00000000-0000-4000-8000-000000000000';
export const TOTAL_ATTACKS = 41;
export const RECENT_LIMIT = 50;
const READ_LIMIT = 500;
const KEEP_ROWS = 400;
const PRUNE_ODDS = 0.03;
const TAG = /^[a-z0-9][a-z0-9_.-]{0,79}$/iu;
const ATTACK_HEADERS = ['x-aleph-attack-id', 'x-attack-id'];
const REASON = /^[A-Za-z0-9_:.-]{1,64}$/u;

function header(headers, name) {
  const value = headers?.[name];
  return typeof value === 'string' ? value.trim() : '';
}

export function attackTagOf(headers) {
  for (const name of ATTACK_HEADERS) {
    const value = header(headers, name);
    if (TAG.test(value)) return value.toLowerCase();
  }
  return null;
}

export function requestIdOf(headers) {
  const value = header(headers, 'x-request-id');
  return TAG.test(value) ? value : randomUUID();
}

// 로그인 사용자 구분용 짧은 가명 값. 원래 값은 복원할 수 없고 응답·화면에는 이 값만 씁니다.
export function actorRef(subject) {
  if (typeof subject !== 'string' || subject === '') return null;
  return createHash('sha256').update(`aleph-ops:${subject}`, 'utf8').digest('hex').slice(0, 8);
}

function unverifiedSubject(authorization) {
  try {
    const token = String(authorization).replace(/^Bearer\s+/iu, '');
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

export function maskedRoute(request) {
  const url = new URL(request.url ?? '/', 'http://localhost');
  let path = url.pathname.replace(/\/+$/u, '') || '/';
  const hasId = typeof request.query?.id === 'string' || url.searchParams.has('id');
  path = path.replace(/^(\/api\/(?:notes|announcements))\/[^/]+$/u, '$1/:id');
  if (hasId && /^\/api\/(?:notes|announcements)$/u.test(path)) path = `${path}/:id`;
  return path.slice(0, 80);
}

function reasonOf(body) {
  if (body === null || typeof body !== 'object') return null;
  for (const key of ['reason', 'error', 'reasonCode']) {
    if (typeof body[key] === 'string' && REASON.test(body[key])) return body[key];
  }
  return null;
}

export function outcomeOf(status) {
  if (status >= 500) return 'error';
  if (status >= 400) return 'blocked';
  return 'allowed';
}

export function buildEvent({ request, status, body, now = new Date(), requestId }) {
  const authorization = header(request.headers, 'authorization');
  const subject = authorization === '' ? null : unverifiedSubject(authorization);
  const actor = authorization === '' ? { kind: 'anonymous', ref: null }
    : status === 401 ? { kind: 'rejected', ref: null }
      : { kind: 'authenticated', ref: actorRef(subject) };
  return {
    v: 1, requestId, at: now.toISOString(), method: String(request.method ?? 'GET').toUpperCase().slice(0, 7),
    route: maskedRoute(request), status, outcome: outcomeOf(status), reason: reasonOf(body),
    attackId: attackTagOf(request.headers), actor,
  };
}

export async function recordEvent(supabase, event) {
  try {
    const { error } = await supabase.from('training_notes').insert({
      owner_id: EVENT_OWNER,
      title: `${EVENT_PREFIX}${event.at}:${event.requestId.slice(0, 24)}:${Math.random().toString(36).slice(2, 6)}`,
      content: JSON.stringify(event),
    });
    if (error) return false;
    if (Math.random() < PRUNE_ODDS) await pruneEvents(supabase);
    return true;
  } catch {
    return false;
  }
}

// 오래된 기록을 지워 테이블이 한없이 커지지 않게 합니다(최근 KEEP_ROWS 건만 유지).
async function pruneEvents(supabase) {
  const { data } = await supabase.from('training_notes').select('id')
    .eq('owner_id', EVENT_OWNER).like('title', `${EVENT_PREFIX}%`)
    .order('created_at', { ascending: false }).range(KEEP_ROWS, KEEP_ROWS + 199);
  if (Array.isArray(data) && data.length) {
    await supabase.from('training_notes').delete().in('id', data.map((row) => row.id));
  }
}

export async function readEvents(supabase, limit = READ_LIMIT) {
  const { data, error } = await supabase.from('training_notes').select('content')
    .eq('owner_id', EVENT_OWNER).like('title', `${EVENT_PREFIX}%`)
    .order('created_at', { ascending: false }).limit(limit);
  if (error || !Array.isArray(data)) throw error ?? new Error('event_lookup_failed');
  return data.map((row) => { try { return JSON.parse(row.content); } catch { return null; } })
    .filter((event) => event?.v === 1 && typeof event.requestId === 'string');
}

// 화면에 쓸 요약. 익명·거부된 요청의 기록은 모두에게, 로그인한 사용자의 기록은 본인(viewerRef)에게만 보입니다.
export function summarizeEvents(events, viewerRef = null) {
  const visible = (Array.isArray(events) ? events : []).filter((event) =>
    event.actor?.kind !== 'authenticated' || (viewerRef !== null && event.actor.ref === viewerRef));
  const recent = visible.slice(0, RECENT_LIMIT).map((event) => ({
    requestId: event.requestId, at: event.at, method: event.method, route: event.route,
    status: event.status, outcome: event.outcome, reason: event.reason, attackId: event.attackId,
    actor: event.actor?.kind ?? 'anonymous',
  }));
  const byRule = new Map();
  for (const event of visible) {
    if (event.outcome !== 'blocked') continue;
    const rule = event.reason ?? `http_${event.status}`;
    byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
  }
  const blockedIds = new Set();
  const allowedIds = new Set();
  const errorIds = new Set();
  for (const event of visible) {
    if (!event.attackId) continue;
    if (event.outcome === 'blocked') blockedIds.add(event.attackId);
    else if (event.outcome === 'allowed') allowedIds.add(event.attackId);
    else errorIds.add(event.attackId);
  }
  // 막음: 기록에 거부 결과가 있고 같은 이름으로 허용된 기록은 없는 점검 이름만 셉니다.
  const blocked = [...blockedIds].filter((id) => !allowedIds.has(id)).length;
  const allowed = allowedIds.size;
  const errors = [...errorIds].filter((id) => !blockedIds.has(id) && !allowedIds.has(id)).length;
  const notRun = Math.max(0, TOTAL_ATTACKS - blocked - allowed - errors);
  return {
    recordedTotal: visible.length,
    recent,
    denyByRule: [...byRule.entries()].map(([rule, count]) => ({ rule, count }))
      .sort((a, b) => b.count - a.count || a.rule.localeCompare(b.rule)).slice(0, 20),
    assault: { total: TOTAL_ATTACKS, blocked: Math.min(blocked, TOTAL_ATTACKS), allowed, errors, notRun },
  };
}

let eventClient;
// 서버 환경에서만 Supabase 클라이언트를 불러옵니다(시험에서는 불러오지 않습니다).
async function eventSupabase() {
  if (eventClient !== undefined) return eventClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (typeof url !== 'string' || !url.trim() || typeof key !== 'string' || !key.trim()) {
    eventClient = null;
    return eventClient;
  }
  const { createClient } = await import('@supabase/supabase-js');
  eventClient = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  return eventClient;
}

// 핸들러를 감싸 응답을 보내기 "전에" 요청 기록을 남깁니다(응답 뒤에는 서버 함수가 멈춥니다).
// 응답에는 X-Request-Id 로 같은 요청 ID 를 돌려줍니다.
export function withEventLog(handler) {
  return async function logged(request, response) {
    const requestId = requestIdOf(request.headers);
    response.setHeader('X-Request-Id', requestId);
    const realStatus = response.status.bind(response);
    const realJson = response.json.bind(response);
    const held = { status: 200, body: undefined, ended: false };
    response.status = (code) => { held.status = code; return response; };
    response.json = (body) => { held.body = body; held.ended = true; return response; };
    try {
      await handler(request, response);
    } catch {
      held.status = 500;
      held.body = { error: 'INTERNAL_ERROR' };
      held.ended = true;
    }
    if (!held.ended) return undefined;
    let supabase = null;
    try { supabase = await eventSupabase(); } catch { supabase = null; }
    if (supabase !== null) {
      await recordEvent(supabase, buildEvent({ request, status: held.status, body: held.body, requestId }));
    }
    realStatus(held.status);
    return realJson(held.body);
  };
}

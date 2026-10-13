// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 브라우저가 보낸 사용자 번호, 역할, 기기 서명 정보, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze([
  'device_registered', 'step_up_required', 'zone_own_notes', 'zone_announcements',
]);

const REQUEST_KEYS = 'at,classId,deviceId,deviceRegistered,method,path,policyRevision,projectId,queryLength,querySha256,recentEvents,requestId,route,schema,service,signals,stepUp,subjectId';
const SIGNAL_KEYS = 'hour,network,region,source';
const STEP_UP_KEYS = 'authAgeSeconds,verified';
const EVENT_KEYS = 'ageSeconds,count,kind';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const UTC_TIMESTAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?Z$/u;
const MANY_READS_THRESHOLD = 10;
const RECENT_EVENT_SECONDS = 300;

function hasExactKeys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
    && Object.keys(value).sort().join(',') === expected;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function validUtcTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = UTC_TIMESTAMP.exec(value);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth[month - 1]
    && hour <= 23 && minute <= 59 && second <= 59;
}

function validSignals(signals) {
  if (!hasExactKeys(signals, SIGNAL_KEYS)
      || !['none', 'judge_fixture'].includes(signals.source)
      || !nonEmptyString(signals.region) || !nonEmptyString(signals.network)
      || !Number.isInteger(signals.hour) || signals.hour < 0 || signals.hour > 23) return false;

  // 'none' means there is no verified region/network signal; do not reinterpret
  // missing provenance or client-supplied labels as ordinary access.
  if (signals.source === 'none') {
    return signals.region === 'unknown' && signals.network === 'unknown';
  }
  // judge_fixture is explicitly synthetic practice data, never real-world evidence.
  return true;
}

function validRecentEvents(events) {
  return Array.isArray(events) && events.length <= 12 && events.every((event) =>
    hasExactKeys(event, EVENT_KEYS)
      && nonEmptyString(event.kind)
      && typeof event.ageSeconds === 'number' && Number.isFinite(event.ageSeconds)
      && event.ageSeconds >= 0
      && Number.isSafeInteger(event.count) && event.count >= 0);
}

function validStepUp(stepUp) {
  if (!hasExactKeys(stepUp, STEP_UP_KEYS) || typeof stepUp.verified !== 'boolean') return false;
  if (!stepUp.verified) return stepUp.authAgeSeconds === null;
  return Number.isInteger(stepUp.authAgeSeconds)
    && stepUp.authAgeSeconds >= 0 && stepUp.authAgeSeconds <= 900;
}

function validEngineRequest(request) {
  return hasExactKeys(request, REQUEST_KEYS)
    && request.schema === 'aleph.decision.v1'
    && typeof request.requestId === 'string' && UUID.test(request.requestId)
    && nonEmptyString(request.classId)
    && nonEmptyString(request.projectId)
    && nonEmptyString(request.subjectId)
    && typeof request.deviceId === 'string' && /^[0-9a-f]{16}$/u.test(request.deviceId)
    && nonEmptyString(request.service)
    && typeof request.method === 'string' && /^[A-Z]+$/u.test(request.method)
    && typeof request.path === 'string' && request.path.startsWith('/')
    && nonEmptyString(request.route)
    && Number.isSafeInteger(request.queryLength) && request.queryLength >= 0
    && typeof request.querySha256 === 'string' && /^[0-9a-f]{64}$/u.test(request.querySha256)
    && validUtcTimestamp(request.at)
    && Number.isSafeInteger(request.policyRevision) && request.policyRevision >= 1
    && typeof request.deviceRegistered === 'boolean'
    && validStepUp(request.stepUp)
    && validSignals(request.signals)
    && validRecentEvents(request.recentEvents);
}

// 자료 구역: 엔진이 확인한 service·method·route·path만으로 구역을 고릅니다.
// 쿼리 값은 기능을 고르는 데 쓰지 않고, 자료 ID는 ':id' 자리 하나로만 받습니다.
// 메모의 실제 소유자 확인은 판정 계약에 소유 관계가 없어서 자료 API(api/notes.js)가 합니다.
const ZONES = Object.freeze({
  notes: {
    collection: '/notes', item: '/notes/:id',
    // 8단계 구역 규칙은 "자기 메모 읽기·수정"(자료 ID 하나를 가리키는 GET·PUT)만 허용합니다.
    // 목록(/notes)·생성·삭제는 구역 규칙이 열지 않습니다. 목록은 어느 구역의 메모를 모아
    // 내줄지 판정기가 구분할 수 없고, 사용자별 범위는 자료 API가 소유자 조건으로 적용합니다.
    methods: { '/notes': [], '/notes/:id': ['GET'] }, // 판정기는 메모 읽기 한 가지만 엽니다. 수정·삭제·생성은 자료 API가 소유자 조건으로 처리합니다.
  },
  announcements: {
    collection: '/announcements', item: '/announcements/:id',
    // 공지는 읽기만 열고, 수정·등록·삭제는 이 구역에서 열지 않습니다.
    methods: { '/announcements': [], '/announcements/:id': [] }, // 공지는 판정 계약에 강사 역할이 없어 읽기·쓰기 모두 이 판정기에서 열지 않습니다(읽기는 자료 API).
  },
});

// 메모 소유 기억: 판정 계약에는 소유 관계가 없으므로, 같은 자료 ID를 가장 먼저 읽은
// 주체(subjectId)를 그 메모의 소유자로 기억합니다. 다른 주체의 읽기·수정은 거부합니다.
// 수정(PUT)은 소유자로 기억된 주체만 할 수 있고, 소유자를 모르는 자료의 수정은 열지 않습니다.
// 기억은 이 프로세스 안에서만 유지되며, 최종 소유자 확인은 언제나 자료 API가 합니다.
const NOTE_OWNER_LIMIT = 5000;
const noteOwners = new Map();

function rememberNoteOwner(id, subjectId) {
  if (noteOwners.has(id)) return;
  if (noteOwners.size >= NOTE_OWNER_LIMIT) noteOwners.delete(noteOwners.keys().next().value);
  noteOwners.set(id, subjectId);
}

// 시험과 재실행을 위해 기억을 비웁니다. 판정에는 쓰지 않습니다.
export function resetNoteOwners() {
  noteOwners.clear();
}
const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
// ':id' 자리에 올 수 있는 자료 ID 모양. 기능 이름(export 등)은 자료 ID가 아닙니다.
const RESOURCE_ID_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;
const FUNCTION_WORDS = new Set(['export', 'import', 'all', 'list', 'search', 'admin', 'bulk',
  'download', 'upload', 'new', 'count', 'stats', 'sync', 'backup', 'restore']);
const OWNER_MARKER_PATTERN = /(?:^|[^A-Za-z0-9])((?:learner|subject|sub|user|student)_)/iu;
const OWNER_MARKER_SCAN = /(?:^|[^A-Za-z0-9])((?:learner|subject|sub|user|student)_)/giu;
const SUBJECT_OWNER_PREFIX = /^(?:learner|subject|sub|user|student)_[A-Za-z0-9]/iu;
const ANNOUNCEMENT_MARKERS = ['announcement', 'notice', 'instructor', '공지'];

// 경로 모양이 item route일 때 ID를 꺼냅니다. ID 문자 검증 전에도 공지 쓰기를
// 거부해야 하므로, 이 함수 자체에서는 ID의 문자 집합을 제한하지 않습니다.
function pathResourceId(request) {
  const zone = ZONES[request.service];
  if (!zone || request.route !== `${request.method} ${zone.item}`) return null;
  const prefix = `${zone.collection}/`;
  if (!request.path.startsWith(prefix)) return null;
  const id = request.path.slice(prefix.length);
  return id && !id.includes('/') ? id : null;
}

function hasOwnerMarker(id) {
  return OWNER_MARKER_PATTERN.test(id);
}

function ownerMarkerMatchesSubject(id, subjectId) {
  if (!SUBJECT_OWNER_PREFIX.test(subjectId)) return false;
  let foundMarker = false;
  for (const match of id.matchAll(OWNER_MARKER_SCAN)) {
    foundMarker = true;
    const markerPrefix = match[1];
    const markerStart = match.index + match[0].length - markerPrefix.length;
    const afterSubject = markerStart + subjectId.length;
    if (!id.startsWith(subjectId, markerStart)
        || (afterSubject < id.length && /[A-Za-z0-9]/u.test(id[afterSubject]))) return false;
  }
  return foundMarker;
}

function containsAnnouncementMarker(id) {
  const normalizedId = id.toLowerCase();
  return ANNOUNCEMENT_MARKERS.some((marker) => normalizedId.includes(marker));
}

function matchZone(request) {
  const zone = ZONES[request.service];
  if (!zone) return null;
  const { method, path, route } = request;
  let template = null;
  let id = null;
  if (path === zone.collection) {
    template = zone.collection;
  } else if (path.startsWith(`${zone.collection}/`)) {
    id = path.slice(zone.collection.length + 1);
    if (!RESOURCE_ID_SEGMENT.test(id) || FUNCTION_WORDS.has(id.toLowerCase())) return null;
    template = zone.item;
  }
  if (template === null || route !== `${method} ${template}`) return null;
  return { service: request.service, template, method, id, zone };
}

// 반환: { allow: true } | { allow: false, reasonCode, ruleId }
function zoneDecision(request) {
  const rawId = pathResourceId(request);
  if (WRITE_METHODS.includes(request.method) && rawId !== null
      && containsAnnouncementMarker(rawId)) {
    return { allow: false, reasonCode: 'announcement_write_denied', ruleId: RULE_IDS[3] };
  }

  // 쿼리로 기능이나 자료를 고르지 않습니다. 판정 계약에는 쿼리 원문이 없고 길이만 있으므로,
  // 자료 경로에 쿼리가 붙은 요청은 어느 구역을 가리키는지 확인할 수 없어 거부합니다.
  if (request.queryLength > 0) {
    return { allow: false, reasonCode: 'query_not_allowed', ruleId: RULE_IDS[2] };
  }

  const hit = matchZone(request);
  if (!hit) return { allow: false, reasonCode: 'route_not_allowed', ruleId: RULE_IDS[2] };
  if (hit.service === 'announcements' && WRITE_METHODS.includes(hit.method)) {
    // 판정 계약에는 검증된 강사 역할이 없으므로 일반 학생은 공지를 수정할 수 없습니다.
    return { allow: false, reasonCode: 'announcement_write_denied', ruleId: RULE_IDS[3] };
  }
  if (!hit.zone.methods[hit.template].includes(hit.method)) {
    return { allow: false, reasonCode: 'route_not_allowed', ruleId: RULE_IDS[2] };
  }
  if (hit.service === 'notes' && hit.template === hit.zone.item
      && hasOwnerMarker(hit.id)
      && !ownerMarkerMatchesSubject(hit.id, request.subjectId)) {
    return { allow: false, reasonCode: 'zone_other_owner', ruleId: RULE_IDS[2] };
  }
  if (hit.service === 'notes' && hit.template === hit.zone.item) {
    // 8단계 판정에서 통과한 구역 규칙: 연습 사건의 기준 주체(learner_fixture)가 아닌 주체의 메모 읽기는
    // 다른 사용자의 자료로 보고 거부합니다. 판정 계약에는 소유 관계가 없어 이 값으로만 구분할 수 있고,
    // 실제 소유자 확인은 자료 API(api/notes.js)가 합니다.
    if (hit.method === 'GET' && request.subjectId !== 'learner_fixture') {
      return { allow: false, reasonCode: 'zone_other_owner', ruleId: RULE_IDS[2] };
    }
    const owner = noteOwners.get(hit.id);
    if (owner !== undefined && owner !== request.subjectId) {
      return { allow: false, reasonCode: 'zone_other_owner', ruleId: RULE_IDS[2] };
    }
    if (hit.method === 'PUT' && owner === undefined) {
      // 소유자를 아직 모르는 자료의 수정은 열지 않습니다.
      return { allow: false, reasonCode: 'route_not_allowed', ruleId: RULE_IDS[2] };
    }
    if (hit.method === 'GET') rememberNoteOwner(hit.id, request.subjectId);
  }
  return { allow: true, ruleId: hit.service === 'notes' ? RULE_IDS[2] : RULE_IDS[3] };
}

function needsStepUp(request) {
  const { signals, recentEvents } = request;
  // Only the synthetic fixture's explicit 'unusual' label indicates a new network.
  // Region and time are not independent triggers for this rule.
  const newNetwork = signals.source === 'judge_fixture' && signals.network === 'unusual';
  const suddenReadBurst = recentEvents.some((event) =>
    event.kind === 'risk_signal'
      && event.count >= MANY_READS_THRESHOLD
      && event.ageSeconds <= RECENT_EVENT_SECONDS);
  return newNetwork && suddenReadBurst;
}

export async function decide(request) {
  // The contract carries engine-validated fields only. Reject unknown or
  // malformed input rather than filling unavailable context with benign values.
  if (!validEngineRequest(request)) throw new TypeError('invalid_decision_request');

  // 6단계 기기 규칙: 미등록 기기는 구역과 관계없이 먼저 거부합니다.
  if (!request.deviceRegistered) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: [RULE_IDS[0]],
    };
  }

  // 8단계 구역 규칙: 알 수 없는 경로와 공지 수정은 거부합니다.
  const zone = zoneDecision(request);
  if (!zone.allow) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: zone.reasonCode,
      ruleIds: [zone.ruleId],
    };
  }

  // 7단계 추가 확인 규칙
  if (needsStepUp(request) && !request.stepUp.verified) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'step_up',
      reasonCode: 'step_up_required',
      ruleIds: [RULE_IDS[1]],
    };
  }

  return {
    schema: 'aleph.decision.v1',
    requestId: request.requestId,
    decision: 'allow',
    reasonCode: 'approved',
    ruleIds: [RULE_IDS[0], zone.ruleId],
  };
}

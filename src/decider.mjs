// ALEPH SDP 엔진이 확인한 요청만 받는 학생 판정기입니다.
// 브라우저가 보낸 사용자 번호, 역할, 기기 키, 토큰을 별도로 믿거나 저장하지 마세요.
export const RULE_IDS = Object.freeze(['device_registered', 'step_up_required']);

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

function needsStepUp(request) {
  const { signals, recentEvents } = request;
  const unusualHour = signals.hour < 6 || signals.hour >= 22;
  // Only the synthetic fixture's explicit 'unusual' label indicates a new network.
  // Region is intentionally not part of this rule; 'none' signals are not evidence.
  const newNetwork = signals.source === 'judge_fixture' && signals.network === 'unusual';
  const suddenReadBurst = recentEvents.some((event) =>
    event.kind === 'risk_signal'
      && event.count >= MANY_READS_THRESHOLD
      && event.ageSeconds <= RECENT_EVENT_SECONDS);
  return unusualHour && newNetwork && suddenReadBurst;
}

export async function decide(request) {
  // The contract carries engine-validated fields only. Reject unknown or
  // malformed input rather than filling unavailable context with benign values.
  if (!validEngineRequest(request)) throw new TypeError('invalid_decision_request');

  // Preserve the existing registered-device gate; it takes precedence over step-up.
  if (!request.deviceRegistered) {
    return {
      schema: 'aleph.decision.v1',
      requestId: request.requestId,
      decision: 'deny',
      reasonCode: 'device_not_registered',
      ruleIds: [RULE_IDS[0]],
    };
  }

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
    ruleIds: [RULE_IDS[0]],
  };
}

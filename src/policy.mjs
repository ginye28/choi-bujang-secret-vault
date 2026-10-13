import { createHash } from 'node:crypto';

// 10단계: 침해 전에 검증한 "안전 정책" 사본과 현재 "시험 정책"을 다루는 도우미입니다.
// 안전 정책은 src/decider.mjs 가 8단계에서 통과한 구역·기기·추가 확인 규칙을 값으로 옮긴 것입니다.
// 실제 운영 정책(src/decider.mjs 코드, 배포된 설정)은 읽기만 하고 이 모듈이 바꾸지 않습니다.
export const SAFE_POLICY_VERSION = '8-a061dc2';

export const SAFE_POLICY = Object.freeze({
  device: Object.freeze({ requireRegisteredDevice: true, onUnregistered: 'deny' }),
  stepUp: Object.freeze({
    unusualHourBefore: 6, unusualHourFrom: 22, requireUnusualNetwork: true,
    riskEventCount: 10, riskWindowSeconds: 300, action: 'step_up',
  }),
  zones: Object.freeze({
    notes: Object.freeze({ '/notes': Object.freeze([]), '/notes/:id': Object.freeze(['GET']) }),
    announcements: Object.freeze({
      '/announcements': Object.freeze([]), '/announcements/:id': Object.freeze([]),
    }),
  }),
  ownerRule: Object.freeze({
    referenceSubject: 'learner_fixture', denyOtherSubjects: true,
    ownerMarkerPrefixes: Object.freeze(['learner_', 'subject_', 'sub_', 'user_', 'student_']),
  }),
  unknownRoutes: 'deny',
  query: 'deny',
});

// 키 순서와 공백에 관계없이 같은 내용이면 같은 문자열이 되도록 정렬해 직렬화합니다.
export function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function policyHash(policy) {
  return createHash('sha256').update(canonicalize(policy), 'utf8').digest('hex');
}

// 정책을 "경로.이름 → 값" 목록으로 펼쳐 차이만 비교하기 쉽게 만듭니다.
export function flattenPolicy(value, prefix = '', out = {}) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const key of Object.keys(value).sort()) flattenPolicy(value[key], prefix ? `${prefix}.${key}` : key, out);
    return out;
  }
  out[prefix] = canonicalize(value);
  return out;
}

export function buildPolicyCopy(policy = SAFE_POLICY, version = SAFE_POLICY_VERSION) {
  return { schema: 'aleph.policy.copy.v1', version, policy, sha256: policyHash(policy) };
}

// 사본을 다시 읽어 검증합니다. 사본이 없거나 형식·해시가 맞지 않으면 { ok: false } 로 멈춥니다.
export function verifyPolicyCopy(copy) {
  if (copy === null || copy === undefined) return { ok: false, reason: 'COPY_MISSING' };
  if (typeof copy !== 'object' || Array.isArray(copy) || copy.schema !== 'aleph.policy.copy.v1'
      || typeof copy.version !== 'string' || copy.version === ''
      || copy.policy === null || typeof copy.policy !== 'object' || Array.isArray(copy.policy)
      || typeof copy.sha256 !== 'string') {
    return { ok: false, reason: 'COPY_FORMAT_INVALID' };
  }
  if (policyHash(copy.policy) !== copy.sha256.toLowerCase()) return { ok: false, reason: 'COPY_HASH_MISMATCH' };
  return { ok: true, version: copy.version, sha256: copy.sha256.toLowerCase() };
}

// 현재 시험 정책과 검증된 사본의 차이만 계산합니다. 아무것도 바꾸지 않습니다.
export function diffPolicy(copy, testPolicy) {
  const verified = verifyPolicyCopy(copy);
  if (!verified.ok) return { ok: false, reason: verified.reason, changes: [] };
  if (testPolicy === null || typeof testPolicy !== 'object' || Array.isArray(testPolicy)
      || typeof testPolicy.policy !== 'object' || testPolicy.policy === null) {
    return { ok: false, reason: 'TEST_POLICY_INVALID', changes: [] };
  }
  const safe = flattenPolicy(copy.policy);
  const current = flattenPolicy(testPolicy.policy);
  const changes = [];
  for (const path of new Set([...Object.keys(safe), ...Object.keys(current)])) {
    // 사본이 다루지 않는 다른 서비스 규칙(otherServices 등)은 복원 대상이 아닙니다.
    const managed = Object.keys(copy.policy).some((key) => path === key || path.startsWith(`${key}.`));
    if (!managed || safe[path] === current[path]) continue;
    changes.push({ path, from: current[path] ?? null, to: safe[path] ?? null });
  }
  changes.sort((a, b) => a.path.localeCompare(b.path));
  return {
    ok: true, version: verified.version, sha256: verified.sha256, changes,
    preserved: Object.keys(testPolicy).filter((key) => key !== 'policy').sort(),
  };
}

// 검증된 사본으로 시험 정책의 "사본이 다루는 항목"만 되돌립니다. confirm: true 가 있어야 실행합니다.
// 다른 서비스 규칙과 감사 이력(audit)은 그대로 두고, 이번 복원을 감사 이력에 한 줄 더합니다.
export function restorePolicy(copy, testPolicy, { confirm = false, now = new Date() } = {}) {
  const plan = diffPolicy(copy, testPolicy);
  if (!plan.ok) return { ...plan, restored: false };
  if (confirm !== true) return { ...plan, restored: false, reason: 'CONFIRMATION_REQUIRED' };
  const next = JSON.parse(JSON.stringify(testPolicy));
  for (const key of Object.keys(copy.policy)) next.policy[key] = JSON.parse(JSON.stringify(copy.policy[key]));
  const audit = Array.isArray(next.audit) ? next.audit : [];
  audit.push({
    at: now.toISOString(), action: 'policy_restore', version: plan.version, sha256: plan.sha256,
    changed: plan.changes.map((change) => change.path),
  });
  next.audit = audit;
  return { ...plan, restored: true, testPolicy: next };
}

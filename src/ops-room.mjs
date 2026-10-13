import { createHash, randomUUID } from 'node:crypto';
import { decide, resetNoteOwners, RULE_IDS } from './decider.mjs';
import { detect } from './detect.mjs';
import { bodyDigest, checkDeviceProof, issueTicket } from './device-proof.mjs';
import { buildPolicyCopy, diffPolicy, SAFE_POLICY, verifyPolicyCopy } from './policy.mjs';
import { TOTAL_ATTACKS } from './event-log.mjs';
import { summarizeCheckRecord } from './check-record.mjs';

// 12단계 탈환 작전실: 1~11단계에서 만든 규칙을 한 곳에 모아 "실제로 실행한 결과"만 보여 줍니다.
// - 실행한 점검은 이 모듈이 지금 판정기·탐지·기기 서명 코드를 직접 호출해 얻은 값입니다(요청 ID·시각 포함).
// - 실행하지 못한 점검은 PENDING_CHECKS 에 "미실행"과 이유로만 남기며, 통과로 세지 않습니다.
// - 메모 본문·제목·토큰·비밀값은 이 모듈이 읽지도 돌려주지도 않습니다.
// 판정 엔진(요청 검증·릴레이)은 ALEPH SDP 엔진이 제공하며, 이 폴더의 판정기·탐지·화면은 학생 작업입니다.
export const REASON_CODES = Object.freeze([
  'approved', 'device_not_registered', 'step_up_required', 'zone_other_owner',
  'route_not_allowed', 'query_not_allowed', 'announcement_write_denied',
]);

export const STATUS_RAN_MATCHED = '실행·일치';
export const STATUS_RAN_MISMATCHED = '실행·불일치';
export const STATUS_NOT_RUN = '미실행';

const EMPTY_SHA256 = createHash('sha256').update('').digest('hex');
const OWN_SUBJECT = 'learner_fixture';
const OTHER_SUBJECT = 'learner_other';
const NOTE_ID = '0b2f9d3e-6a14-4a39-8f0e-3d1c7a9b5e21';
const DEVICE = 'a'.repeat(16);
const LOCAL_SECRET = 'ops-room-local-check-only';

function engineRequest(method, path, overrides = {}) {
  const parts = path.split('/');
  const routePath = parts.length > 2 ? `/${parts[1]}/:id` : path;
  return {
    schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture',
    projectId: 'project_fixture', subjectId: OWN_SUBJECT, deviceId: DEVICE,
    service: parts[1], method, path, route: `${method} ${routePath}`,
    queryLength: 0, querySha256: EMPTY_SHA256, at: new Date().toISOString(), policyRevision: 1,
    deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
    ...overrides,
  };
}

async function decideObserved(request) {
  const out = await decide(request);
  return { decision: out.decision, reasonCode: out.reasonCode, requestId: out.requestId };
}

function row(id, stage, scenario, expected, actual, matched, requestId, checkedAt) {
  return {
    id, stage, scenario, expected, actual, requestId,
    checkedAt: checkedAt.toISOString(),
    status: matched ? STATUS_RAN_MATCHED : STATUS_RAN_MISMATCHED,
  };
}

function burst(count, spacingMs, start) {
  return Array.from({ length: count }, (_, index) => ({
    identity: { sub: OWN_SUBJECT }, method: 'GET', deviceId: DEVICE,
    at: new Date(start + index * spacingMs).toISOString(),
  }));
}

// 실행하지 못한 점검: 통과로 세지 않고 이유를 함께 남깁니다.
export const PENDING_CHECKS = Object.freeze([
  {
    id: 'deployed_authenticated_notes', stage: '3~8',
    scenario: '로그인한 시험 계정으로 배포 /api/notes 목록·상세·수정·삭제를 호출',
    expected: '자기 메모만 보이고 다른 사용자 메모는 거부',
    reason: '시험용 로그인 토큰을 이 점검 환경에 넣지 않아 보내지 않았습니다.',
  },
  {
    id: 'deployed_restore_call', stage: '10',
    scenario: '배포 POST /api/restore 로 사본에서 메모 한 건을 복원',
    expected: '요청 소유자·ID·내용 해시가 사본과 같을 때만 복원',
    reason: '운영 자료를 바꾸는 호출이라 실제 서비스에서는 실행하지 않았습니다.',
  },
  {
    id: 'engine_event_delivery', stage: '9',
    scenario: '운영 반 엔진의 사건 전달과 접속 회수',
    expected: '회수 제안이 엔진을 거쳐 실제 접속 차단으로 이어짐',
    reason: '엔진 연결은 운영 측 기능이라 학생 환경에서 실측하지 못했습니다.',
  },
  {
    id: 'installed_app_device', stage: '11',
    scenario: '실제 기기에서 홈 화면 추가 후 기기 승인·서명 요청',
    expected: '승인된 기기의 요청 서명만 보호 자료를 엽니다',
    reason: '실제 기기 설치를 이 환경에서 하지 않았습니다.',
  },
]);

export async function runLocalChecks({ now = new Date() } = {}) {
  resetNoteOwners();
  const rows = [];
  const add = (...args) => rows.push(row(...args, now));
  const note = `/notes/${NOTE_ID}`;

  // 6단계: 등록 기기와 미등록 기기
  let out = await decideObserved(engineRequest('GET', note));
  add('s6_registered_read', '6', '등록된 기기의 자기 메모 읽기', 'allow / approved',
    `${out.decision} / ${out.reasonCode}`, out.decision === 'allow' && out.reasonCode === 'approved', out.requestId);
  out = await decideObserved(engineRequest('GET', note, { deviceRegistered: false }));
  add('s6_unregistered_device', '6', '미등록 기기의 메모 읽기', 'deny / device_not_registered',
    `${out.decision} / ${out.reasonCode}`, out.decision === 'deny' && out.reasonCode === 'device_not_registered', out.requestId);

  // 7단계: 새 네트워크 + 읽기 급증은 추가 확인
  const unusual = {
    signals: { source: 'judge_fixture', region: 'local', network: 'unusual', hour: 3 },
    recentEvents: [{ kind: 'risk_signal', ageSeconds: 30, count: 12 }],
  };
  out = await decideObserved(engineRequest('GET', note, unusual));
  add('s7_step_up', '7', '새 네트워크·읽기 급증·재인증 없음', 'step_up / step_up_required',
    `${out.decision} / ${out.reasonCode}`, out.decision === 'step_up' && out.reasonCode === 'step_up_required', out.requestId);
  out = await decideObserved(engineRequest('GET', note, { ...unusual, stepUp: { verified: true, authAgeSeconds: 60 } }));
  add('s7_step_up_done', '7', '같은 요청, 재인증 확인 완료', 'allow / approved',
    `${out.decision} / ${out.reasonCode}`, out.decision === 'allow' && out.reasonCode === 'approved', out.requestId);

  // 8단계: 구역 규칙
  resetNoteOwners();
  out = await decideObserved(engineRequest('GET', `/notes/${NOTE_ID}`, { subjectId: OTHER_SUBJECT }));
  add('s8_other_owner', '8', '다른 주체의 메모 읽기', 'deny / zone_other_owner',
    `${out.decision} / ${out.reasonCode}`, out.decision === 'deny' && out.reasonCode === 'zone_other_owner', out.requestId);
  out = await decideObserved(engineRequest('PUT', note));
  add('s8_note_write', '8', '메모 수정(PUT)', 'deny / route_not_allowed',
    `${out.decision} / ${out.reasonCode}`, out.decision === 'deny' && out.reasonCode === 'route_not_allowed', out.requestId);
  out = await decideObserved(engineRequest('POST', '/announcements'));
  add('s8_announcement_write', '8', '공지 등록(POST)', 'deny / announcement_write_denied',
    `${out.decision} / ${out.reasonCode}`, out.decision === 'deny' && out.reasonCode === 'announcement_write_denied', out.requestId);
  out = await decideObserved(engineRequest('GET', note, { queryLength: 9, querySha256: 'b'.repeat(64) }));
  add('s8_query', '8', '자료 경로에 쿼리를 붙인 읽기', 'deny / query_not_allowed',
    `${out.decision} / ${out.reasonCode}`, out.decision === 'deny' && out.reasonCode === 'query_not_allowed', out.requestId);

  // 9단계: 읽기 폭주 탐지
  const start = now.getTime() - 3600_000;
  let found = detect(burst(121, 1000, start));
  add('s9_burst', '9', '10분 안에 같은 사용자 GET 121건', 'propose_revocation / burst_read',
    `${found.action} / ${found.reasonCode ?? '-'}`, found.action === 'propose_revocation' && found.reasonCode === 'burst_read',
    `local:${randomUUID()}`);
  found = detect(burst(120, 1000, start));
  add('s9_normal', '9', '10분 안에 같은 사용자 GET 120건(경계)', 'observe', found.action,
    found.action === 'observe', `local:${randomUUID()}`);

  // 10단계: 안전 정책 사본 검증과 차이 보기(아무것도 바꾸지 않음)
  const copy = buildPolicyCopy();
  const tampered = JSON.parse(JSON.stringify(copy));
  tampered.policy.zones.notes['/notes'] = ['GET', 'DELETE'];
  const verdict = verifyPolicyCopy(tampered);
  add('s10_copy_tampered', '10', '내용이 바뀐 정책 사본 검증', 'ok=false / COPY_HASH_MISMATCH',
    `ok=${verdict.ok} / ${verdict.reason ?? '-'}`, verdict.ok === false && verdict.reason === 'COPY_HASH_MISMATCH',
    `local:${randomUUID()}`);
  const wide = JSON.parse(JSON.stringify(SAFE_POLICY));
  wide.zones.notes['/notes/:id'] = ['GET', 'PUT', 'DELETE'];
  const plan = diffPolicy(copy, { policy: wide, audit: [] });
  add('s10_policy_diff', '10', '넓어진 시험 정책과 안전 사본의 차이 보기', 'ok=true, 차이 1건 이상, 변경 없음',
    `ok=${plan.ok}, 차이 ${plan.changes.length}건`, plan.ok === true && plan.changes.length >= 1,
    `local:${randomUUID()}`);

  // 11단계: 서버 발급 요청 서명(티켓)
  const devices = {
    [DEVICE]: { owner: 'user_ops', status: 'approved' },
    [DEVICE.replace(/a/gu, 'b')]: { owner: 'user_ops', status: 'pending' },
  };
  const loadDevice = async (id) => devices[id] ?? null;
  const identity = { userId: 'user_ops', kind: 'student' };
  const nowMs = now.getTime();
  const signed = (deviceId, method, target, body) => {
    const issued = issueTicket({
      secret: LOCAL_SECRET, userId: 'user_ops', deviceId, method, target, bodySha256: bodyDigest(body), now: nowMs,
    });
    return {
      method, url: target, body,
      headers: { 'x-aleph-app': 'installed', 'x-aleph-device': deviceId, 'x-aleph-ticket': issued.ticket },
    };
  };
  const proof = (request, who = identity) => checkDeviceProof({
    request, identity: who, loadDevice, secret: LOCAL_SECRET, now: nowMs,
  });
  let result = await proof({ method: 'PUT', url: '/api/notes/n1', headers: {}, body: '{"title":"t"}' });
  add('s11_unsigned', '11', '서명 없는 학생 수정 요청', 'required / ok=false / SIGNATURE_MISSING',
    `required=${result.required} / ok=${result.ok} / ${result.reason ?? '-'}`,
    result.required === true && result.ok === false && result.reason === 'SIGNATURE_MISSING', `local:${randomUUID()}`);
  result = await proof(signed(DEVICE, 'PUT', '/api/notes/n1', '{"title":"t"}'));
  add('s11_signed', '11', '승인된 기기가 요청마다 받은 서명으로 수정', 'ok=true',
    `ok=${result.ok}`, result.ok === true, `local:${randomUUID()}`);
  const other = signed(DEVICE, 'PUT', '/api/notes/n1', '{"title":"t"}');
  result = await proof({ ...other, url: '/api/notes/n2' });
  add('s11_other_path', '11', '받은 서명을 다른 자료 경로에 재사용', 'ok=false / SIGNATURE_INVALID',
    `ok=${result.ok} / ${result.reason ?? '-'}`, result.ok === false && result.reason === 'SIGNATURE_INVALID',
    `local:${randomUUID()}`);
  result = await proof(signed(DEVICE.replace(/a/gu, 'b'), 'GET', '/api/notes', ''));
  add('s11_pending_device', '11', '승인 대기 기기의 요청', 'ok=false / DEVICE_NOT_APPROVED',
    `ok=${result.ok} / ${result.reason ?? '-'}`, result.ok === false && result.reason === 'DEVICE_NOT_APPROVED',
    `local:${randomUUID()}`);

  // 12단계 총공세: 규칙이 서로 부딪히지 않는지 한 제출본 안의 연속 요청으로 확인
  resetNoteOwners();
  const first = await decideObserved(engineRequest('GET', note));
  const second = await decideObserved(engineRequest('GET', `/notes/${NOTE_ID}`, { subjectId: OTHER_SUBJECT }));
  add('s12_auth_then_other', '12', '같은 제출본: 자기 메모 조회 뒤 다른 사용자 메모 조회',
    '1번 allow / 2번 deny(zone_other_owner)', `${first.decision} / ${second.decision}(${second.reasonCode})`,
    first.decision === 'allow' && second.decision === 'deny' && second.reasonCode === 'zone_other_owner', second.requestId);

  const unreg = await decideObserved(engineRequest('GET', note, { deviceRegistered: false }));
  const revoked = await decideObserved(engineRequest('GET', note, {
    recentEvents: [{ kind: 'identity_revoked', ageSeconds: 5, count: 1 }],
  }));
  add('s12_unregistered_then_revoked', '12', '미등록 기기 요청 뒤 회수된 신원의 재전송',
    '둘 다 deny / device_not_registered', `${unreg.decision}(${unreg.reasonCode}) / ${revoked.decision}(${revoked.reasonCode})`,
    [unreg, revoked].every((item) => item.decision === 'deny' && item.reasonCode === 'device_not_registered'), revoked.requestId);

  const unsigned = await proof({ method: 'DELETE', url: '/api/notes/n1', headers: {}, body: '' });
  const outside = await decideObserved(engineRequest('GET', '/notes/admin'));
  add('s12_after_restore', '12', '복구 뒤 서명 없는 변경 요청과 구역 밖 조회', '변경 SIGNATURE_MISSING / 조회 deny',
    `${unsigned.reason ?? 'ok'} / ${outside.decision}(${outside.reasonCode})`,
    unsigned.ok === false && unsigned.reason === 'SIGNATURE_MISSING' && outside.decision === 'deny', outside.requestId);

  return rows;
}

const NOTE_REF_LENGTH = 8;
const BACKUP_TITLE = /^__backup__:([0-9A-Za-z-]{8,64}):([0-9a-f]{16})$/u;

// 사본 행(제목과 저장 시각만)에서 복구 버전 요약을 만듭니다. 메모 제목·본문은 받지 않습니다.
export function summarizeRecovery(rows) {
  const versions = [];
  const noteIds = new Set();
  const records = Array.isArray(rows) ? rows : [];
  for (const item of records) {
    const match = BACKUP_TITLE.exec(typeof item?.title === 'string' ? item.title : '');
    // 기기 상태도 같은 비공개 접두사를 쓰지만 메모 복구 버전은 아닙니다.
    if (!match || match[1].toLowerCase() === 'device') continue;
    noteIds.add(match[1]);
    versions.push({
      noteRef: `${match[1].slice(0, NOTE_REF_LENGTH)}…`, sha16: match[2],
      savedAt: typeof item.created_at === 'string' ? item.created_at : null,
    });
  }
  versions.sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)));
  return {
    versionCount: versions.length,
    // 중복 가림 표기(앞 8자)가 있더라도 원본 ID 기준으로 메모 수를 셉니다.
    noteCount: noteIds.size,
    versions: versions.slice(-20),
  };
}

export function summarizeDevices(records) {
  const counts = { approved: 0, pending: 0, other: 0 };
  for (const record of Array.isArray(records) ? records : []) {
    if (record?.status === 'approved') counts.approved += 1;
    else if (record?.status === 'pending') counts.pending += 1;
    else counts.other += 1;
  }
  return { ...counts, total: counts.approved + counts.pending + counts.other };
}

function safeReportRow(item, source) {
  const text = (value, maxLength) => typeof value === 'string'
    ? value.slice(0, maxLength).replace(/[\u0000-\u001f\u007f]/gu, ' ')
    : '';
  const id = typeof item?.id === 'string' && /^[a-z0-9_]{1,64}$/u.test(item.id) ? item.id : 'redacted';
  const status = item?.status === STATUS_RAN_MATCHED ? STATUS_RAN_MATCHED : STATUS_RAN_MISMATCHED;
  return {
    id,
    source,
    stage: text(item?.stage, 16),
    scenario: text(item?.scenario, 240),
    expected: text(item?.expected, 240),
    actual: text(item?.actual, 240),
    requestId: text(item?.requestId, 160),
    checkedAt: text(item?.checkedAt, 40),
    status,
  };
}

export function summarizeVerification(executedRows, deployedRows = [], pending = PENDING_CHECKS) {
  // 기록은 화면에 필요한 열만 반환합니다. 서버 기록에 본문 등 추가 필드가 있어도 응답에 복사하지 않습니다.
  // 출처도 분리해 코드 직접 호출 결과를 실제 배포 API 응답으로 오인하지 않게 합니다.
  const rows = [
    ...executedRows.map((item) => safeReportRow(item, '코드 직접 호출')),
    ...deployedRows.map((item) => safeReportRow(item, '배포 API 응답')),
  ];
  const matched = rows.filter((item) => item.status === STATUS_RAN_MATCHED).length;
  return {
    executed: rows.length, matched, mismatched: rows.length - matched, notRun: pending.length,
    rows,
    pending: pending.map((item) => ({ ...item, status: STATUS_NOT_RUN })),
  };
}

// 화면이 그대로 보여 줄 요약. 화면의 수치는 모두 이 객체의 값입니다.
export function buildOpsReport({ rows, deployedRows = [], recovery, devices, events = null, checkRecord = null, policy = buildPolicyCopy(), now = new Date() }) {
  const verdict = verifyPolicyCopy(policy);
  const verification = summarizeVerification(rows, deployedRows);
  const burstRow = rows.find((item) => item.id === 's9_burst');
  return {
    schema: 'aleph.ops.report.v1',
    generatedAt: now.toISOString(),
    rules: { ruleIds: [...RULE_IDS], reasonCodes: [...REASON_CODES], policyVersion: verdict.ok ? verdict.version : null },
    detection: {
      rule: 'burst_read', windowMinutes: 10, threshold: 120,
      sample: burstRow ? { actual: burstRow.actual, status: burstRow.status, requestId: burstRow.requestId } : null,
      engineConnected: false,
    },
    revocation: { ...summarizeDevices(devices), engineRevocation: STATUS_NOT_RUN },
    recovery: {
      ...summarizeRecovery(recovery),
      policyCopy: { ok: verdict.ok, version: verdict.ok ? verdict.version : null, sha256: verdict.ok ? verdict.sha256.slice(0, 16) : null },
    },
    verification,
    // 제출 점검 기록(docs/check-record.json)의 요약. GET /api/checks 와 같은 함수·같은 기록에서 셉니다.
    checks: summarizeCheckRecord(checkRecord),
    // 서버가 실제로 받은 요청의 기록(최근 50줄·규칙별 거부 수·결과별 건수). 위 점검 표와 별개입니다.
    events: events ?? {
      available: false, recordedTotal: 0, recent: [], denyByRule: [],
      outcomes: { blocked: 0, allowed: 0, errors: 0 },
      tagged: { checks: 0, blocked: 0, allowed: 0, errors: 0 },
    },
    // 심판의 41종 시험 결과는 학생 환경에 기록이 없습니다. 막음·통과로 세지 않고 미실행으로만 표시합니다.
    judgeSuite: {
      total: TOTAL_ATTACKS, runByStudent: 0, recorded: 0, status: STATUS_NOT_RUN,
      note: '심판의 41종 시험은 운영 측이 실행합니다. 이 화면에는 그 결과 기록이 없으므로 41종은 모두 미실행이며, 막음·통과로 세지 않습니다.',
    },
  };
}

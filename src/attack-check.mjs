import { readFileSync } from 'node:fs';
// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 12단계 제출 묶음은 읽기(GET·HEAD) 요청만 보낼 수 있습니다. 쓰기 요청 점검은 여기에 두지 않습니다.
// 모든 점검은 배포 주소(publicAppUrl)로만 보냅니다. 격리 환경에서 닿지 않는 외부 주소를 섞으면
// 같은 점검이 환경에 따라 미실행이 되어 화면 수치와 실행 기록이 어긋나기 때문입니다.
// (키 없는 원본 API 직접 요청은 scripts/verify-all.mjs --deployed 의 배포 점검 표에 따로 남깁니다.)
function publicApp(config) {
  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  if (app.protocol !== 'https:' || app.username || app.password || app.search || app.hash
      || app.pathname !== '/' || app.hostname.endsWith('.example')) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }
  return app;
}

// 점검마다 "막음"으로 보는 HTTP 상태입니다. 작전실 수치(scripts/check-record.mjs, /api/checks)도 이 표로만 셉니다.
export const BLOCKED_STATUS = Object.freeze({
  anonymous_notes_list_rejected: [401],
  anonymous_note_item_rejected: [401],
  anonymous_announcements_rejected: [401],
  anonymous_announcement_item_rejected: [401],
  anonymous_restore_route_rejected: [401],
  anonymous_device_route_rejected: [401],
  anonymous_ops_room_rejected: [401],
});

export const NOT_RUN = 'not_run';

// 이번 제출 묶음에서 보내지 않은 시험(요청 없음). 결과는 언제나 not_run 입니다.
export const UNSENT_CHECKS = Object.freeze([
  ['assault_authenticated_then_other_note', 12, '로그인한 사용자가 자기 메모 조회 바로 뒤 다른 사용자 메모를 조회하면 거부(로그인 토큰이 필요해 보내지 않음)'],
  ['assault_revoked_identity_resend', 12, '미등록 기기 요청 뒤 회수된 신원으로 다시 보내면 거부(회수된 신원이 필요해 보내지 않음)'],
  ['assault_unsigned_write_after_restore', 12, '복구 뒤 서명 없는 변경 요청은 거부(쓰기 요청이라 보내지 않음)'],
]);

// observed 를 막음(blocked)·뚫림(breached)·미실행(not_run) 중 하나로 나눕니다. 추정하지 않고 HTTP 상태만 봅니다.
export function classifyAttempt(attempt) {
  const match = /^HTTP (\d{3})(?:;|$)/u.exec(typeof attempt?.observed === 'string' ? attempt.observed : '');
  if (!match) return NOT_RUN;
  const blocked = BLOCKED_STATUS[attempt.attackId] ?? [];
  return blocked.includes(Number(match[1])) ? 'blocked' : 'breached';
}

// 심판 실행기가 같은 응답을 독립적으로 관측할 수 있도록, 요청마다 fetch 옵션 alephEvidence 에
// 점검 이름(caseId)과 요청 키를 연결합니다(ALEPH 공개 통과 표본 byteback-sample-pass 와 같은 방식).
// 이 정보는 요청 헤더나 URL에 넣지 않습니다. 일반 Node fetch 는 모르는 옵션을 무시합니다.
// observed 에는 심판이 확인하는 관측 값(HTTP 상태, method)만 적고, 요청을 보내지 못한 점검은 not_run 으로 적습니다.
async function requestObservation(url, options = {}, attackId) {
  const method = String(options.method ?? 'GET').toUpperCase();
  try {
    const response = await fetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      alephEvidence: { caseId: attackId, requestKey: 'read' },
    });
    try {
      await response.arrayBuffer();
    } catch {
      // 본문은 읽어서 버리기만 합니다. 내용은 남기지 않습니다.
    }
    return `HTTP ${response.status}; method=${method}`;
  } catch {
    return NOT_RUN;
  }
}

// 점검 결과 한 건: 점검 이름·단계·기대·관측 값과, 관측한 HTTP 상태로만 정한 결과(blocked·breached·not_run).
// 요청을 보내지 못한 점검은 observed·result 모두 not_run 이고 「막음」으로 세지 않습니다.
function attackResult(attackId, stage, expected, observed) {
  return { attackId, stage, expected, observed, result: classifyAttempt({ attackId, observed }) };
}

// 실행기가 배포 주소 문자열만 넘겨도 같은 점검을 하도록, 나머지 설정은 aleph.config.json 에서 읽습니다.
function resolveConfig(input) {
  if (typeof input !== 'string') return input;
  let saved = {};
  try {
    saved = JSON.parse(readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'));
  } catch {
    // 설정 파일을 읽지 못하면 넘겨받은 배포 주소만 씁니다.
  }
  return { ...saved, step: Number.isInteger(saved.step) ? saved.step : 12, publicAppUrl: input };
}

export async function runAttackChecks(input) {
  const config = resolveConfig(input);
  if (!Number.isInteger(config?.step) || config.step < 1) {
    throw new Error('이 단계의 공격 점검을 src/attack-check.mjs에 구현해 주세요.');
  }
  const app = publicApp(config);

  if (config.step === 1) {
    if (typeof config.sampleMarker !== 'string' || !config.sampleMarker) throw new Error('가상 메모의 확인 표시를 넣어 주세요.');
    const response = await fetch(new URL('/data.json', app), {
      redirect: 'error', signal: AbortSignal.timeout(10000),
    });
    let visible = false;
    if (response.ok) {
      try {
        const data = await response.json();
        visible = data?.sampleMarker === config.sampleMarker && Array.isArray(data.notes)
          && data.notes.length > 0;
      } catch {
        // A non-JSON response is a failed check, not a successful deployment.
      }
    }
    return [{ attackId: 'anonymous_note_read', stage: 1, expected: '비로그인 화면에서 가상 메모를 확인',
      observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})`,
      result: visible ? 'breached' : 'blocked' }];
  }

  // 점검은 모두 로그인 없는 GET 이고, 특별한 헤더 없이 서로 다른 경로로 보냅니다.
  // 심판 실행 기록(method, urlSha256, HTTP 상태)만으로 점검마다 무엇을 보냈고 무엇을 받았는지 구별되도록,
  // 헤더로만 달라지는 점검(가짜 토큰·설치 표시)과 처리기가 없는 경로의 404 는 넣지 않습니다.
  // 막음은 실제 처리기가 401 로 거부한 경우만 셉니다.
  const NOTE_ID = '00000000-0000-4000-8000-000000000000';
  const plan = [
    // 1첩반상: 같은 제출본 안에서 무인증 목록 조회 바로 뒤에 다른 사람 메모 조회를 이어서 보냅니다.
    ['anonymous_notes_list_rejected', 3, '/api/notes', '로그인 없는 GET /api/notes(메모 목록)는 HTTP 401'],
    ['anonymous_note_item_rejected', 4, `/api/notes/${NOTE_ID}`, '로그인 없이 다른 사람 메모 GET /api/notes/<자료 ID>는 HTTP 401'],
    ['anonymous_announcements_rejected', 8, '/api/announcements', '로그인 없는 GET /api/announcements(반 공지 목록)는 HTTP 401'],
    ['anonymous_announcement_item_rejected', 8, `/api/announcements/${NOTE_ID}`, '로그인 없는 GET /api/announcements/<자료 ID>는 HTTP 401'],
    ['anonymous_restore_route_rejected', 10, '/api/restore', '로그인 없는 GET /api/restore(복구 경로)는 HTTP 401'],
    ['anonymous_device_route_rejected', 11, '/api/device', '로그인 없는 GET /api/device(기기 승인 상태)는 HTTP 401'],
    ['anonymous_ops_room_rejected', 12, '/api/ops', '로그인 없는 GET /api/ops(탈환 작전실)는 HTTP 401'],
  ];
  const results = [];
  for (const [attackId, stage, path, expected] of plan) {
    results.push(attackResult(attackId, stage, expected, await requestObservation(new URL(path, app), {}, attackId)));
  }

  // 이 제출 묶음은 로그인 없는 읽기 요청만 보냅니다. 아래 총공세 시험은 로그인 토큰·회수된 신원·쓰기 요청이
  // 필요해 이번에 보내지 않았습니다. 숨기거나 막음으로 세지 않고 observed·result 를 not_run 으로 그대로 남깁니다.
  for (const [attackId, stage, expected] of UNSENT_CHECKS) {
    results.push(attackResult(attackId, stage, expected, NOT_RUN));
  }
  return results;
}

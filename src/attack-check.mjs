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
  public_data_json_gone: [404],
  anonymous_notes_list_rejected: [401],
  anonymous_note_item_rejected: [401],
  fake_token_rejected: [401],
  anonymous_restore_route_rejected: [401],
  anonymous_ops_room_rejected: [401],
  installed_marker_without_login_rejected: [401],
  original_table_path_not_exposed: [404],
});

export const NOT_RUN = 'not_run';

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

function attackResult(attackId, expected, observed) {
  return { attackId, expected, observed };
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
    return [{ attackId: 'anonymous_note_read', expected: '비로그인 화면에서 가상 메모를 확인',
      observed: visible ? '비로그인 요청에서 공개 가상 메모 확인 표시가 보임' : `비로그인 요청에서 확인 표시가 보이지 않음 (HTTP ${response.status})` }];
  }

  const results = [];
  results.push(attackResult(
    'public_data_json_gone',
    'GET /data.json은 HTTP 404',
    await requestObservation(new URL('/data.json', app), {}, 'public_data_json_gone'),
  ));
  // 1첩반상: 같은 제출본 안에서 무인증 목록 조회 바로 뒤에 다른 사람 메모 조회를 이어서 보냅니다.
  results.push(attackResult(
    'anonymous_notes_list_rejected',
    '인증 헤더 없는 GET /api/notes는 HTTP 401',
    await requestObservation(new URL('/api/notes', app), {}, 'anonymous_notes_list_rejected'),
  ));
  results.push(attackResult(
    'anonymous_note_item_rejected',
    '인증 헤더 없이 다른 사람 메모 GET /api/notes/<자료 ID>는 HTTP 401',
    await requestObservation(new URL('/api/notes/00000000-0000-4000-8000-000000000000', app), {}, 'anonymous_note_item_rejected'),
  ));
  results.push(attackResult(
    'fake_token_rejected',
    '가짜 Bearer 토큰을 보낸 GET /api/notes는 HTTP 401',
    await requestObservation(new URL('/api/notes', app), {
      headers: { Authorization: 'Bearer aaaa.bbbb.cccc' },
    }, 'fake_token_rejected'),
  ));

  results.push(attackResult(
    'anonymous_restore_route_rejected',
    '인증 헤더 없는 GET /api/restore는 HTTP 401',
    await requestObservation(new URL('/api/restore', app), {}, 'anonymous_restore_route_rejected'),
  ));
  results.push(attackResult(
    'anonymous_ops_room_rejected',
    '인증 헤더 없는 GET /api/ops는 HTTP 401',
    await requestObservation(new URL('/api/ops', app), {}, 'anonymous_ops_room_rejected'),
  ));
  results.push(attackResult(
    'installed_marker_without_login_rejected',
    '설치 표시만 붙인 로그인 없는 GET /api/notes는 HTTP 401',
    await requestObservation(new URL('/api/notes', app), { headers: { 'x-aleph-app': 'installed' } }, 'installed_marker_without_login_rejected'),
  ));

  results.push(attackResult(
    'original_table_path_not_exposed',
    '배포 주소에서 원본 표 경로 GET /rest/v1/training_notes는 HTTP 404',
    await requestObservation(new URL('/rest/v1/training_notes', app), {}, 'original_table_path_not_exposed'),
  ));

  return results;
}

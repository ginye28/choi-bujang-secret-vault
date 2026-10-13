import { readFileSync } from 'node:fs';
// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
// 12단계 제출 묶음은 읽기(GET·HEAD) 요청만 보낼 수 있습니다. 쓰기 요청 점검은 여기에 두지 않습니다.
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

// 심판 실행기가 같은 응답을 독립적으로 관측할 수 있도록, 요청마다 fetch 옵션 alephEvidence 에
// 점검 이름(caseId)과 요청 키를 연결합니다(ALEPH 공개 통과 표본 byteback-sample-pass 와 같은 방식).
// 이 정보는 요청 헤더나 URL에 넣지 않습니다. 일반 Node fetch 는 모르는 옵션을 무시합니다.
// observed 에는 관측한 사실(HTTP 상태, JSON 여부)만 적고, 요청을 보내지 못한 점검은 not_run 으로 적습니다.
async function requestObservation(url, options = {}, attackId) {
  try {
    const response = await fetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      alephEvidence: { caseId: attackId, requestKey: 'read' },
    });
    let isJson = false;
    try {
      await response.json();
      isJson = true;
    } catch {
      // JSON 여부만 남기고 본문은 남기지 않습니다.
    }
    return `HTTP ${response.status}; JSON: ${isJson ? '예' : '아니요'}`;
  } catch {
    return 'not_run';
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
  results.push(attackResult(
    'anonymous_notes_list_rejected',
    '인증 헤더 없는 GET /api/notes는 HTTP 401 및 JSON 응답',
    await requestObservation(new URL('/api/notes', app), {}, 'anonymous_notes_list_rejected'),
  ));
  results.push(attackResult(
    'anonymous_note_item_rejected',
    '인증 헤더 없는 GET /api/notes/<자료 ID>는 HTTP 401',
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
    '인증 헤더 없는 GET /api/ops는 HTTP 401 및 JSON 응답',
    await requestObservation(new URL('/api/ops', app), {}, 'anonymous_ops_room_rejected'),
  ));
  results.push(attackResult(
    'installed_marker_without_login_rejected',
    '설치 표시만 붙인 로그인 없는 GET /api/notes는 HTTP 401',
    await requestObservation(new URL('/api/notes', app), { headers: { 'x-aleph-app': 'installed' } }, 'installed_marker_without_login_rejected'),
  ));

  if (!config.originalApiUrl) {
    results.push(attackResult(
      'direct_original_api_denied',
      '키 없는 원본 API 요청은 자료를 반환하지 않고 HTTP 401 또는 403',
      '미실행 (originalApiUrl 없음)',
    ));
  } else {
    let originalApi;
    try {
      originalApi = new URL(config.originalApiUrl);
    } catch {
      throw new Error('aleph.config.json의 원본 API 주소가 올바르지 않습니다.');
    }
    if (originalApi.protocol !== 'https:' || originalApi.username || originalApi.password
        || originalApi.search || originalApi.hash) {
      throw new Error('aleph.config.json의 원본 API 주소가 올바르지 않습니다.');
    }
    results.push(attackResult(
      'direct_original_api_denied',
      '키 없는 원본 API 요청은 자료를 반환하지 않고 HTTP 401 또는 403',
      await requestObservation(originalApi, {}, 'direct_original_api_denied'),
    ));
  }

  return results;
}

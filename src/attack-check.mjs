import { createHash, randomUUID } from 'node:crypto';
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

// 요청마다 새 요청 ID(randomUUID)를 보내고, 응답 본문의 sha256(본문 자체는 남기지 않음)과 확인 시각을
// observed 에 적습니다. 서버는 같은 요청 ID 로 응답 해시를 기록하므로 서버 기록과 맞춰 볼 수 있습니다.
// 요청을 보내지 못한 점검은 observed 를 not_run 으로 적습니다.
async function requestObservation(url, options = {}, attackId = null) {
  const requestId = randomUUID();
  const tagged = attackId === null ? {} : { 'x-request-id': requestId, 'x-aleph-attack-id': attackId };
  try {
    const response = await fetch(url, {
      ...options,
      headers: { ...(options.headers ?? {}), ...tagged },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    let text = '';
    try {
      text = typeof response.text === 'function' ? await response.text() : JSON.stringify(await response.json());
    } catch {
      // 본문을 읽지 못해도 상태만으로 기록합니다.
    }
    let isJson = false;
    try {
      JSON.parse(text);
      isJson = true;
    } catch {
      // JSON 이 아니면 아니요로 기록합니다. 본문은 남기지 않습니다.
    }
    const digest = createHash('sha256').update(text, 'utf8').digest('hex');
    const checkedAt = new Date().toISOString();
    const base = `HTTP ${response.status}; JSON: ${isJson ? '예' : '아니요'}`;
    return attackId === null ? base : `${base}; 요청 ID: ${requestId}; 응답 sha256: ${digest}; 확인 시각: ${checkedAt}`;
  } catch {
    return 'not_run';
  }
}

function attackResult(attackId, expected, observed) {
  return { attackId, expected, observed };
}

export async function runAttackChecks(config) {
  if (!Number.isInteger(config.step) || config.step < 1) {
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

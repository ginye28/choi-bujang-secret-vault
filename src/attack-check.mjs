// The student changes this check as each stage adds an attack to the same app.
// Never return tokens, private keys, real names, or note bodies.
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

async function requestObservation(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    let isJson = false;
    try {
      await response.json();
      isJson = true;
    } catch {
      // Record only whether the response was JSON, never its contents.
    }
    return `HTTP ${response.status}; JSON: ${isJson ? '예' : '아니요'}`;
  } catch {
    return 'HTTP 응답 없음; JSON 여부 미확인';
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
    await requestObservation(new URL('/data.json', app)),
  ));
  results.push(attackResult(
    'anonymous_notes_list_rejected',
    '인증 헤더 없는 GET /api/notes는 HTTP 401 및 JSON 응답',
    await requestObservation(new URL('/api/notes', app)),
  ));
  results.push(attackResult(
    'anonymous_note_write_rejected',
    '인증 헤더 없는 POST /api/notes는 HTTP 401',
    await requestObservation(new URL('/api/notes', app), { method: 'POST' }),
  ));
  results.push(attackResult(
    'fake_token_rejected',
    '가짜 Bearer 토큰을 보낸 GET /api/notes는 HTTP 401',
    await requestObservation(new URL('/api/notes', app), {
      headers: { Authorization: 'Bearer aaaa.bbbb.cccc' },
    }),
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
      await requestObservation(originalApi),
    ));
  }

  return results;
}

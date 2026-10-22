# 케셰브 17단계 제출본 (알레프게이트 AI 연결)

이 브랜치는 17단계 판정용으로 줄인 제출본입니다. 전체 작업은 `main` 에 있으며, 시작 틀은 공식 업데이트로 **0.2.14** 입니다(`main` 커밋 `ef8453c`). 제공 파일은 수정하지 않았고, 학생이 고친 파일은 `on-client/student/extension.mjs` 하나입니다.

## 학생 구현 위치

- `on-client/student/extension.mjs`
  - `renderAiConnection({ status, mode, data, error, checkedAt, explanationAccepted })`: idle·loading·ok·error 구분, ok 일 때 `audienceAuthorization`(test/verified)·`modelCount`·`checkedAt` 표시와 "사건 설명은 아직 실행하지 않았습니다" 안내, 오류 코드별 원인 안내(`AI_CONNECTION_GUIDANCE`), 취소·시간 초과 구분, 재점검·idle 시 이전 결과 제거, 자동 재시도 없음.
  - `renderExplanation({ event, explanation, checkedAt })`: 성공일 때만 `data-student-explanation-event` 에 사건 ID 를 붙이고 요약을 글자로 표시, 실패면 안전한 code·message 와 "기록은 그대로" 안내.
  - 모든 표시는 `createElement`·`textContent` 만 쓰고, 오류 메시지는 `safeValue` 로 열쇠·토큰 모양을 가립니다.
- 시험: `main` 의 `test/on-client/ai-connection.test.mjs` 등 38건 통과(`node --test test/on-client/*.test.mjs`, 0.2.14 업데이트 뒤 다시 실행). 판정 원문 분량 때문에 이 제출본에는 시험 파일을 넣지 않았습니다.

## 요청 연결 경로(제공 코드, 수정하지 않음)

1. 「현재 API 연결 점검」 → `on-client/public/app.js` 의 `aiRequest('/api/ai/check')` → 결과를 `renderAiConnection` 에 전달.
2. `on-client/src/server.mjs`: `POST /api/ai/check` 는 native 계정 연결이 있으면 native 경로(`createVaultOnAiService(...).checkConnection`), 없으면 `ai.checkConnection` 으로 처리합니다. `POST /api/ai/explain` 도 같은 방식으로 `explainIncident` 를 부릅니다.
3. `on-client/src/ai/service.mjs` 의 `createOnAiService`: 모델 목록 점검과 사건 설명(`activeClient.chat(...)`)을 실제로 보내는 곳입니다. `vault-service.mjs` 는 이 서비스를 계정 연결 보관소로 감싼 것입니다(이 제출본에서는 크기 때문에 뺐고 `main` 에 있습니다).
4. 사건 설명은 보안 기록의 사건에서 따로 요청하며(`aiRequest('/api/ai/explain', { eventId })`), 결과는 `renderExplanation` 으로 표시합니다. 모델 목록 응답만으로 사건 설명 성공으로 표시하지 않습니다.

## 제공 `public/app.js` 원문 발췌(0.2.14, 수정 없음)

판정 원문 분량 안에 `src/server.mjs` 가 들어가도록 이 제출본에서는 `public/app.js`(1,372줄)를 뺐습니다. 학생 표시와 이어지는 부분만 줄 번호와 함께 그대로 옮깁니다. 전체 파일은 `main`(`ef8453c`)의 `on-client/public/app.js` 입니다.

연결 점검·취소·초기화(463~485행):

```js
function cancelAiCheck({ reset = false } = {}) {
  ++aiConnectionGeneration;
  if (aiConnectionController) aiConnectionController.abort();
  aiConnectionController = null;
  state.aiConnection = reset ? { status: 'idle' } : safeAiFailure({ error: { code: 'CANCELLED' } });
  renderAiConnection();
}

async function checkAiConnection() {
  const gen = generation, requestGen = ++aiConnectionGeneration;
  if (aiConnectionController) aiConnectionController.abort();
  const controller = new AbortController();
  aiConnectionController = controller;
  state.aiConnection = { status: 'loading' };
  renderAiConnection();
  try {
    const result = await aiRequest('/api/ai/check', { body: {}, signal: controller.signal });
    if (gen !== generation || requestGen !== aiConnectionGeneration) return;
    const data = result.ok ? validAiCheck(result.data, result.meta) : null;
    state.aiConnection = data ? { status: 'ok', data, meta: result.meta } : safeAiFailure(result.ok ? null : result);
    renderAiConnection();
  } finally { controller.abort(); if (aiConnectionController === controller) aiConnectionController = null; }
}
```

계정 연결이 바뀌면 점검 결과를 idle 로 되돌림(563~568행):

```js
function invalidateAppConnectView() {
  if ((aiConnect && aiConnect.state.phase !== 'idle') || state.aiConnection.status !== 'idle') appConnectInvalidated = true;
  if (aiConnect) aiConnect.reset();
  cancelAiCheck({ reset: true });
  renderAiConnect();
}
```

보안 기록에서 사건 설명 요청(999~1018행 일부):

```js
    const result = safeEvent ? await aiRequest('/api/ai/explain', { body: { eventId: event.id }, signal: controller.signal })
      : localFailure('ON_AI_INVALID_INPUT', AI_MESSAGES.ON_AI_INVALID_INPUT, UNKNOWN_META);
    // 다시 불러오기 이후이거나 기록 칸이 바뀌었으면 늦은 응답은 버린다.
    if (gen !== generation || requestGen !== explanationGeneration || explainSlots.get(event.id) !== slot) return;
    // AI 결과는 기록 목록 상태와 분리한다. 실패해도 기록은 그대로 둔다.
    if (!result.ok) {
      state.selectedExplanation.resource = safeAiFailure(result);
      ...
    }
    const explanation = validExplanation(result.data, event);
    ...
    state.selectedExplanation.resource = { status: 'ok', data: explanation, meta: result.meta };
    setChildren(slot, renderExplanation(explanation, event, result.meta));
```

## 실제 연결 기록(사실대로)

- 2026-10-22: 시작 틀 0.2.14 로 업데이트하고 `tools/start-alekov.ps1` 로 앱을 켰습니다(계정 연결 설정 자동 준비 완료).
- 「계정 연결 시작」 → 6자리 확인 번호 → 앱의 「계정 확인 페이지 열기」로 연 포털에서 같은 계정으로 번호 확인. 이때 게이트 `native-login/confirm` 이 **401 `ON_APP_NATIVE_SESSION_UNVERIFIED`** 를 돌려주어 계정 연결이 확인되지 않았습니다(포털 재로그인 뒤에도 동일).
- 그래서 AI 앱 승인과 「현재 API 연결 점검」은 아직 성공하지 못했습니다. 이 화면을 **연결 완료로 적지 않습니다.** 앱 화면은 이 상태를 확인 불가로 보여 줍니다.

## 비밀 정보

열쇠 입력란·API 키·토큰은 코드·README·커밋 어디에도 없습니다. 계정 연결 설정(`native.json`)은 프로젝트 밖 사용자 폴더에 있고 비밀을 담지 않습니다.

## 세 AI 의 역할

- Workbench 수업용 AI(CLCO): 이 코드를 함께 작성한 개발 도우미.
- 앱 안의 AI 설명 기능: 케셰브 앱 서버가 승인된 계정으로 수업용 AI 게이트에 보내는 사건 설명 요청.
- ALEPH 공식 판정 AI: 제출한 커밋 원문을 읽고 단계 기준과 대조하는 심판(코드를 실행하지 않음).

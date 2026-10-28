# 18단계 · 근거가 있는 AI 사건 설명

- 열림: 2026-10-23 (17단계 통과 기록: 2026-10-22 11:32 접수 `cc79f30`)
- 권장일: 2026-10-27
- 수정 대상: `on-client/student/extension.mjs` → `renderExplanation`
- 필수 확인 항목: student-source-changed, evidence_binding, unknown_evidence, insufficient_evidence, wrong_event_rejected, proposal_not_executed, non_ai_regression, explanation_refresh (data-student-explanation-event 속성만 붙였다고 통과하지 않음)

## 단계 안내 요약

- 목표: AI 요약을 선택한 이벤트의 근거·규칙·현재 상태와 함께 표시합니다.
- explanation.status 가 error 이면 event 가 null 이어도 안전한 오류 코드·메시지와 근거 부족 등 실패 이유를 먼저 표시. 오류 없이 event 만 null 이면 보안 기록을 먼저 선택하도록 안내. 요청 중·성공·실패 구분.
- 성공한 설명에만 `data-student-explanation-event=event.id`. 이벤트 ID·참고용 AI 요약 표시.
- evidenceIds 를 현재 event.evidence 의 id 와 대조하고 근거 문장 표시. 규칙은 id 와 text 함께.
- access·session·device 중 unknown 인 값을 각각 확인 불가로 표시. proposals 는 이유와 미실행 상태. 지원 조치가 없으면 제안이 없는 이유.
- 다른 이벤트 선택·새로고침·실패 시 이전 설명과 성공 속성 제거. 없는 근거 ID 를 만들어 맞추지 않음.
- 직접 확인: 선택한 이벤트 ID 와 설명의 근거 ID 일치 / 실제 설명 기능을 쓸 수 없는 상태는 미확인으로 남김(유료 요청 반복 금지).

## 공식 과제 안내(카드)

받는 값: `renderExplanation({ event, explanation, checkedAt })`
- event: 보안 기록에서 고른 기록(15단계와 같은 모양) 또는 null
- explanation: `{ status, mode, data?, error? }`, data 는 `{ summary, evidenceIds, proposals:[{action,evidenceIds,reason}], requiresHumanConfirmation:true, executed:false }`
- 제공 코드가 이미 검사한 것: 모든 근거 ID 를 빠짐없이 인용했는지, 없는 ID·중복·지원하지 않는 조치·비밀 표기·executed:true 가 없는지. 맞지 않으면 학생 함수에는 실패로 전달.

지금 알아 둘 것: supportedActions 가 비어 있어 AI 제안 0개가 정상(연동 시스템이 지원하는 조치가 없어 제안이 없다고 안내). AI 설명은 해석이며 사실 판단은 근거 글과 연동 시스템 상태로. unknown 은 확인 불가이며 안전·정상으로 바꾸지 않음. AI 연결이 실패해도 업무 앱 판정과 보안 기록은 계속 동작.

| 상황 | 보여 줄 것 |
|---|---|
| event 없음 | 기록을 먼저 고르라는 안내 |
| loading | 설명 요청 중 |
| ok | 사건 ID, AI 요약, 인용한 근거 ID 와 근거 글, 규칙 글, 확인 불가 상태 목록, 제안(없으면 없는 까닭) |
| error | 설명 실패와 message. 기록은 그대로이며 과제 실패가 아님 |

AI 에게 붙여 넣을 프롬프트(카드 원문 요약):
- event 가 null 이면 "보안 기록에서 기록을 먼저 고르세요".
- ok 면 바깥 요소에 data-student-explanation-event=event.id, 그리고 1) 사건 ID·"AI 설명(참고용)"·summary 2) evidenceIds 마다 "근거 ID — 근거 글" 3) event.rules 마다 "규칙 ID — 규칙 글" 4) event.state 에서 unknown 인 항목을 접속·세션·기기별로 "접속: 확인 불가(unknown)", 없으면 "없음" 5) proposals 가 비었으면 까닭(supportedActions 비었으면 "연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상)", 아니면 AI 가 제안한 조치가 없음) 6) proposals 가 있으면 action·reason·"사람 확인이 필요하며 실행되지 않았습니다".
- 근거 ID 가 event.evidence 에 없으면 쓸 수 없다는 것과 까닭(근거가 맞지 않음), 안전한 error.code 함께. 지어내지 않음.
- error 면 "AI 설명 실패: " + 안전한 code·message + "기록은 그대로입니다". AI 가 이미 실행했다고 답한 설명은 쓸 수 없다고 표시.
- 실패·자료 없음·근거 불일치 화면에는 data-student-explanation-event 를 붙이지 않음. 다른 기록·다시 불러오기 시 이전 설명 지움. 실행 버튼 없음. textContent 만.

스스로 확인: 1) 서로 다른 기록 두 개로 근거·규칙이 각 기록 것과 맞는지 2) unknown 상태 기록에서 확인 불가 표시 3) 요청 중 다른 기록을 고르면 늦은 설명이 엉뚱한 기록에 붙지 않는지 4) AI 실패해도 업무 앱 판정과 기록 목록이 그대로인지.

## 진행 기록

- 17단계 제출본 구성(판정 원문 한도 약 21만 자): README·public/app.js·src/ai/service.mjs·src/server.mjs·student/extension.mjs. 18단계도 같은 구성으로 제출.

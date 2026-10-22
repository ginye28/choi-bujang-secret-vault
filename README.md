# 케셰브 17단계 제출본

판정 원문 분량에 맞춰 17단계 관련 파일만 남긴 제출본입니다(시작 틀 0.2.14, 전체 작업·시험은 `main`).

- 학생 구현: `on-client/student/extension.mjs` 의 `renderAiConnection`, `renderExplanation`
- 제공 코드(수정 없음): `public/app.js`(버튼·취소·세대 관리) → `src/server.mjs`(`/api/ai/check`, `/api/ai/explain`) → `src/ai/service.mjs`(모델 점검·`chat` 호출)
- 실제 연결: 2026-10-22 계정 연결 확인에서 게이트가 401 `ON_APP_NATIVE_SESSION_UNVERIFIED` 를 돌려주어 아직 연결 완료가 아닙니다. 연결 완료로 적지 않습니다.

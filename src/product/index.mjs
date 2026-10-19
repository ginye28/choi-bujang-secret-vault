// ─────────────────────────────────────────────────────────────────────────────
// 보안 운영 웹앱의 업무 코드 진입점. 함수 이름과 입력·출력 모양은 공개 계약(docs/HTTP_CONTRACT_r3.md)입니다.
// 제공 코드(src/platform/)가 로그인 확인과 HTTP 연결을 하고 이 파일의 함수를 부릅니다.
//
// 기능별 파일
//   policy.mjs     D1 정책(decide · getPolicy · policyHistory · createDraft · activatePolicy · rollbackPolicy)
//   resources.mjs  보호 자원(readResource · writeResource)
//   events.mjs     D2 사건(ingestEvents · queryEvents · listIncidents · getIncident)
//   responses.mjs  D3 대응(createResponse · approveResponse · rejectResponse · releaseResponse · getResponse)
//   backup.mjs     D4 복구(createBackup · restoreBackup)
//   config.mjs     탐지 시간 창·승인 유효기간·재시도 예산 같은 설정값 한 곳
//
// ctx.clock() / ctx.sleep() 만 쓰고 Date.now() / setTimeout 은 쓰지 않습니다(시험이 시계를 바꿉니다).
// 감사 기록은 'audit' 모음에 덧붙이기만 합니다.
// ─────────────────────────────────────────────────────────────────────────────
export { decide, getPolicy, policyHistory, createDraft, activatePolicy, rollbackPolicy } from './policy.mjs';
export { readResource, writeResource } from './resources.mjs';
export { ingestEvents, queryEvents, listIncidents, getIncident } from './events.mjs';
export { createResponse, approveResponse, rejectResponse, releaseResponse, getResponse } from './responses.mjs';
export { createBackup, restoreBackup } from './backup.mjs';

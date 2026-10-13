# 12단계 점검 기록

생성: 2026-10-13T07:56:39.389Z

학생이 직접 실행한 점검입니다. 심판의 41종 시험 결과를 대신하지 않으며, 미실행 항목은 통과로 세지 않습니다.

## 코드 시험(판정기·탐지·정책 사본·기기 서명을 코드로 직접 호출)

실제 배포 API 결과가 아닙니다. 41종 시험의 막음·통과로 세지 않으며, 실제 API 로는 미실행입니다.

| 단계 | 시험 | 기대 결과 | 실제 결과 | 요청 ID | 확인 시각 | 상태 |
|---|---|---|---|---|---|---|
| 6 | 등록된 기기의 자기 메모 읽기 | allow / approved | allow / approved | ba6fcea6-fd28-48b1-ba75-64a09ace2c64 | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 6 | 미등록 기기의 메모 읽기 | deny / device_not_registered | deny / device_not_registered | 52004c0e-f1ca-43eb-bb95-09b905d882cf | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 7 | 새 네트워크·읽기 급증·재인증 없음 | step_up / step_up_required | step_up / step_up_required | d32c9cee-ccf6-4462-abf8-c2c328577a8b | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 7 | 같은 요청, 재인증 확인 완료 | allow / approved | allow / approved | 21c2b226-9ac2-477f-9b07-4bc4fc91004e | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 8 | 다른 주체의 메모 읽기 | deny / zone_other_owner | deny / zone_other_owner | 7552a625-b2d4-460c-8f26-ace4d7b6842f | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 8 | 메모 수정(PUT) | deny / route_not_allowed | deny / route_not_allowed | e161d22a-6109-4932-840f-5b82f1ad309c | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 8 | 공지 등록(POST) | deny / announcement_write_denied | deny / announcement_write_denied | da7148c7-da83-463d-bd4d-fe727f9a2419 | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 8 | 자료 경로에 쿼리를 붙인 읽기 | deny / query_not_allowed | deny / query_not_allowed | 301b1f7c-1cf3-4f9e-ab81-dffa81444212 | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 9 | 10분 안에 같은 사용자 GET 121건 | propose_revocation / burst_read | propose_revocation / burst_read | local:586403f7-e7ae-4c9a-a05c-bff6445f127a | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 9 | 10분 안에 같은 사용자 GET 120건(경계) | observe | observe | local:56cd1430-b645-48c6-8b13-533882e91182 | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 10 | 내용이 바뀐 정책 사본 검증 | ok=false / COPY_HASH_MISMATCH | ok=false / COPY_HASH_MISMATCH | local:f8c9d3f2-56c8-4383-9fc3-7c122c583c4c | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 10 | 넓어진 시험 정책과 안전 사본의 차이 보기 | ok=true, 차이 1건 이상, 변경 없음 | ok=true, 차이 1건 | local:fb45ea8a-330e-4e24-91d6-b961aa0c7c69 | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 11 | 서명 없는 학생 수정 요청 | required / ok=false / SIGNATURE_MISSING | required=true / ok=false / SIGNATURE_MISSING | local:8acebe0a-93a5-4302-9741-a5360984feac | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 11 | 승인된 기기가 요청마다 받은 서명으로 수정 | ok=true | ok=true | local:60494348-a7c8-4a63-8c8c-0a80392485bd | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 11 | 받은 서명을 다른 자료 경로에 재사용 | ok=false / SIGNATURE_INVALID | ok=false / SIGNATURE_INVALID | local:fce8f8ce-571c-4e92-8fc5-dffa72d900a4 | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 11 | 승인 대기 기기의 요청 | ok=false / DEVICE_NOT_APPROVED | ok=false / DEVICE_NOT_APPROVED | local:8ed7a356-96f5-461c-aee4-8bb1eb39387c | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 12 | 같은 제출본: 자기 메모 조회 뒤 다른 사용자 메모 조회 | 1번 allow / 2번 deny(zone_other_owner) | allow / deny(zone_other_owner) | 51105957-b613-429f-a71c-5bd7e2818c37 | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 12 | 미등록 기기 요청 뒤 회수된 신원의 재전송 | 둘 다 deny / device_not_registered | deny(device_not_registered) / deny(device_not_registered) | 0c4906c5-2f21-4f88-a28b-05d8783e2426 | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |
| 12 | 복구 뒤 서명 없는 변경 요청과 구역 밖 조회 | 변경 SIGNATURE_MISSING / 조회 deny | SIGNATURE_MISSING / deny(route_not_allowed) | 34277d5b-622d-4864-8c06-863c4fccde45 | 2026-10-13T07:56:21.292Z | 코드 시험·일치(실제 API 미실행) |

## 실제 배포 API 요청(로그인 없는 요청)

| 단계 | 시험 | 기대 결과 | 실제 결과 | 요청 ID | 확인 시각 | 상태 |
|---|---|---|---|---|---|---|
| 2 | 공개 /data.json 직접 요청 | HTTP 404 | HTTP 404 | icn1::5xgr4-1791878171198-6aa674a9c2cc | 2026-10-13T07:56:21.299Z | 실행·일치 |
| 3 | 로그인 없는 GET /api/notes | HTTP 401 | HTTP 401 | icn1::iad1::lh6zs-1791878171303-844033522272 | 2026-10-13T07:56:22.356Z | 실행·일치 |
| 3 | 로그인 없는 POST /api/notes | HTTP 401 | HTTP 401 | icn1::iad1::fqkds-1791878173299-a027019895e0 | 2026-10-13T07:56:24.425Z | 실행·일치 |
| 4 | 가짜 Bearer 토큰 GET /api/notes | HTTP 401 | HTTP 401 | icn1::iad1::qs77v-1791878174352-efe20c16611e | 2026-10-13T07:56:25.478Z | 실행·일치 |
| 5 | 로그인 없는 메모 상세 조회 | HTTP 401 | HTTP 401 | icn1::iad1::kp7wc-1791878175389-b64665749b02 | 2026-10-13T07:56:26.509Z | 실행·일치 |
| 5 | 로그인 없는 메모 수정 | HTTP 401 | HTTP 401 | icn1::iad1::g6gxt-1791878177290-10e2bd347118 | 2026-10-13T07:56:28.409Z | 실행·일치 |
| 5 | 키 없는 원본 API 직접 요청 | HTTP 401 또는 HTTP 403 | HTTP 401 | 헤더 없음 | 2026-10-13T07:56:29.501Z | 실행·일치 |
| 8 | 로그인 없는 공지 등록 | HTTP 401 또는 HTTP 403 | HTTP 401 | icn1::iad1::fz4mf-1791878180311-8e08c824b408 | 2026-10-13T07:56:31.438Z | 실행·일치 |
| 10 | 로그인 없는 POST /api/restore | HTTP 401 | HTTP 401 | icn1::iad1::vvhhn-1791878182029-3136568f1a05 | 2026-10-13T07:56:33.151Z | 실행·일치 |
| 11 | 로그인 없는 GET /api/device | HTTP 401 | HTTP 401 | icn1::iad1::2sqsz-1791878183729-e2dac80799d5 | 2026-10-13T07:56:34.856Z | 실행·일치 |
| 11 | 설치 표시만 붙인 로그인 없는 요청 | HTTP 401 | HTTP 401 | icn1::iad1::b6j2x-1791878185456-81746dbd28b2 | 2026-10-13T07:56:36.566Z | 실행·일치 |
| 12 | 로그인 없는 GET /api/ops | HTTP 401 | HTTP 401 | icn1::iad1::2sqsz-1791878186535-af0cfaa978ac | 2026-10-13T07:56:37.658Z | 실행·일치 |

## 미실행

| 단계 | 시험 | 기대 결과 | 이유 |
|---|---|---|---|
| 3~8, 12 | 로그인한 시험 계정으로 배포 /api/notes 목록·상세·수정·삭제를 호출(12단계 총공세: 자기 메모 조회 뒤 다른 사용자 메모 조회 연속 전송 포함) | 자기 메모만 보이고 다른 사용자 메모는 거부 | 시험용 로그인 토큰을 이 점검 환경에 넣지 않아 보내지 않았습니다. |
| 10 | 배포 POST /api/restore 로 사본에서 메모 한 건을 복원 | 요청 소유자·ID·내용 해시가 사본과 같을 때만 복원 | 운영 자료를 바꾸는 호출이라 실제 서비스에서는 실행하지 않았습니다. |
| 9 | 운영 반 엔진의 사건 전달과 접속 회수 | 회수 제안이 엔진을 거쳐 실제 접속 차단으로 이어짐 | 엔진 연결은 운영 측 기능이라 학생 환경에서 실측하지 못했습니다. |
| 12 | 배포 API 에 미등록 기기 요청 뒤 회수된 신원 재전송, 복구 뒤 서명 없는 변경 요청과 구역 밖 조회 | 모두 거부 | 로그인 토큰·기기 등록·쓰기 요청이 필요해 실제 배포 API 로는 보내지 않았습니다. 코드 시험 결과는 통과로 세지 않습니다. |
| 11 | 실제 기기에서 홈 화면 추가 후 기기 승인·서명 요청 | 승인된 기기의 요청 서명만 보호 자료를 엽니다 | 실제 기기 설치를 이 환경에서 하지 않았습니다. |

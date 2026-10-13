# 12단계 점검 기록

생성: 2026-10-13T05:35:54.151Z

학생이 직접 실행한 점검입니다. 심판의 41종 시험 결과를 대신하지 않으며, 미실행 항목은 통과로 세지 않습니다.

## 코드 직접 호출(판정기·탐지·정책 사본·기기 서명)

| 단계 | 시험 | 기대 결과 | 실제 결과 | 요청 ID | 확인 시각 | 상태 |
|---|---|---|---|---|---|---|
| 6 | 등록된 기기의 자기 메모 읽기 | allow / approved | allow / approved | 4492d1ba-bdbb-4ef2-aaa6-718afe9068dc | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 6 | 미등록 기기의 메모 읽기 | deny / device_not_registered | deny / device_not_registered | 83ddf45d-5e2c-4eef-a35a-74a4b9282d3a | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 7 | 새 네트워크·읽기 급증·재인증 없음 | step_up / step_up_required | step_up / step_up_required | fd7e24e9-28d6-4796-8f91-e237d89c00af | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 7 | 같은 요청, 재인증 확인 완료 | allow / approved | allow / approved | f40b3eb7-cc67-4876-907d-ba7214c3c212 | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 8 | 다른 주체의 메모 읽기 | deny / zone_other_owner | deny / zone_other_owner | df8de1b5-ac90-4553-a8e7-b1941e1d4a4d | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 8 | 메모 수정(PUT) | deny / route_not_allowed | deny / route_not_allowed | bef6c318-483d-4970-a13a-611ef6340388 | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 8 | 공지 등록(POST) | deny / announcement_write_denied | deny / announcement_write_denied | 2bc6ed13-8a2b-4be5-a55a-bf36e9e13d09 | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 8 | 자료 경로에 쿼리를 붙인 읽기 | deny / query_not_allowed | deny / query_not_allowed | 5585c233-8adb-442d-b911-83e183e4ca3b | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 9 | 10분 안에 같은 사용자 GET 121건 | propose_revocation / burst_read | propose_revocation / burst_read | local:b9304a34-7c0f-4100-9b3c-d11791ded082 | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 9 | 10분 안에 같은 사용자 GET 120건(경계) | observe | observe | local:5b90d0da-3b8d-444b-aab0-dd2c45e640be | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 10 | 내용이 바뀐 정책 사본 검증 | ok=false / COPY_HASH_MISMATCH | ok=false / COPY_HASH_MISMATCH | local:a9b50027-b453-490c-b264-baf980d0f9ef | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 10 | 넓어진 시험 정책과 안전 사본의 차이 보기 | ok=true, 차이 1건 이상, 변경 없음 | ok=true, 차이 1건 | local:477078de-132f-46d6-a0e4-10a4fe0f8d8d | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 11 | 서명 없는 학생 수정 요청 | required / ok=false / SIGNATURE_MISSING | required=true / ok=false / SIGNATURE_MISSING | local:aa3e5da2-2c96-4878-9827-5611b25a6ee2 | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 11 | 승인된 기기가 요청마다 받은 서명으로 수정 | ok=true | ok=true | local:e47a2a04-923f-418a-897a-f3c9e6b9acfe | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 11 | 받은 서명을 다른 자료 경로에 재사용 | ok=false / SIGNATURE_INVALID | ok=false / SIGNATURE_INVALID | local:cdd7dd1f-c8b9-42e7-bf09-a1dafcc981a9 | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 11 | 승인 대기 기기의 요청 | ok=false / DEVICE_NOT_APPROVED | ok=false / DEVICE_NOT_APPROVED | local:72f4979f-bd97-4dc3-8b00-e44e1dc409e7 | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 12 | 같은 제출본: 자기 메모 조회 뒤 다른 사용자 메모 조회 | 1번 allow / 2번 deny(zone_other_owner) | allow / deny(zone_other_owner) | 216241e8-83d7-4c4f-970c-cc7439bd1e39 | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 12 | 미등록 기기 요청 뒤 회수된 신원의 재전송 | 둘 다 deny / device_not_registered | deny(device_not_registered) / deny(device_not_registered) | 6644a0c5-c74e-4a9e-b05c-2c868fc39085 | 2026-10-13T05:35:48.699Z | 실행·일치 |
| 12 | 복구 뒤 서명 없는 변경 요청과 구역 밖 조회 | 변경 SIGNATURE_MISSING / 조회 deny | SIGNATURE_MISSING / deny(route_not_allowed) | adf00b14-e9bf-4df9-ba6d-70f45225b591 | 2026-10-13T05:35:48.699Z | 실행·일치 |

## 배포 주소 요청(로그인 없는 요청)

| 단계 | 시험 | 기대 결과 | 실제 결과 | 요청 ID | 확인 시각 | 상태 |
|---|---|---|---|---|---|---|
| 2 | 공개 /data.json 직접 요청 | HTTP 404 | HTTP 404 | icn1::p9k2d-1791869738849-4c8cdd064232 | 2026-10-13T05:35:48.705Z | 실행·일치 |
| 3 | 로그인 없는 GET /api/notes | HTTP 401 | HTTP 401 | icn1::iad1::tjrvz-1791869739108-63e65fa928ea | 2026-10-13T05:35:50.129Z | 실행·일치 |
| 3 | 로그인 없는 POST /api/notes | HTTP 401 | HTTP 401 | icn1::iad1::w7xxd-1791869739613-f1dc3ca2043c | 2026-10-13T05:35:50.658Z | 실행·일치 |
| 4 | 가짜 Bearer 토큰 GET /api/notes | HTTP 401 | HTTP 401 | icn1::iad1::2sqsz-1791869740058-8712f7301251 | 2026-10-13T05:35:51.093Z | 실행·일치 |
| 5 | 로그인 없는 메모 상세 조회 | HTTP 401 | HTTP 401 | icn1::iad1::vvhhn-1791869740275-9ca0c5c77c8d | 2026-10-13T05:35:51.314Z | 실행·일치 |
| 5 | 로그인 없는 메모 수정 | HTTP 401 | HTTP 401 | icn1::iad1::f5s2x-1791869740500-b62f65c223b4 | 2026-10-13T05:35:51.536Z | 실행·일치 |
| 5 | 키 없는 원본 API 직접 요청 | HTTP 401 또는 HTTP 403 | HTTP 401 | 헤더 없음 | 2026-10-13T05:35:51.752Z | 실행·일치 |
| 8 | 로그인 없는 공지 등록 | HTTP 401 또는 HTTP 403 | HTTP 401 | icn1::iad1::62ch5-1791869741705-64833a95c836 | 2026-10-13T05:35:52.746Z | 실행·일치 |
| 10 | 로그인 없는 POST /api/restore | HTTP 401 | HTTP 401 | icn1::iad1::kqqjs-1791869742003-ac35e8caf51b | 2026-10-13T05:35:53.037Z | 실행·일치 |
| 11 | 로그인 없는 GET /api/device | HTTP 401 | HTTP 401 | icn1::iad1::tjrvz-1791869742313-36dc3f225548 | 2026-10-13T05:35:53.353Z | 실행·일치 |
| 11 | 설치 표시만 붙인 로그인 없는 요청 | HTTP 401 | HTTP 401 | icn1::iad1::2sqsz-1791869742610-44bcc73afeb1 | 2026-10-13T05:35:53.643Z | 실행·일치 |
| 12 | 로그인 없는 GET /api/ops | HTTP 401 | HTTP 401 | icn1::iad1::2sqsz-1791869742829-d6356a048b0d | 2026-10-13T05:35:53.864Z | 실행·일치 |

## 미실행

| 단계 | 시험 | 기대 결과 | 이유 |
|---|---|---|---|
| 3~8 | 로그인한 시험 계정으로 배포 /api/notes 목록·상세·수정·삭제를 호출 | 자기 메모만 보이고 다른 사용자 메모는 거부 | 시험용 로그인 토큰을 이 점검 환경에 넣지 않아 보내지 않았습니다. |
| 10 | 배포 POST /api/restore 로 사본에서 메모 한 건을 복원 | 요청 소유자·ID·내용 해시가 사본과 같을 때만 복원 | 운영 자료를 바꾸는 호출이라 실제 서비스에서는 실행하지 않았습니다. |
| 9 | 운영 반 엔진의 사건 전달과 접속 회수 | 회수 제안이 엔진을 거쳐 실제 접속 차단으로 이어짐 | 엔진 연결은 운영 측 기능이라 학생 환경에서 실측하지 못했습니다. |
| 11 | 실제 기기에서 홈 화면 추가 후 기기 승인·서명 요청 | 승인된 기기의 요청 서명만 보호 자료를 엽니다 | 실제 기기 설치를 이 환경에서 하지 않았습니다. |

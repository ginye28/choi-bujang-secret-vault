# 12단계 점검 기록

생성: 2026-10-13T05:35:16.186Z

학생이 직접 실행한 점검입니다. 심판의 41종 시험 결과를 대신하지 않으며, 미실행 항목은 통과로 세지 않습니다.

## 코드 직접 호출(판정기·탐지·정책 사본·기기 서명)

| 단계 | 시험 | 기대 결과 | 실제 결과 | 요청 ID | 확인 시각 | 상태 |
|---|---|---|---|---|---|---|
| 6 | 등록된 기기의 자기 메모 읽기 | allow / approved | allow / approved | dd7cc659-5337-4473-a036-ec85adbc3cb7 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 6 | 미등록 기기의 메모 읽기 | deny / device_not_registered | deny / device_not_registered | 641e3d40-181d-41e4-99a3-8a998bea52be | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 7 | 새 네트워크·읽기 급증·재인증 없음 | step_up / step_up_required | step_up / step_up_required | 292dd1f0-5157-4aea-beaf-3fad8424323a | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 7 | 같은 요청, 재인증 확인 완료 | allow / approved | allow / approved | 969a7e22-15c2-4bde-82e6-7e4fd4bdaa10 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 8 | 다른 주체의 메모 읽기 | deny / zone_other_owner | deny / zone_other_owner | 3811bd84-885f-4c04-b6b5-a213989c158e | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 8 | 메모 수정(PUT) | deny / route_not_allowed | deny / route_not_allowed | 430bef35-9304-4d5a-9933-4bbe3f190258 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 8 | 공지 등록(POST) | deny / announcement_write_denied | deny / announcement_write_denied | ff911ed7-e71e-4324-b2b7-166512407109 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 8 | 자료 경로에 쿼리를 붙인 읽기 | deny / query_not_allowed | deny / query_not_allowed | 9bf881ae-fec6-4696-b6c6-98fe4bd7fab5 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 9 | 10분 안에 같은 사용자 GET 121건 | propose_revocation / burst_read | propose_revocation / burst_read | local:153a7f9e-6ca5-4978-961e-d0b99d38e92d | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 9 | 10분 안에 같은 사용자 GET 120건(경계) | observe | observe | local:d4f41fbf-7ed5-49be-82a2-c0b9cf3a134a | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 10 | 내용이 바뀐 정책 사본 검증 | ok=false / COPY_HASH_MISMATCH | ok=false / COPY_HASH_MISMATCH | local:6052a72b-0c37-4b13-94bd-2362612dece8 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 10 | 넓어진 시험 정책과 안전 사본의 차이 보기 | ok=true, 차이 1건 이상, 변경 없음 | ok=true, 차이 1건 | local:df2abbf4-9af6-4cc6-904b-3fc8024c3095 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 11 | 서명 없는 학생 수정 요청 | required / ok=false / SIGNATURE_MISSING | required=true / ok=false / SIGNATURE_MISSING | local:c5008399-a5e2-4661-b13e-cb73793b0142 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 11 | 승인된 기기가 요청마다 받은 서명으로 수정 | ok=true | ok=true | local:2a5e8ee7-7079-437f-8533-0136c2ec02d1 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 11 | 받은 서명을 다른 자료 경로에 재사용 | ok=false / SIGNATURE_INVALID | ok=false / SIGNATURE_INVALID | local:c49314e0-1cdf-42b3-a72c-1abcb682a929 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 11 | 승인 대기 기기의 요청 | ok=false / DEVICE_NOT_APPROVED | ok=false / DEVICE_NOT_APPROVED | local:1ef0ca74-053b-4336-aaf3-6dfdefc40482 | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 12 | 같은 제출본: 자기 메모 조회 뒤 다른 사용자 메모 조회 | 1번 allow / 2번 deny(zone_other_owner) | allow / deny(zone_other_owner) | e2653aa0-1370-464f-9b82-08fa264d94aa | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 12 | 미등록 기기 요청 뒤 회수된 신원의 재전송 | 둘 다 deny / device_not_registered | deny(device_not_registered) / deny(device_not_registered) | c4fa8e6e-c97d-4535-a127-aaf8ab8684fa | 2026-10-13T05:35:16.180Z | 실행·일치 |
| 12 | 복구 뒤 서명 없는 변경 요청과 구역 밖 조회 | 변경 SIGNATURE_MISSING / 조회 deny | SIGNATURE_MISSING / deny(route_not_allowed) | b3307e91-aaec-4264-9281-2d8dbbcfc809 | 2026-10-13T05:35:16.180Z | 실행·일치 |

## 배포 주소 요청(로그인 없는 요청)

`node scripts/verify-all.mjs --deployed` 를 실행하지 않아 미실행입니다.

## 미실행

| 단계 | 시험 | 기대 결과 | 이유 |
|---|---|---|---|
| 3~8 | 로그인한 시험 계정으로 배포 /api/notes 목록·상세·수정·삭제를 호출 | 자기 메모만 보이고 다른 사용자 메모는 거부 | 시험용 로그인 토큰을 이 점검 환경에 넣지 않아 보내지 않았습니다. |
| 10 | 배포 POST /api/restore 로 사본에서 메모 한 건을 복원 | 요청 소유자·ID·내용 해시가 사본과 같을 때만 복원 | 운영 자료를 바꾸는 호출이라 실제 서비스에서는 실행하지 않았습니다. |
| 9 | 운영 반 엔진의 사건 전달과 접속 회수 | 회수 제안이 엔진을 거쳐 실제 접속 차단으로 이어짐 | 엔진 연결은 운영 측 기능이라 학생 환경에서 실측하지 못했습니다. |
| 11 | 실제 기기에서 홈 화면 추가 후 기기 승인·서명 요청 | 승인된 기기의 요청 서명만 보호 자료를 엽니다 | 실제 기기 설치를 이 환경에서 하지 않았습니다. |

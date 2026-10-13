# 자료실 — 12단계 저장점

## 12단계: 탈환 작전실 — 1~11단계를 한 곳에서 확인합니다

검사한 커밋은 배포 주소의 `/aleph.json` 의 `commit` 과 `git log -1` 이 같은 커밋입니다. 아래 내용은 그 커밋의 파일 기준입니다.

### 무엇이 있는가
- **탈환 작전실 화면**: 로그인 뒤 "탈환 작전실" 패널의 "작전실 요약 불러오기" 버튼. 판정기 규칙 이름, 탐지 규칙(burst_read), 내 기기 승인·대기 수, 복구 버전(사본 개수·가린 메모 번호·내용 해시), 점검 결과 표를 보여 줍니다. 화면의 수치는 `GET /api/ops` 응답 값만 씁니다. 메모 제목과 본문은 받지도 표시하지도 않습니다.
- **`GET /api/ops`** (`api/ops.js`): 로그인과 11단계 기기 서명을 확인한 뒤, 서버가 그 순간 판정기·탐지·정책 사본·기기 서명 코드를 직접 호출한 점검 결과(`src/ops-room.mjs`)와 내 복구 버전·기기 상태의 숫자만 돌려줍니다.
- **점검 기록**: `npm run verify:all`(코드 직접 호출)과 `node scripts/verify-all.mjs --deployed`(배포 주소에 로그인 없이 보내는 요청)가 `docs/verification-log.json` 과 `docs/VERIFICATION.md` 를 만듭니다. 항목마다 기대 결과·실제 결과·요청 ID·확인 시각·상태를 한 표에 둡니다.
- **판정기 보강**: 엔진이 `identity_revoked`·`access_revoked`·`session_revoked`·`device_revoked` 사건을 알린 신원은 같은 요청을 다시 보내도 `device_not_registered` 로 먼저 거부합니다.

### 서버 요청 기록 (작전실 수치의 근거)
- `src/event-log.mjs` 가 `/api/notes`·`/api/announcements`·`/api/restore`·`/api/device`·`/api/ops` 의 모든 요청을 응답을 보내기 전에 기록합니다. 기록 한 건은 요청 ID(응답 헤더 `X-Request-Id` 로도 돌려줌), 시각, 방식, 가린 경로(`/api/notes/:id`), 응답 상태, 이유 코드, 점검 이름(`x-aleph-attack-id` 헤더가 있을 때), 행위자 종류와 짧은 가명 값뿐입니다. 토큰·이메일·메모 제목·본문·전체 자료 ID는 남기지 않습니다.
- 작전실의 **최근 사건 50줄**, **규칙별 거부 수**, **거부·허용·서버 오류 건수** 는 이 기록에서만 셉니다. 빼기나 추정으로 채운 수치는 없습니다.
- 로그인 사용자의 기록은 본인에게만 보이고, 로그인 없는 요청과 거부된 요청의 기록은 가려진 형태로 모두에게 보입니다. 오래된 기록은 자동으로 지워 최근 수백 건만 유지합니다.
- `npm run bundle` 의 자체 점검(`src/attack-check.mjs`)은 읽기(GET) 요청만 보냅니다. 심판 실행기가 같은 응답을 독립적으로 관측할 수 있도록 요청마다 fetch 옵션 `alephEvidence: { caseId: <attackId>, requestKey: 'read' }` 로 점검 이름과 요청을 연결합니다(ALEPH 공개 통과 표본 `ChoiTimo/byteback-sample-pass` 의 방식). 이 정보는 요청 헤더나 URL에 넣지 않습니다. 점검 결과 한 건은 `attackId·stage·expected·observed·result` 입니다. `observed` 에는 심판이 확인하는 관측 값(`HTTP 401; method=GET`)만 적고, `result` 는 관측한 HTTP 상태로만 `blocked`·`breached`·`not_run` 중 하나로 정합니다. 요청을 보내지 못한 점검은 `observed`·`result` 모두 `not_run` 이며 「막음」으로 세지 않습니다(`scripts/bundle.mjs` 가 이 형식을 검사).
- **제출 점검 기록과 작전실 수치**: `npm run checks:record` 가 같은 점검을 실제 배포에 실행해 가린 기록 `docs/check-record.json`(점검 이름·기대·관측 값만, 주소·본문 없음)을 씁니다. 로그인 없이 열리는 `GET /api/checks` 와 로그인 후 `GET /api/ops` 는 이 기록을 같은 함수(`src/check-record.mjs`)로 세어 점검 항목·막은 공격·뚫린 공격·실행하지 않은 점검을 돌려주고, 화면은 그 값만 표시합니다. 막음 여부는 `src/attack-check.mjs` 의 `BLOCKED_STATUS` 표와 관측한 HTTP 상태로만 정합니다. 같은 폴더에 방금 만든 제출 묶음 `artifacts/submission.json` 이 있으면 그 결과(미실행 포함)를 먼저 쓰고, 없으면(배포 환경) 커밋된 기록을 씁니다. 제출 점검은 모두 배포 주소로만 보냅니다(격리 환경에서 닿지 않는 외부 주소를 섞으면 같은 점검이 미실행이 되어 화면과 기록이 어긋나므로). 키 없는 원본 API 직접 요청은 `node scripts/verify-all.mjs --deployed` 의 배포 점검 표에 남깁니다.
- 작전실의 서버 기록 수치(거부·허용·서버 오류 건수)는 서버 요청 기록을 그대로 센 값이며 합이 기록 건수와 같습니다. 41종 시험은 실제 API 로 실행해 응답이 기록된 점검(제출 점검 7종)만 「실행」으로 세고(막음·뚫림), 나머지 34종은 「미실행」으로 표시하며 막음·통과로 세지 않습니다. 코드 시험은 실제 API 실행으로 세지 않습니다.

### 실행·미실행 구분
- **실행·일치 / 실행·불일치**: 실제 배포 API 에 요청을 보내 받은 응답에만 씁니다(제출 점검 7건, `--deployed` 배포 점검 표). 요청 ID는 배포 요청의 `x-vercel-id` 입니다.
- **코드 시험·일치(실제 API 미실행)**: 판정기·탐지·정책 사본·기기 서명 코드를 직접 호출한 결과입니다. 실제 API 결과가 아니므로 41종 시험의 막음·통과로 세지 않고, 작전실에서도 실제 API 실행 수와 따로 셉니다.
- **미실행**: 로그인 토큰이 필요한 배포 API 호출, 운영 자료를 바꾸는 `POST /api/restore` 실호출, 운영 엔진의 사건 전달·접속 회수, 실제 기기 설치는 이 환경에서 실행하지 않았습니다. 표의 "미실행" 목록에 이유와 함께 남겼고 통과로 세지 않습니다.
- **41종 시험**: 작전실과 `GET /api/checks` 는 41종 중 실제 API 로 실행해 응답이 기록된 것만 실행으로 셉니다(현재 7종, 막음 7 · 뚫림 0). 나머지 34종은 미실행이며 막음·통과로 세지 않습니다. 41종을 모두 막았다고 적지 않습니다.

### 총공세 세 가지 — 코드 시험으로만 확인(실제 배포 API 로는 미실행)
아래 세 가지는 `test/ops-room.test.mjs` 와 작전실 표의 **코드 시험** 결과입니다. 로그인 토큰·기기 등록·쓰기 요청이 필요해 실제 배포 API 로는 보내지 않았으므로 작전실 「미실행」 목록에 남기고 막음·통과로 세지 않습니다. 실제 API 로 확인한 것은 로그인 없는 요청(무인증 목록 조회 바로 뒤 다른 사람 메모 조회 등 제출 점검 7건)뿐입니다. 제출 점검은 모두 로그인 없는 GET 으로, 특별한 헤더 없이 서로 다른 경로에 보내 심판 실행 기록(method·주소 해시·HTTP 상태)만으로 점검마다 구별되게 했고, 실제 처리기가 401 로 거부한 경우만 막음으로 셉니다(가짜 토큰·설치 표시처럼 헤더로만 달라지는 요청과 404 경로는 `--deployed` 배포 점검 표에만 남깁니다).
1. 같은 제출본에서 자기 메모 조회 뒤 다른 사용자 메모 조회 → 앞 요청의 허용이 뒤 요청에 이어지지 않고 `zone_other_owner` 로 거부.
2. 미등록 기기 요청 뒤 회수된 신원의 재전송 → 두 요청 모두 `device_not_registered` 로 거부.
3. 복구 뒤 서명 없는 변경 요청과 구역 밖 조회 → 변경은 `SIGNATURE_MISSING`, 조회는 `deny`.

### 설치·실행·중지·복구
1. 설치: `npm ci` (Node 22 이상).
2. 시험: `node --test test/*.test.mjs` — 시작 틀의 "패키징 함수 기준표" 시험 한 건은 이 작업과 무관하게 실패합니다.
3. 점검 기록: `npm run verify:all` 또는 `node scripts/verify-all.mjs --deployed`.
   제출 점검 기록: `npm run checks:record` → `docs/check-record.json` 을 커밋하면 `/api/checks`·작전실 수치가 그 기록으로 바뀝니다. 그다음 `npm run bundle`.
4. 실행: Vercel 에 push 하면 자동 배포됩니다. 환경 변수는 `SUPABASE_URL`, `SUPABASE_SECRET_KEY` 이며 값은 저장소에 두지 않습니다.
5. 중지: 문제가 생기면 Vercel 대시보드에서 직전 배포로 되돌리거나 `git revert <커밋>` 후 push 합니다. `git reset --hard` 는 쓰지 않습니다.
6. 복구: 메모 한 건은 `POST /api/restore`(10단계), 정책은 `npm run policy:diff` 로 차이를 본 뒤 `npm run policy:restore -- --confirm`.

### 출처 구분
- **ALEPH SDP 엔진 사용(제공)**: 요청 검증·릴레이·판정 요청 계약(`aleph.decision.v1`)·로그인 발급자·심판 접수. 이 저장소는 이를 호출·사용할 뿐 수정하지 않습니다.
- **학생 작업**: `src/decider.mjs`(판정기), `src/detect.mjs`(탐지), `src/device-proof.mjs`(기기 서명), `src/note-backup.mjs`·`src/restore-note.mjs`·`src/policy.mjs`(복구), `src/ops-room.mjs`·`api/ops.js`·`public/index.html`(작전실), `xdr/`(XDR 보너스), `test/`.

## 11단계: 나만의 접속 앱을 완성합니다

- **설치형 웹앱**: `public/manifest.webmanifest`(앱 이름·시작 주소·아이콘·`display: standalone`), `public/icon.svg`, `public/offline.html`, `public/sw.js` 를 붙였습니다. 따로 설치할 접속 프로그램은 없습니다. 오프라인이면 화면에 안내가 나오고, 서비스 워커는 화면 이동 실패 때 오프라인 안내만 보여 줄 뿐 `/api/*` 자료나 인증 정보를 캐시하지 않습니다.
- **설치 표시는 기기 확인이 아닙니다**: 화면에 "기기 승인 상태" 패널이 있고, 앱을 설치했다는 표시나 승인 요청 버튼 값만으로는 권한을 주지 않습니다. 승인 전(확인 전·승인 대기)에는 메모 목록 영역 자체가 숨겨지고 자료를 요청하지 않습니다.
- **기기 승인(서버 결정)**: `POST /api/device` `{action:'request'}` 가 서버가 만든 기기 번호를 발급하고 기록합니다. 브라우저는 번호만 메모리에 두며 어떤 기기 값도 브라우저 저장소에 넣지 않습니다. 승인 규칙은 서버가 정합니다: 이 사용자의 첫 기기이거나 로그인(토큰 발급 1시간 이내)한 요청이면 승인, 그 밖에는 승인 대기입니다. 대기 중인 기기는 승인된 기기의 서명 요청 또는 서버에 저장된 강사 권한(`action:'approve'`)으로만 승인됩니다. `GET /api/device?deviceId=` 는 소유자에게만 상태를 알려 줍니다.
- **서버가 발급하는 요청 서명**: 화면에는 기기 서명 정보가 없습니다. 보호 요청을 보내기 전에 화면이 `POST /api/device` `{action:'ticket', deviceId, method, path, bodySha256}` 로 그 요청 하나에 대한 짧은 서명(티켓)을 받아 `X-Aleph-Device`·`X-Aleph-Ticket`(와 설치형 앱 표시 `X-Aleph-App: installed`)로 붙입니다. 서명은 서버만 아는 비밀로 사용자·기기·방식·경로·본문 해시·시각을 묶으므로(`src/device-proof.mjs`), 서명 뒤 경로·본문·방식을 바꾸면 `SIGNATURE_INVALID`, 서명이 없으면 `SIGNATURE_MISSING`(`401 DEVICE_PROOF_REQUIRED`)이고 승인 전·다른 사용자의 기기·120초가 지난 서명도 거부됩니다.
- **서명이 필요한 요청**: 설치형 앱 표시가 붙은 요청과 학생 로그인(`kind: student`)의 `/api/notes`·`/api/announcements`·`/api/restore` 요청입니다. 표시를 떼어 내도 학생 로그인은 서명 없이 통과하지 못합니다. 심판이 발급한 시험 신원은 기존 로그인·소유자 규칙 그대로입니다(6~10단계 결과 유지).
- **브라우저 저장소**: 로그인 토큰을 포함해 어떤 값도 localStorage·sessionStorage·IndexedDB 에 넣지 않습니다. 토큰과 기기 번호는 이 화면의 메모리에만 있어 새로고침하면 다시 로그인합니다. 서비스 워커도 아무것도 캐시하지 않습니다.
- **확인 순서**: `node --test test/device-proof.test.mjs`(서명·경로 변경·본문 변경·승인 전·오래된 서명), `npm run decider:test`, `node --test test/*.test.mjs`.
- **미실행**: 배포된 `/api/device` 의 실제 승인 흐름과 브라우저 화면에서의 설치(홈 화면 추가)는 이 문서 작성 시점에 실제 기기로 확인하지 않았습니다.

## 10단계: 백업에서 자료실을 되살립니다

- **복구 경로**: 서비스 `notes`(자료 API), `POST /api/restore` (`aleph.config.json` 의 `restoreRoute`). 본문은 `{ "id": "<메모 UUID>", "contentSha256": "<선택: 되돌릴 사본의 내용 해시>" }` 입니다. 로그인한 사용자가 소유한 사본만 읽고, 본문에 다른 사람의 `owner` 를 적으면 `403` 입니다.
- **비공개 가상 메모 사본**: 메모를 만들거나 고치거나 지우기 직전·직후에 `src/note-backup.mjs` 가 사본(원래 ID·소유자·제목·내용·내용 해시)을 `training_notes` 의 비공개 행(제목이 `__backup__:` 로 시작)으로 남깁니다. 이 행은 어떤 메모 API(`GET /api/notes` 목록·한 건 조회 포함)에도 나오지 않고, 해시가 맞지 않는 사본은 복원에 쓰지 않습니다.
- **복원 동작**: 침해 전에 만든 가장 오래된 검증 사본 한 건만 복원 대상입니다(메모를 만들 때와 수정·삭제 직전에 사본을 남기며, 수정 뒤의 내용은 사본으로 쓰지 않습니다). 복원 전에 사본을 다시 읽어 내용 해시를 검증하고, 요청에 적힌 ID·소유자·제목·내용·내용 해시 중 하나라도 사본과 다르면 `409 BACKUP_VERIFICATION_FAILED`(소유자 불일치는 `403`)로 멈추고 아무것도 바꾸지 않습니다. 사본이 없으면 `404`입니다. `dryRun: true` 를 보내면 복원할 버전(내용 해시)과 바뀔 항목(`title`·`content`·`recreated`)만 보여 줍니다. 실제 복원은 현재 메모가 변조됐으면 제목·내용만 되돌리고, 삭제됐으면 같은 ID·소유자로 다시 만듭니다. 한 번에 한 건만 되돌리고 다른 메모와 사본(감사 기록)은 바꾸지 않습니다. 같은 ID 의 행이 다른 소유자 것이면 `409 OWNER_MISMATCH` 입니다.
- **복구 뒤 재시험 순서** (실행 전에는 모두 미실행): ① `POST /api/restore` 로 시험 계정 B 의 메모 한 건 복원 → ② 복원한 메모의 ID·소유자·내용 해시가 사본과 같은지 확인 → ③ `npm run decider:test`, `npm run fixture:7` 로 6~8단계 판정기 규칙(미등록 기기 거부·추가 확인·다른 사용자 메모 거부) 재시험 → ④ `npm run detect:test` 로 9단계 → ⑤ 1~5단계: 로그인 없는 `GET /api/notes`·`/data.json`·원본 API 직접 요청이 계속 거부되는지 → ⑥ `node --test test/*.test.mjs`.
- **안전 정책 사본**: `policy/safe-policy.json` 은 침해 전에 검증한 안전 정책(8단계 판정 통과 기준: 기기 등록 확인·추가 확인·구역 규칙·다른 주체 메모 거부)의 사본이며, 정책 내용의 sha256 이 함께 들어 있습니다. 현재 시험 정책은 `policy/test-policy.json` 입니다. 실제 운영 정책(`src/decider.mjs` 코드와 배포 설정)은 이 절차가 읽지도 바꾸지도 않습니다.
- **차이만 보기**: `npm run policy:diff` (`scripts/policy-restore.mjs diff`) 가 사본을 다시 읽어 형식과 해시를 검증한 뒤, 복원할 버전과 바뀔 항목(경로·현재 값 → 사본 값)과 보존할 항목만 출력합니다. 사본이 없거나 검증에 실패하면 `중단` 으로 끝나고 아무것도 바꾸지 않습니다.
- **정책 되돌리기**: `npm run policy:restore` 는 같은 계획을 먼저 보여 주고 `--confirm` 이 없으면 실행하지 않습니다. `npm run policy:restore -- --confirm` 은 사본이 다루는 항목(`policy` 아래)만 되돌리고, 다른 서비스 규칙(`otherServices`)과 감사 이력(`audit`)은 보존하며 이번 복원을 감사 이력에 한 줄 더합니다. 되돌린 정책에서 B 의 A 자료 요청은 거부되고 A 의 정상 요청은 유지되는지는 `test/policy-restore.test.mjs` 가 판정기로 확인합니다.
- **미실행**: 배포된 `POST /api/restore` 의 실제 호출 결과, Supabase 에 대한 사본 행 저장은 이 문서 작성 시점에 실제 서비스로 확인하지 않았습니다. 메모리 DB 시험(`test/restore-note.test.mjs`)만 실행했습니다.

## 9단계: 도플갱어를 찾고 권한을 거둡니다

- **탐지 함수** (`src/detect.mjs`): `detect(events)` 는 반 엔진이 검증한 가상 사건을 받아 가명 사용자(`identity.sub`)·요청 종류(`method`)·시각(`at`)·확인된 기기 번호(`deviceId`, 있을 때만)만 읽습니다. 메모 내용·토큰·실명은 읽거나 저장하거나 출력하지 않습니다.
- **탐지 규칙**: 같은 사용자의 `GET` 사건이 어느 10분 구간에서든 **120건을 넘을 때만** 의심으로 봅니다. 정확히 120건, 다른 사용자의 사건 합산, 10분 밖으로 흩어진 조회, `GET` 이 아닌 요청은 세지 않습니다. 지역 하나만으로는 확정하지 않습니다.
- **회수 제안**: 의심 사건은 접속 허용/거부 응답과 별도 결과로 `{ action: 'propose_revocation', reasonCode: 'burst_read', subject }` 를 돌려줍니다. 사건에 기기 번호가 있으면 확인된 기기 한 개를 `deviceId` 로 덧붙입니다. 그 밖에는 `{ action: 'observe' }` 입니다. 회수 API를 직접 만들거나 기기 권한을 바꾸지 않으며, 실제 회수와 시간은 심판이 확인합니다.
- **기존 규칙 유지**: `src/decider.mjs` 의 응답 형식과 6~8단계 규칙은 바꾸지 않았습니다.
- **확인 순서**: `npm run detect:test`, `node --test test/detect.test.mjs`. 가상 사건 연습이며 실제 접속 회수나 심판 판정이 아닙니다.

## 8단계: 자료마다 갈 수 있는 구역을 나눕니다

- **자원 ID**: 메모는 기존 UUID, 강사 공지는 `announcement_<UUID>`로 구분합니다. 메모 API는 공지 ID를, 공지 API는 메모 ID를 `400 INVALID_ID`로 거부합니다.
- **판정기 구역 규칙** (`src/decider.mjs`): 엔진이 확인한 `service`·`method`·`route`·`path`로만 구역을 고르고 쿼리 값은 기능을 고르는 데 쓰지 않습니다.
  - `GET·PUT /notes/:id` → 허용(규칙 `zone_own_notes`). 구역 규칙은 자기 메모 하나를 가리키는 읽기·수정만 엽니다. 목록(`GET /notes`)·생성(`POST /notes`)·삭제는 열지 않고 `route_not_allowed`로 거부합니다. 사용자별 목록 범위는 자료 API가 소유자 조건으로 적용합니다.
  - 메모의 소유자는 판정 계약에 소유 관계가 없어서 두 가지로 가립니다. ① 자료 ID의 소유자 표지(`learner_`·`subject_`·`sub_`·`user_`·`student_`로 시작)가 `subjectId`와 다르면 거부(`zone_other_owner`)합니다. ② 같은 자료 ID를 가장 먼저 읽은 `subjectId`를 소유자로 기억하고, 다른 `subjectId`의 읽기·수정은 거부(`zone_other_owner`)합니다. 소유자를 모르는 자료의 `PUT`은 열지 않습니다. 기억은 판정기 프로세스 안에서만 유지되고, 최종 소유자 확인은 자료 API가 합니다.
  - 자료 경로에 쿼리가 붙은 요청(`queryLength > 0`)은 거부(`query_not_allowed`)합니다. 쿼리로 기능이나 자료를 고르지 않습니다.
  - `GET /announcements`, `GET /announcements/:id` → 허용(규칙 `zone_announcements`).
  - 공지에 대한 `PUT·POST·PATCH·DELETE` → 거부(`announcement_write_denied`). 판정 계약에는 검증된 강사 역할이 없어서 일반 학생은 공지를 수정할 수 없습니다.
  - 알 수 없는 서비스·경로, `route`와 `path`의 깊이가 다른 요청, `:id` 자리에 온 기능 단어(`export` 등)는 거부(`route_not_allowed`).
  - 이전 단계 규칙은 그대로입니다. 미등록 기기는 구역과 관계없이 먼저 거부하고, 복합 이상 접속은 추가 확인합니다.
- **자료 API 재확인**: `/api/notes`는 검증된 로그인 사용자의 ID와 저장된 `owner_id`를 서버에서 대조하며 다른 사용자의 메모는 `404 NOT_FOUND`(`OWNER_MISMATCH_OR_NOT_FOUND`)로 응답합니다. `/api/announcements`는 로그인한 사용자가 읽을 수 있고, 수정 요청은 서버에 저장된 강사 권한(`app_metadata.role`)이 없으면 `403 INSTRUCTOR_REQUIRED`입니다. 화면 메뉴나 요청 본문의 `role`은 보지 않습니다.
- **확인 순서**: `npm run decider:test`, `npm run fixture:7`, `node --test test/decider-zone.test.mjs test/resource-ids.test.mjs test/instructor-access.test.mjs`. 가상 요청 연습이며 심판 판정이 아닙니다.
- **미실행**: `db/announcements.sql`의 Supabase 적용과 배포 API의 실제 호출 결과는 이 문서 작성 시점에 확인하지 않았습니다.

## 7단계: 평소와 다른 접속은 다시 확인합니다

`src/decider.mjs`에 규칙 `step_up_required`를 하나 더했습니다. 6단계의 기기 등록 규칙(`device_registered`)은 그대로 유지하며 미등록 기기는 여전히 먼저 `deny`됩니다.

- **입력 검사**: 판정기는 계약(`docs/DECIDER_REQUEST.md`)에 있는 이름의 요청만 받습니다. 계약에 없는 항목(예: 클라이언트 헤더)이 있거나 신호 출처가 `none`·`judge_fixture`가 아니면 요청을 거부합니다(예외). 없는 지역·시각·네트워크·행동 값을 임의의 정상값으로 채우지 않습니다.
- **추가 확인 규칙**: 등록 기기의 요청이라도 평소와 다른 네트워크와 갑작스러운 다량 조회가 **모두** 확인되고 아직 재확인이 되지 않았으면 `step_up`과 이유 코드 `step_up_required`로 응답합니다.
  1. 처음 보는 네트워크(`signals.network`가 `unusual`, 출처 `judge_fixture`)
  2. 최근 5분(300초) 안의 `risk_signal` 사건이 한 건에서 10회 이상(갑작스러운 대량 조회)
- 지역(`signals.region`)과 시각은 이 규칙에 사용하지 않습니다. 지역 하나만으로는 의심으로 확정하지 않습니다.
- 재확인(`stepUp.verified`가 `true`)된 요청은 `allow`(`approved`)로 응답합니다.

### 확인 순서

1. `npm run decider:test`: 정상 요청 `allow`, 미등록 기기 `deny`(`device_not_registered`), 복합 이상 접속 `step_up`(`step_up_required`), 다시 확인한 복합 이상 접속 `allow`가 모두 `통과`로 나와야 합니다.
2. `npm run fixture:7`: `정상 사건: allow`, `복합 이상 사건: step_up`이 나와야 합니다.
3. 이 명령들은 가상 요청 연습이며 심판 판정이나 실제 학생 접속 증거가 아닙니다.

### 실제 재로그인 차단은 미실행

현재 계약에는 엔진이 "같은 로그인으로 다시 로그인한 시각"을 알려 주는 항목이 없고, 재확인 결과는 `stepUp {verified, authAgeSeconds}`로만 전달됩니다. 그래서 확인 전 실제 자료 차단과 새 로그인 뒤 재판정은 이 환경에서 실측하지 않았고 미실행입니다. 토큰 원문은 기록하지 않습니다.

## 6단계: 등록한 기기만 들어옵니다

`src/decider.mjs`의 판정기에 규칙 `device_registered`를 하나 넣었습니다. 요청의 `deviceRegistered`가 `true`일 때만 `allow`(`approved`)로 응답하고, `false`이거나 값이 없으면 `deny`와 이유 코드 `device_not_registered`로 거부합니다. 판정에는 요청에 담긴 `deviceRegistered`만 사용하며 인증서·CA·서명 키는 만들거나 저장하지 않았습니다. 설치할 접속 프로그램은 이번 단계에 없습니다. 실제 미등록 기기의 접속 시도는 심판이 별도로 확인합니다.

### 확인 순서

1. 저장소 루트에서 `npm run decider:test`를 실행합니다.
2. 출력에 `통과 · 등록 기기의 정상 요청`(등록 기기 요청은 `allow`)과 `통과 · 미등록 기기의 가상 요청`(미등록 기기 요청은 `deny`·`device_not_registered`)이 모두 나와야 합니다.
3. 이 명령은 가상 요청으로 하는 연습이며 심판 통과의 증거가 아닙니다.

## 현재 기능

- 브라우저는 로그인·회원가입을 `/api/auth`, 메모 조회·추가·수정·삭제를 `/api/notes` 서버 함수에 요청하며 Supabase를 직접 호출하지 않습니다. 화면 코드에는 Supabase 키가 없습니다.
- `/api/auth`가 서버에서 Supabase Auth에 인증 요청을 전달하고, 성공한 로그인 토큰은 브라우저의 `sessionStorage`에 저장됩니다. `/api/notes` 요청은 이 토큰을 Bearer 인증으로 전달합니다. 로그아웃하면 브라우저 저장소를 비웁니다.
- `/api/notes`는 로그인 사용자를 확인한 뒤 서버에서 `training_notes`를 조회·변경하고, 메모 소유자 조건을 적용합니다. 다른 사용자의 메모는 `404 {"error":"NOT_FOUND"}`로 응답합니다.
- 메모 ID는 기존 UUID 그대로 유지합니다. 강사 공지는 새 `instructor_announcements` 자원에 저장되며 API 응답과 주소에서는 `announcement_<UUID>` 형식을 써서 메모 ID와 구분합니다. 공지 조회 API는 `/api/announcements`이며 로그인된 사용자에게 읽기만 제공합니다. 화면 메뉴는 변경하지 않았습니다.

## 다시 실행하기

1. Supabase **SQL Editor**에서 아래 파일을 순서대로 실행하세요. 이미 실행한 DB라면 `db/announcements.sql`만 추가로 실행하면 됩니다. 기존 `training_notes`와 메모는 바뀌지 않습니다.
   1. `db/schema.sql`
   2. `db/policies.sql`
   3. `db/revoke-direct.sql`
   4. `db/announcements.sql` (8단계: 강사 공지 전용 테이블)
2. `db/revoke-direct.sql`은 `public.training_notes`에서만 `PUBLIC`, `anon`, `authenticated`의 직접 테이블 권한을 회수합니다. 이 파일은 다른 테이블, RLS 설정·정책, `service_role` 권한을 변경하지 않습니다.
3. `db/revoke-direct.sql`의 `REVOKE` 앞 확인 쿼리 결과와 뒤 확인 쿼리 결과를 비교하세요. 뒤 결과에서 `anon`과 `authenticated`의 `can_select`, `can_insert`, `can_update`, `can_delete`는 모두 `false`여야 합니다. ACL 확인 결과에는 `PUBLIC`, `anon`, `authenticated` 권한이 없어야 하고, `service_role` 결과는 적용 전과 같아야 합니다. 역할 멤버십 등으로 간접 권한을 추가했다면 유효 권한 결과가 달라질 수 있으므로 따로 검토하세요.
4. `db/announcements.sql` 확인 결과에서 `anon_can_select`와 `authenticated_can_select`는 `false`, `service_role_can_select`는 `true`여야 합니다.
5. Vercel 프로젝트의 **Settings → Environment Variables**에서 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 직접 입력하세요. 비밀값은 코드나 문서에 기록하지 마세요. `/api/auth`는 서버에서 Supabase Auth REST를 호출하며 공개 키를 사용합니다.
6. 공지 조회에는 로그인한 뒤 `GET /api/announcements`를, 특정 공지 조회에는 `GET /api/announcements/announcement_<UUID>`를 사용합니다. 메모 API 경로와 기존 메모 ID는 바뀌지 않았습니다.

## 남은 약점

- 옛 공개 커밋과 배포에는 과거 노출 기록이 남아 있습니다. 현재 구현이나 새 배포만으로 과거 기록이 사라지지는 않습니다.
- `/api/auth`에는 속도 제한이 없습니다.
- 메모 및 공지 API의 서버 전용 키는 Vercel의 `SUPABASE_SECRET_KEY` 환경변수 하나에 의존합니다. 이 값은 브라우저 코드에 넣지 마세요.
- 강사 공지 등록·수정·삭제를 위한 관리자 인증과 입력 API는 구현하지 않았습니다. DB의 기존 공지 내용을 이 변경에서 만들거나 옮기지 않았습니다.

SQL 실행, 환경변수 설정, 배포 및 화면 동작 확인은 이 문서 수정 과정에서 수행하지 않았습니다.

## 2단계 확인 절차

아래 확인은 **현재 배포와 GitHub 기본 브랜치의 최신 커밋**을 점검하는 절차입니다. 배포 주소는 실제 Vercel 주소로 바꿔 사용하고, 명령은 로컬 터미널에서 실행하세요.

### 현재 배포 확인

```sh
DEPLOY_URL="https://your-project.vercel.app"
curl -I "$DEPLOY_URL/data.json"
curl -I "$DEPLOY_URL/aleph.json"
curl -I "$DEPLOY_URL/"
```

정상 기대 결과는 `/data.json`이 `404`, `/aleph.json`과 첫 화면(`/`)이 `200`입니다. 첫 화면 응답 헤더에 `X-Content-Type-Options: nosniff`와 `Content-Security-Policy`가 있는지도 확인하세요. 이 검사는 현재 배포에서 정적 `/data.json`이 제공되지 않는지와 보안 헤더를 확인할 뿐, API나 과거 배포에 남은 자료까지 없다는 뜻은 아닙니다.

### GitHub 최신 파일에서 메모 문장 검색

GitHub 원격의 최신 기본 브랜치 정보를 먼저 가져온 뒤, 각 가상 메모의 고유한 문장을 하나씩 검색합니다.

```sh
git fetch origin
git grep -n -F '<가상 메모 문장 하나>' origin/HEAD -- .
```

검색 결과가 없고 명령 종료 코드가 `1`이면 해당 문장이 `origin/HEAD`가 가리키는 최신 커밋의 추적 파일에서 발견되지 않은 것입니다. 결과가 나오면 경로와 줄을 확인하고, 최신 커밋에 메모 문장이 남아 있지 않도록 정리한 뒤 다시 확인하세요. `origin/HEAD`를 찾을 수 없다면 GitHub 기본 브랜치에 해당하는 원격 추적 브랜치(예: `origin/main`)를 대신 지정하세요. 이 검색은 해당 최신 커밋만 검사하며 이전 커밋의 기록을 지우지 않습니다.

**과거 노출 주의:** 새 배포에서 `/data.json`이 404이고 최신 커밋 검색에 결과가 없더라도, 옛 공개 커밋이나 옛 배포가 남아 있는 한 과거 노출이 해소됐다고 판단하지 마세요. 위 확인만으로 Git 이력이나 이전 배포가 삭제되지는 않습니다.

**남은 약점(현재 구현 기준):** 로그인과 소유자 검사는 서버 함수가 수행하며, 서버 함수는 계속 서버 전용 키로 DB에 접근합니다. 이 점검은 `/data.json`이 404인지, 최신 파일에 메모 문장이 없는지만 확인할 뿐 API 권한 검사의 증거는 아닙니다.

## 보너스 XDR-02: 웹 주입 경보

`xdr/web-injection/decide.mjs`는 연습 경보를 `block`, `alert`, `record`로 분류하고, 실행 결과는 `xdr/web-injection/result.json`에 저장합니다. 결과를 다시 만들려면 저장소 루트에서 실행하세요.

```sh
npm run xdr:run -- web-injection
```

이 로컬 연습 실행은 실제 운영 XDR 또는 ZTNA 엔진에 연결된 것이 아닙니다. 실행 결과와 테스트는 실제로 수행한 뒤에만 확인된 것으로 기록하세요.

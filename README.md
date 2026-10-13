# 자료실 — 9단계 저장점

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
- **추가 확인 규칙**: 등록 기기의 요청이라도 아래 세 가지가 모두 맞고 아직 재확인이 되지 않았으면 `step_up`과 이유 코드 `step_up_required`로 응답합니다.
  1. 평소와 다른 시각(`signals.hour`가 22시~5시)
  2. 처음 보는 네트워크(`signals.network`가 `unusual`, 출처 `judge_fixture`)
  3. 최근 5분(300초) 안의 `risk_signal` 사건이 한 건에서 10회 이상(갑작스러운 대량 조회)
- 지역(`signals.region`)은 판정에 쓰지 않습니다. 지역 하나만으로는 접속을 막지 않습니다.
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

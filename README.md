# 자료실 — 5단계 저장점

## 현재 기능

- 브라우저는 로그인·회원가입을 `/api/auth`, 메모 조회·추가·수정·삭제를 `/api/notes` 서버 함수에 요청하며 Supabase를 직접 호출하지 않습니다. 화면 코드에는 Supabase 키가 없습니다.
- `/api/auth`가 서버에서 Supabase Auth에 인증 요청을 전달하고, 성공한 로그인 토큰은 브라우저의 `sessionStorage`에 저장됩니다. `/api/notes` 요청은 이 토큰을 Bearer 인증으로 전달합니다. 로그아웃하면 브라우저 저장소를 비웁니다.
- `/api/notes`는 로그인 사용자를 확인한 뒤 서버에서 `training_notes`를 조회·변경하고, 메모 소유자 조건을 적용합니다. 다른 사용자의 메모는 `404 {"error":"NOT_FOUND"}`로 응답합니다.

## 다시 실행하기

1. Supabase **SQL Editor**에서 아래 파일을 순서대로 실행하세요.
   1. `db/schema.sql`
   2. `db/policies.sql`
   3. `db/revoke-direct.sql`
2. `db/revoke-direct.sql`은 `public.training_notes`에서만 `PUBLIC`, `anon`, `authenticated`의 직접 테이블 권한을 회수합니다. 이 파일은 다른 테이블, RLS 설정·정책, `service_role` 권한을 변경하지 않습니다.
3. `db/revoke-direct.sql`의 `REVOKE` 앞 확인 쿼리 결과와 뒤 확인 쿼리 결과를 비교하세요. 뒤 결과에서 `anon`과 `authenticated`의 `can_select`, `can_insert`, `can_update`, `can_delete`는 모두 `false`여야 합니다. ACL 확인 결과에는 `PUBLIC`, `anon`, `authenticated` 권한이 없어야 하고, `service_role` 결과는 적용 전과 같아야 합니다. 역할 멤버십 등으로 간접 권한을 추가했다면 유효 권한 결과가 달라질 수 있으므로 따로 검토하세요.
4. Vercel 프로젝트의 **Settings → Environment Variables**에서 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY`를 직접 입력하세요. 비밀값은 코드나 문서에 기록하지 마세요. `/api/auth`는 서버에서 Supabase Auth REST를 호출하며 공개 키를 사용합니다.

## 남은 약점

- 옛 공개 커밋과 배포에는 과거 노출 기록이 남아 있습니다. 현재 구현이나 새 배포만으로 과거 기록이 사라지지는 않습니다.
- `/api/auth`에는 속도 제한이 없습니다.
- 메모 API의 서버 전용 키는 Vercel의 `SUPABASE_SECRET_KEY` 환경변수 하나에 의존합니다. 이 값은 브라우저 코드에 넣지 마세요.

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

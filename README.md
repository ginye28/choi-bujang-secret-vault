# BYTE BACK 방어전 시작 틀 R5

이 저장소는 1단계에서 학생 본인이 GitHub 저장소와 Vercel 배포를 만드는 출발점입니다. 포함된 메모 네 건은 가상 자료입니다. 실제 학생 자료, 토큰, 비밀키를 넣지 마세요.

## 학생이 하는 일: 세 걸음

1. GitHub 계정을 만듭니다.
2. 방어전 1단계 카드의 **Deploy** 버튼을 누릅니다. Vercel에 GitHub로 로그인하고, 새 저장소가 **본인 계정의 Public 저장소**인지 확인한 뒤 Deploy를 누릅니다.
3. 배포가 끝나면 화면에 나온 `https://…vercel.app` 주소를 방어전 1단계 카드에 붙여넣고 제출합니다. 저장소 주소나 설정 파일은 적지 않습니다.

배포가 끝나면 `/`에서 점령된 가상 자료실을 볼 수 있습니다. 화면은 이제 `/api/notes`를 호출하며, API가 Supabase의 `public.training_notes`에서 `title`, `content`를 읽습니다. 자료 조회 주소 `/api/notes`는 공개되어 있습니다. 이 공개 상태를 확인하고, 이후 제작 단계에서 접근을 제한해야 합니다. 1단계 접수와 심판 판정은 포털에서 확인합니다.

## 서버 함수 설정 및 공개 접근의 약점

Vercel 서버 함수 `api/notes.js`는 `SUPABASE_URL`과 서버 전용 `SUPABASE_SECRET_KEY` 환경변수로 Supabase에 연결합니다. Vercel 프로젝트 **Settings → Environment Variables**에서 서버 환경변수로 설정하세요. 비밀키는 브라우저 파일, API 응답, 로그, 저장소에 넣지 마세요. 코드나 대화에 실제 키를 적을 필요는 없습니다.

**현재 약점:** `/api/notes`에는 로그인 인증이나 사용자별 접근 검사가 없습니다. 누구나 공개 URL을 요청해 데이터베이스의 메모를 받을 수 있습니다. 함수의 서버 전용 키는 RLS를 우회할 수 있으므로, RLS 설정만으로 이 공개 API가 보호되지는 않습니다. 비공개 자료를 넣지 말고, 이후 단계에서 API의 인증·인가를 구현하세요.

테이블은 `db/schema.sql`로 만들고, 네 건의 가상 메모는 무시 대상인 로컬 `db/seed.local.sql`에 있습니다. 필요한 경우 Supabase SQL Editor에서 스키마와 시드를 순서대로 적용하세요. SQL 실행이나 배포 설정은 이 저장소에서 자동으로 적용되지 않습니다. `data.json`과 `public/data.json`은 메모가 비어 있으며, 화면은 더 이상 `/data.json`을 읽지 않습니다.

## 시작 틀의 자동 처리

`vercel.json`은 정적 결과물 `public`을 배포합니다. 빌드 명령 `npm run build`는 Vercel이 제공하는 GitHub 저장소 소유자·이름, 커밋 SHA, 배포 URL을 검증하고 `public/aleph.json`을 생성합니다. 이 값이 없으면 빌드가 실패하므로, 성공한 것처럼 빈 주소를 내보내지 않습니다. `aleph.json`의 내용만으로 저장소 소유권이나 방어 성공을 인정하지 않습니다. 심판이 공개 저장소의 실제 커밋과 배포된 자료를 따로 대조해야 합니다.

`aleph.config.json`의 `repoUrl`과 `publicAppUrl`은 이전 제출 묶음 방식의 자리표시자입니다. 1단계에서는 학생이 편집하지 않습니다. 2단계 이후 코딩 도구가 필요한 설정과 보호 기능을 단계별로 작성합니다. `npm run bundle`과 `bundle-notes.json`도 1단계의 세 걸음에는 포함되지 않습니다.

로컬에서 가상 화면만 확인할 때는 `npm run build -- --local`을 사용합니다. 로컬 실행은 Vercel 배포나 심판 접수를 증명하지 않습니다. 저장소의 `src/attack-check.mjs`는 실제 배포가 된 뒤 `/data.json`을 비로그인으로 요청해 공개 가상 메모의 확인 표시를 읽습니다.

## 다음 단계의 코딩 도구에 전달할 규칙

[AGENTS.md](AGENTS.md)를 먼저 읽히고 한 번에 한 제작 단위만 요청하세요. 2단계부터는 자료 보호를 구현할 때 `public/data.json`을 복사하는 1단계 빌드 흐름도 함께 바꿔야 합니다. 3단계 이후의 로그인, 허용 경로, 5단계의 원본 API 주소, 6단계 이후 정책 규칙은 해당 단계 원고와 계약에 맞춰 추가합니다. 비밀번호·토큰·서버 전용 키·실제 학생 기록을 코드, Git, 제출 묶음에 넣지 않습니다.

`src/decider.mjs`와 `src/detect.mjs`의 로컬 시험은 반 엔진이나 운영 심판의 결과가 아닙니다. 1단계 이후 제출 묶음 계약 `aleph.defense.submission.v2`는 `scripts/bundle.mjs`에 남아 있으며, 코딩 도구가 해당 단계의 최신 배포 주소와 Git 원격을 맞춘 뒤 사용합니다.

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

**남아 있는 공개 API 약점:** `/api/notes`에는 여전히 로그인·사용자별 접근 검사가 없고, 누구나 메모를 요청할 수 있습니다. 따라서 `/data.json`이 404인 것만으로 메모가 비공개가 된 것은 아닙니다. 서버 전용 Supabase 키를 사용하는 API는 RLS만으로 보호되지 않으므로, 인증·인가를 구현하기 전에는 비공개 자료를 넣지 마세요.

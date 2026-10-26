# 케셰브 (5차 방어전 13~22단계 보안 Agent)

이 브랜치(`keshev-final`)의 `on-client/` 는 ALEPH 5차 방어전에서 만든 로컬 보안 Agent 「케셰브」입니다. 버전은 **케셰브 학생판 0.9.0-rc.1(검증 중, v1.0 아님)**, 시작 틀은 `alekov-client-starter` 0.2.14 입니다.

- 실행 방법·구성도·확인 기록(21단계): [on-client/docs/STUDENT_RUNBOOK.md](on-client/docs/STUDENT_RUNBOOK.md)
- 새 폴더 재현 기록·릴리스 기록·데이터 보존 계획(22단계): [REPRODUCTION.md](REPRODUCTION.md)
- 다른 PC로 옮길 때: 이 브랜치를 새 빈 폴더에 `git clone` 하고 위 실행 설명서를 따릅니다. 설치할 npm 패키지가 없고 `.env` 도 필요 없습니다. 계정 연결 설정은 실행 도구가 그 PC의 사용자 폴더에 새로 만들며, 다른 PC의 설정·자격 정보를 복사하지 않습니다.

- **목적**: 내 PC의 브라우저 화면에서 로그인·기기·세션 상태, 업무 앱 접근 판정, 접속 기록과 XDR 경보, 연결 점검, AI 설명·조치 상태, 설치 패키지 취약점 조회 결과를 확인 불가·실패와 구분해 보여 줍니다.
- **기능(학생 작성, `on-client/student/extension.mjs`)**: `renderIdentity`(13), `renderDecision`(14), `renderEvents`(15), `renderStatus`(16), `renderAiConnection`(17), `renderExplanation`(17·18), `renderAction`(19), `renderVulnerabilities`(20). 그 밖의 `on-client/public/`, `src/`, `tools/`, `vendor/` 는 제공 코드(시작 틀 0.2.14)이며 수정하지 않았습니다.
- **구성**: 브라우저(`public/index.html`·`public/app.js`·`student/extension.mjs`) → 로컬 앱 서버 `src/server.mjs`(127.0.0.1:5189) → 접근 제어·XDR 시스템(SDP 연동 엔진, `-SdpHostConfig` 지정 시) / 수업용 AI 게이트(`src/connection/native-login.mjs`·`src/ai/`) / OSV(`src/vulnerabilities/`) / 조치(`src/actions/`).
- **지원 환경과 버전(확인함, 2026-10-23)**: Windows 11 Pro, Windows PowerShell 5.1, Node.js v24.19.0(시작 도구는 22~24 허용, 24.19.0 권장), Git 2.55. 외부 npm 의존성이 없어 `npm install` 과 `package-lock.json` 이 필요 없습니다.
- **실행 요약**: `on-client` 폴더에서 PowerShell 을 열고 `powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1` → 「케셰브가 켜졌습니다. 브라우저에서 http://127.0.0.1:5189/ 을 여세요.」가 보이면 그 주소를 엽니다. 종료는 Ctrl+C. 시험은 저장소 최상위에서 `node --test test/on-client/*.test.mjs`(46개 통과, 모의 DOM).
- **미확인**: 계정 연결 확인에서 게이트가 401 `ON_APP_NATIVE_SESSION_UNVERIFIED` 를 돌려줘 AI 앱 승인·실제 사건 설명·실제 조치 집행·SDP 연결은 확인하지 못했습니다. 이 항목들을 성공으로 적지 않습니다.

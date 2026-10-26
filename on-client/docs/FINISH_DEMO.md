# 케셰브 완성 시연 안내

## 행사와 판독 원칙

- 기준일: 2026-10-26. 행사: 2026 KIT K-뉴딜 SKT ALEPH 공동 방어전. 앱: 케셰브 학생판 0.9.0-rc.1(검증 중), ALEPH 5차 방어전 13~22단계 보안 Agent. 시작 틀 0.2.14, 브랜치 `keshev-final`.
- 작전은 관제 대시보드형 + 기본 포장으로 정했다. 실제 연결·조회가 확인되지 않은 결과는 성공으로 말하지 않고, 예제 자료는 설명용이며 실제 조회가 아니라고 시연 중에도 구분한다.
- 실제 모드와 예제 모드는 서로 다른 포트에서 띄운다. 예제 화면 머리말 `예제 데이터(demo) · 실제 연결 아님`을 확인한다.

## 시연 순서

### 1. 실제 모드: 연결 경계부터 보여 주기

`on-client` 디렉터리에서 PowerShell을 열어 실제 모드를 시작한다. 재현 안내의 일반 실행 명령은 다음과 같다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1
```

브라우저에서 `http://127.0.0.1:5189/`을 열고 첫 화면 「보호 현황」을 본다. 서버가 켜졌다는 사실은 계정·AI·SDP 연결 성공을 뜻하지 않는다. 기록 영역은 `연결 없음` 및 `기록을 불러오지 못했습니다(기록이 없다는 뜻 아님)`으로 설명한다. 업무 앱은 `ENGINE_NOT_CONNECTED`, 접속 요청 버튼 0개, 설치 패키지는 `not_configured`다. 학생 영역 8개도 함께 확인하되, 비어 있거나 조회 실패한 화면을 정상 데이터로 설명하지 않는다.

### 2. 예제 모드: 세 핵심 기능을 설명용으로 시연

실제 모드 창은 켜 둔 채 새 PowerShell 창을 하나 더 열고 같은 `on-client` 디렉터리에서 실행한다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1 -Demo -Port 5190
```

`http://127.0.0.1:5190/`에서 `예제 데이터(demo) · 실제 연결 아님`을 확인한 뒤 다음 순서로 보여 준다.

1. **보안 기록 보기·AI 설명**: 예제 기록 `event-01`을 기록 종류·업무 앱·접속 상태로 걸러 보고 상세를 연다. 「AI 설명 요청」은 기능 경계를 설명한다. 2026-10-23 예제 모드 기록에서는 `ON_AI_PROVISIONING_PENDING`과 사유가 학생 영역에 표시됐다. 이는 예제 결과이지 실제 사건 설명이 아니다. 근거 ID가 현재 기록과 맞지 않거나 응답을 검증할 수 없으면 설명을 사용하지 않는다는 점, 제안은 실행되지 않는다는 점도 설명한다.
2. **업무 앱 접속 판정·상태**: 「학습 자료실 접속 요청」의 예제 `allow`와 「개발 저장소 접속 요청」의 예제 `deny` 및 판정 시각을 비교한다. 둘 다 예제 판정이다. `allow`도 실제 앱 접속 성공을 보장하지 않는다. `challenge`, `unknown`, 요청 실패는 허용·거부와 다른 상태다.
3. **설치 패키지 취약점**: 「설치 패키지 조회」의 `not_configured`를 보여 준다. 조회 대상 프로젝트가 설정되지 않았다는 뜻이며 “취약점 없음”이 아니다. OSV 실제 조회가 완료된 것으로 말하지 않는다.

### 3. 한계와 다시 끄기

마지막에 계정 연결·AI 앱 승인·실제 사건 설명, SDP 접근 제어·XDR 실제 연결, 19단계 실제 조치 집행, OSV 실제 조회가 각각 미연결 또는 확인 불가인 상태라고 알린다. 실제 모드에서 보인 연결 실패와 예제 모드의 설명용 결과를 섞지 않는다. 빠른 실행 안내에 따라 각 PowerShell 창에서 `Ctrl+C`로 중지한다. 동일 결과를 다시 확인할 때는 `on-client/docs/QUICKSTART.md`의 실행·확인 순서를 따른다.

## 제공된 부분과 직접 개선한 부분

| 핵심 기능 | 제공된 부분 | 직접 개선한 부분과 경계 |
|---|---|---|
| 보안 기록 보기·AI 설명 | `public/app.js`의 기록 목록, 「AI 설명 요청」 버튼, 설명 검증 | `student/extension.mjs`의 `renderEvents`가 걸러 보기·상세와 실패/빈 목록을 구분한다. `renderExplanation`은 근거 ID를 대조하고 규칙·확인 불가 상태를 표시하며 제안을 실행하지 않는다. 실제 AI 설명 연결은 확인 불가다. |
| 업무 앱 접속 판정·상태 | 앱 목록과 「… 접속 요청」 버튼 | `renderDecision`은 `allow`·`deny`·`challenge`·`unknown`·요청 실패를 구분한다. `renderStatus`는 알림·기기·세션·연결 점검·도움정보를 표시하고 민감해 보이는 값은 가린다. 실제 모드에서는 요청 버튼이 없고 실제 판정도 없다. |
| 설치 패키지 취약점 | 「설치 패키지 조회」와 OSV 조회 서버 | `renderVulnerabilities`는 조회 전·중·실패를 구분하고 전체 상태 원래 값, 정확한 설치 버전 행, 일부 실패 때 받은 취약점 ID를 표시한다. `not_configured`와 조회 실패를 취약점 없음으로 취급하지 않는다. 실제 OSV 조회는 미연결이다. |

## 실제로 확인한 것과 설명용 근거

- **실제 모드에서 화면으로 확인함(2026-10-26 11:00~11:10 기록)**: 연결 없음, 기록 불러오기 실패가 기록 부재를 뜻하지 않는다는 안내, 업무 앱 `ENGINE_NOT_CONNECTED` 및 요청 버튼 0개, 패키지 `not_configured`. 실제 사건 기록·허용/거부 판정·OSV 결과를 조회한 것은 아니다.
- **설명용 예제**: 예제 기록 1건 `event-01`, 학습 자료실 `allow`, 개발 저장소 `deny`와 시각. 패키지는 `not_configured`. 이 값들은 실제 조회가 아니다. AI `ON_AI_PROVISIONING_PENDING`은 2026-10-23 예제 모드에서 확인된 예제 결과다.
- **미연결·확인 불가**: 계정 연결·AI 앱 승인 및 실제 사건 설명(게이트 `401 ON_APP_NATIVE_SESSION_UNVERIFIED`), SDP 접근 제어·XDR 실제 연결(설정 없음, 연결 없음), 19단계 실제 조치 집행(미준비), OSV 실제 조회(허용 목록 없음).
- **시험 기록**: 2026-10-26 11:16 `keshev-final` 폴더에서 `node --test test/on-client/*.test.mjs`를 다시 실행해 46개 통과, 실패 0(Node.js v24.19.0). 모의 DOM 시험이며 실제 연결 시험이 아니다.
- **새 폴더 재현 기록**: `keshev-final` 브랜치 맨 위 `REPRODUCTION.md`에 22단계 새 폴더 재현(커밋 `c7b69c8`) 기록이 있다. QUICKSTART 안내를 보고 따라 한 기록과 보완 뒤 다시 따라 한 기록은 `on-client/docs/FINISH_NOTES.md`에 있다. 실제로 개인정보를 지운 화면 파일의 경로는 미확인이다.

## 포장·대시보드 준비 한계

관제 대시보드형과 기본 포장을 선택했지만, 시작 틀 0.2.14에는 `npm run package-app` 명령이 없고 6일차 `npm run package-app -- … --finish-materials` 명령도 없다. 「내 PC 상태」 및 `student/appearance.json` 지원도 준비 대기다. 따라서 실행 패키지 생성·바로가기 생성은 미실시이며, 실행 패키지 경로·`APP_PACKAGE_MANIFEST.json`·`source.git.head`는 미확인이다. 패키지가 만들어졌거나 같은 커밋에서 나왔다고 주장하지 않는다.

## 근거 경로와 재현 순서

- 안내 및 명령: `on-client/docs/QUICKSTART.md` (기본 실행, 새 PowerShell 창의 예제 실행, 화면 표식, 종료).
- 실제 모드·예제 모드 관찰과 시작 틀의 준비 상태: `on-client/docs/FINISH_NOTES.md`.
- 새 폴더 22단계 재현: `keshev-final` 브랜치 맨 위 `REPRODUCTION.md`.
- 직접 개선한 화면 함수: `on-client/student/extension.mjs`의 `createStudentView`가 내보내는 `renderEvents`, `renderExplanation`, `renderDecision`, `renderStatus`, `renderVulnerabilities`.
- 실제 화면 관찰은 기록되어 있으나 별도 개인정보 제거 스크린샷 파일 경로는 미확인. 실행 패키지 경로 역시 미확인. 확인한 상대 경로만 기재했다.

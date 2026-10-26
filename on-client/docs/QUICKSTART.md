# 케셰브 빠른 실행 안내

## 1. 준비
- Windows 10 또는 11, Git, Node.js **24.19.0 권장**(22~24 허용).
- 외부 npm 의존성이 없어 `npm install`은 필요 없습니다. `.env`도 필요 없습니다.

## 2. 코드 받기
PowerShell에서 새 폴더를 둘 위치로 이동한 뒤 실행합니다.

```powershell
git clone --branch keshev-final https://github.com/ginye28/choi-bujang-secret-vault.git "<새 폴더>"
```

## 3. 기본 실행
파일 탐색기에서 `<새 폴더>\on-client`를 열고, 그 위치에서 PowerShell을 엽니다. 다음을 실행하세요.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1
```

정상 시작 때 표시되는 문구:

```text
계정 연결 준비가 끝났습니다. 앱에서 확인 번호로 로그인·승인을 진행하세요.
케셰브 연결 확인: http://127.0.0.1:5189
케셰브가 켜졌습니다. 브라우저에서 http://127.0.0.1:5189/ 을 여세요.
서버가 응답한 것만 확인했습니다. AI 연결 상태는 화면에서 따로 확인해 주세요.
끄려면 이 창에서 Ctrl+C 를 누르세요.
```

앱을 사용하는 동안 이 PowerShell 창은 열어 둡니다. 브라우저 주소: **http://127.0.0.1:5189/**. 첫 화면은 **보호 현황**입니다. 연결되지 않은 기본 실행에서 **연결 없음**이 보이는 것은 정상이며, 서버 시작은 계정·AI·SDP 연결 성공을 뜻하지 않습니다.

## 4. 예제 화면
기본 실행 창은 서버가 사용 중이므로 그대로 두세요. 새 PowerShell 창을 하나 더 열고, 같은 `<새 폴더>\on-client` 위치에서 다음을 실행합니다.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\start-alekov.ps1 -Demo -Port 5190
```

**http://127.0.0.1:5190/**을 열면 `예제 데이터(demo) · 실제 연결 아님`이 표시됩니다. 예제 화면의 데이터는 설명용 예시이며 실제 조회 결과가 아닙니다.

## 5. 끄기·다시 켜기
기본 실행은 PowerShell에서 `Ctrl+C`를 누릅니다(도구 안내: `끄려면 이 창에서 Ctrl+C 를 누르세요.`). 다시 켤 때는 같은 폴더에서 실행 명령을 다시 입력합니다. 창 없이 켠 경우 명령 끝에 `-Background`를 붙이고, `뒤에서 실행 중입니다(프로세스 번호 N).`에 안내된 번호의 `node` 프로세스를 작업 관리자에서 종료합니다.

## 6. 막혔을 때

| 상황 | 할 일 |
|---|---|
| 포트 사용 중 | `-Port 5190`으로 실행하고 `http://127.0.0.1:5190/`을 엽니다. 다른 프로그램은 종료하지 마세요. |
| Node 버전 안내 | 22~24인지 확인하세요. 권장 버전은 24.19.0입니다. |
| `NATIVE_HOST_BUSY` | 앱을 다시 켠 뒤 계정 연결을 다시 시도하세요. |
| 그 밖의 문제 | `on-client/docs/CONNECTION_TROUBLESHOOT.md`를 참고하세요. |

계정 연결 승인·AI·SDP는 이 안내만으로 연결되지 않습니다. 비밀값은 입력하거나 공유하지 마세요.
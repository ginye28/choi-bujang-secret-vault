# XDR 보너스 경보

이 폴더는 보너스 여섯 개의 연습 경보입니다. 경보는 수업용으로 만든 Wazuh 모양이며, 실제 로그가 아닙니다. 정답은 이 저장소에 없습니다.

## 경보 묶음

`xdr/fixtures/<moduleKey>.json` 을 읽습니다. `moduleKey` 는 아래 여섯 개입니다.

| moduleKey | 보는 것 |
|---|---|
| `brute-force` | 짧은 시간에 몰린 로그인 실패 |
| `web-injection` | 웹 요청에 섞인 주입 형태 |
| `known-cve` | 이미 공개된 취약점을 노린 요청 형태 |
| `persistence` | 다시 켜도 남도록 심긴 서비스·예약 작업 |
| `privilege` | 평범한 계정의 갑작스러운 권한 상승 |
| `exfiltration` | 처음 보는 곳으로 빠지는 큰 전송 |

한 파일에는 명확한 공격, 애매한 시도, 정상 이벤트가 함께 들어 있습니다. 주소는 문서용 대역만 쓰고, 계정은 `user01` 같은 가상 이름입니다. `known-cve` 의 원격 조회 구문은 문서용 표기입니다. 그 문자열을 다른 시스템에 넣거나 변형하지 않습니다.

## 학생이 만드는 파일

항목마다 `xdr/<moduleKey>/decide.mjs` 를 만듭니다. `decide(alert)` 를 내보냅니다. 비동기 함수여도 됩니다. 반환은 아래 세 값입니다.

- `action`: `block`, `alert`, `record` 중 하나
- `confidence`: 0 이상 1 이하 숫자
- `reason`: 짧은 이유

명확한 공격은 `block`, 애매한 시도는 `alert`, 정상 이벤트는 `record` 입니다. 경보 원본은 고치지 않습니다.

## 실행

저장소 루트에서 항목 키 하나를 넣습니다.

```
node scripts/xdr-run.mjs brute-force
```

`npm run xdr:run -- brute-force` 도 같은 명령입니다. 실행기는 해당 경보마다 `decide` 를 부르고, 결과를 `xdr/<moduleKey>/result.json` 에 씁니다. 형식은 `aleph.xdr.result.v1` 이고, `decisions` 에는 경보 id·행동·확신도·이유가, `counts` 에는 `block`·`alert`·`record` 건수가 있습니다.

반환 형식이 틀린 경보는 `record` 로 남고, 오류 한 줄이 출력됩니다. 실행기 자체는 네트워크를 쓰지 않습니다. 판정자는 격리된 환경에서 같은 명령을 다시 실행해 결과를 봅니다. 이미 커밋된 `result.json` 만으로 판정이 끝나지 않습니다.

## brute-force 차단 후보를 ZTNA 규칙으로 내보내기

`node scripts/xdr-ztna-sync.mjs` 는 실제 ZTNA 요청이나 네트워크에 접근하지 않는 로컬 연습용 어댑터입니다. brute-force 판정이 `block`, 확신도 0.95 이상이고, 등록된 T1110 패턴·심각도 10 이상·정상 성공 이벤트 제외 조건을 모두 만족한 경보만 `xdr/ztna-deny-rules.json` 에 별도 거부 규칙으로 추가합니다. 각 규칙에는 출발 주소, 근거 경보 ID, 생성 시각과 만료 시각이 포함되며 기본 만료는 15분(최대 24시간)입니다. 정상 이벤트가 관찰된 출발 주소는 후보 전체에서 제외합니다. 새 규칙 알림은 기존 내용을 보존해 `xdr/alerts.log` 에 JSON 한 줄씩 덧붙입니다.

`xdr/brute-force/connect-ztna.mjs` 의 `getActiveXdrDenyRules()` 는 만료되지 않은 규칙만 읽고, `isDeniedByXdrSourceAddress()` 는 신뢰된 실행 계층이 확인한 IP와 대조합니다. 현재 요청 계약에는 출발 IP가 없고 실제 운영 ZTNA 엔진도 이 저장소에 연결되어 있지 않으므로, 이 파일을 생성해도 실제 접속 차단이 활성화되지는 않습니다. 운영 적용 전에는 신뢰된 IP 전달 경로, 공유 IP로 인한 오탐 방지, 만료 규칙 정리와 엔진 측 등록 방법을 별도로 검토해야 합니다. `src/decider.mjs` 의 기존 규칙은 변경하지 않습니다.

## 웹 주입 차단 후보를 ZTNA 규칙으로 내보내기

`node xdr/web-injection/connect-ztna.mjs` 는 웹 주입 판정 결과를 로컬 전용 별도 거부 규칙에 연결합니다. 등록 패턴 이름이 판정 근거에 포함되고, `block` 확신도 0.85 이상·T1190·심각도 10 이상·요청 신호 반복 5회 이상·유효한 출발 IP를 모두 확인한 경보만 후보입니다. 같은 IP가 낮은 심각도의 비-T1190 정상 이벤트에도 나타나면 그 주소는 전체 후보에서 제외합니다. 규칙에는 근거 경보 ID와 생성·만료 시각이 있으며 기본 만료는 15분(최대 24시간)입니다. 새 규칙 알림은 `xdr/alerts.log` 에 JSON 한 줄씩 누적되며 반복 실행에서 같은 경보 규칙·알림을 중복 추가하지 않습니다.

`xdr/web-injection/connect-ztna.mjs` 의 `getActiveXdrDenyRules()` 는 만료 전 규칙을 반환하고 `isDeniedByXdrSourceAddress()` 는 호출자가 전달한 신뢰된 IP를 대조합니다. 이는 로컬 연결 어댑터이며 실제 운영 ZTNA 엔진의 요청 차단을 켜는 것은 아닙니다. `src/decider.mjs` 의 기존 규칙은 변경하지 않습니다.

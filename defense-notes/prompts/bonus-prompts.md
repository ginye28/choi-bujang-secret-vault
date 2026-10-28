# 보너스 카드 문구 (카드의 "문구 복사" 원문, 확인 줄 제외)

## XDR-01 무차별 로그인 공격을 잡아 냅니다 (80점)

### 이어받기
이 폴더는 내 ZTNA 판정기를 만든 같은 자료실이야. 이번에는 보너스 과제 「무차별 로그인 공격을 잡아 냅니다」를 할 거야. AGENTS.md와 README.md, 판정기 규칙 파일 위치, xdr 폴더, git 상태를 읽고 지금 판정기가 규칙을 어디서 읽는지 다섯 줄 이내로 알려 줘. 아직 아무 파일도 고치지 마.

### 만들기 1
xdr/fixtures/brute-force.json 의 Wazuh 경보를 읽어 시각·출발 주소·계정·규칙 수준·설명만 뽑는 읽기 모듈을 xdr/brute-force/read-alerts.mjs 로 만들어 줘. 원본 경보는 고치지 말고, 경보에 들어 있는 비밀값처럼 보이는 값은 출력하지 마.

### 만들기 2
이 공격의 알려진 형태를 xdr/brute-force/patterns.json 으로 정리해 줘. 근거는 MITRE ATT&CK T1110(무차별 대입) 이고, 신호는 짧은 시간 같은 주소의 로그인 실패 연속, 여러 계정에 같은 비밀번호 대입. 정도야. 패턴마다 이름·찾는 조건·근거 한 줄을 적고, 근거 없는 패턴은 넣지 마.

### 만들기 3
뽑은 경보를 패턴과 맞춰 본 뒤, 애매한 건만 Jev 에게 물어 확신도(0~1)를 받는 판단 모듈을 xdr/brute-force/decide.mjs 로 만들어 줘. decide(alert) 하나를 내보내고, 반환은 { action: 'block' | 'alert' | 'record', confidence, reason } 모양이야. 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record. Jev 가 응답하지 않으면 alert 로 떨어지게 해 줘. reason 에는 근거 패턴 이름을 한 줄로 적어.

### 만들기 4
차단 후보만 내 ZTNA 판정기의 거부 규칙으로 넣는 연결을 만들어 줘. 규칙에는 만료 시각과 근거 경보 번호를 붙이고, 정상 사용자를 막는 규칙은 넣지 마. 알림은 xdr/alerts.log 에 한 줄씩 쌓아 줘. 판정기의 기존 규칙은 고치지 마.

### 만들기 5
npm run xdr:run -- brute-force 를 실행해서 xdr/brute-force/result.json 을 만들고, block·alert·record 건수와 정상 이벤트를 block 한 경우가 있는지 알려 줘. 정상 이벤트를 막았으면 그 경보 하나만 골라 원인을 고쳐 줘.

### 제출 전 확인
npm run xdr:run -- brute-force 를 다시 실행해 result.json 을 갱신하고, 이번 변경을 「보너스 xdr-01 저장점」으로 커밋해 줘. 커밋 뒤 block·alert·record 건수를 한 줄로 보여 줘. 오류가 나면 첫 오류만 고쳐 줘.

## XDR-02 웹 주입 공격을 잡아 냅니다 (100점)

### 이어받기
이 폴더는 내 ZTNA 판정기를 만든 같은 자료실이야. 이번에는 보너스 과제 「웹 주입 공격을 잡아 냅니다」를 할 거야. AGENTS.md와 README.md, 판정기 규칙 파일 위치, xdr 폴더, git 상태를 읽고 지금 판정기가 규칙을 어디서 읽는지 다섯 줄 이내로 알려 줘. 아직 아무 파일도 고치지 마.

### 만들기 1
xdr/fixtures/web-injection.json 의 Wazuh 경보를 읽어 시각·출발 주소·계정·규칙 수준·설명만 뽑는 읽기 모듈을 xdr/web-injection/read-alerts.mjs 로 만들어 줘. 원본 경보는 고치지 말고, 경보에 들어 있는 비밀값처럼 보이는 값은 출력하지 마.

### 만들기 2
이 공격의 알려진 형태를 xdr/web-injection/patterns.json 으로 정리해 줘. 근거는 MITRE ATT&CK T1190(외부 공개 앱 악용) 이고, 신호는 요청 인자 안의 SQL 구문, 스크립트 태그, 경로 거슬러 올라가기(../) 반복. 정도야. 패턴마다 이름·찾는 조건·근거 한 줄을 적고, 근거 없는 패턴은 넣지 마.

### 만들기 3
뽑은 경보를 패턴과 맞춰 본 뒤, 애매한 건만 Jev 에게 물어 확신도(0~1)를 받는 판단 모듈을 xdr/web-injection/decide.mjs 로 만들어 줘. decide(alert) 하나를 내보내고, 반환은 { action: 'block' | 'alert' | 'record', confidence, reason } 모양이야. 확신도 0.85 이상은 block, 0.5 이상은 alert, 그 아래는 record. Jev 가 응답하지 않으면 alert 로 떨어지게 해 줘. reason 에는 근거 패턴 이름을 한 줄로 적어.

### 만들기 4
차단 후보만 내 ZTNA 판정기의 거부 규칙으로 넣는 연결을 만들어 줘. 규칙에는 만료 시각과 근거 경보 번호를 붙이고, 정상 사용자를 막는 규칙은 넣지 마. 알림은 xdr/alerts.log 에 한 줄씩 쌓아 줘. 판정기의 기존 규칙은 고치지 마.

### 만들기 5
npm run xdr:run -- web-injection 를 실행해서 xdr/web-injection/result.json 을 만들고, block·alert·record 건수와 정상 이벤트를 block 한 경우가 있는지 알려 줘. 정상 이벤트를 막았으면 그 경보 하나만 골라 원인을 고쳐 줘.

### 제출 전 확인
npm run xdr:run -- web-injection 를 다시 실행해 result.json 을 갱신하고, 이번 변경을 「보너스 xdr-02 저장점」으로 커밋해 줘. 커밋 뒤 block·alert·record 건수를 한 줄로 보여 줘. 오류가 나면 첫 오류만 고쳐 줘.

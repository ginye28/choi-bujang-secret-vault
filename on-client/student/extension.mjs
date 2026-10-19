// 이 파일은 학생이 같은 프로젝트에서 이어서 구현합니다.
// 제공 UI를 받은 것만으로 단계 완료를 인정하지 않습니다.

// ── 13단계: 로그인 사용자·기기·세션 표시 ─────────────────────────────────────
// 화면 문장은 지금 상태를 읽는 사람이 틀리지 않게 전하는 것이 기준입니다.
// 값은 textContent 로만 넣습니다(innerHTML 은 쓰지 않습니다). 색이 아니라 글자로도 상태를 구분합니다.
const DEVICE_LABELS = Object.freeze({ compliant: '보안 기준 충족', noncompliant: '보안 기준 미충족', unknown: '확인 불가' });
const SESSION_LABELS = Object.freeze({ active: '활성', expired: '만료', revoked: '철회됨', unknown: '확인 불가' });
const MODE_NOTICES = Object.freeze({ demo: '예제 자료(demo): 실제 연결이 아닙니다.', disconnected: '연결 없음(disconnected)', unknown: '확인 불가(unknown): 연결 상태를 확인할 수 없습니다.' });
// 정상처럼 보이면 안 되는 값: 화면에 "주의"를 글자로 덧붙입니다.
const DEVICE_ATTENTION = new Set(['noncompliant', 'unknown']);
const SESSION_ATTENTION = new Set(['expired', 'revoked', 'unknown']);

function textNode(tag, text, attrs = {}) {
  const node = document.createElement(tag);
  node.textContent = text;
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

// 서버가 준 코드를 한국어 뜻과 원래 값으로 함께 보여 줍니다. 목록에 없는 값은 확인 불가로 읽습니다.
function codeLabel(labels, value) {
  return Object.hasOwn(labels, value) ? `${labels[value]}(${value})` : `확인 불가(${String(value)})`;
}

function modeOf(resource) {
  return resource && typeof resource.mode === 'string' && ['connected', 'demo', 'disconnected', 'unknown'].includes(resource.mode) ? resource.mode : 'unknown';
}

function stateOf(resource) {
  return resource && ['loading', 'ok', 'error'].includes(resource.status) ? resource.status : 'unknown';
}

// 자료 하나(me·devices·sessions)의 제목 줄과 상태 안내. loading·error 에서도 mode 안내를 함께 보입니다.
function section(title, resource, key) {
  const box = textNode('section', '', { 'aria-label': title, 'data-student-section': key, 'data-student-state': stateOf(resource) });
  box.append(textNode('h3', title));
  const mode = modeOf(resource);
  if (mode !== 'connected') box.append(textNode('p', MODE_NOTICES[mode], { 'data-student-mode': mode }));
  const state = stateOf(resource);
  if (state === 'loading') box.append(textNode('p', '불러오는 중'));
  else if (state === 'error') {
    const message = resource.error && typeof resource.error.message === 'string' && resource.error.message ? resource.error.message : '서버가 오류 내용을 알려 주지 않았습니다.';
    // 연결에 실패했거나 확인할 수 없는 상태입니다. 이전에 보이던 사용자·기기·세션 값은 여기에 남기지 않습니다.
    box.append(textNode('p', `연결 실패: ${message}`, { role: 'alert' }));
    box.append(textNode('p', '값을 확인할 수 없습니다(확인 불가). 정상이라는 뜻이 아닙니다.'));
  } else if (state === 'unknown') box.append(textNode('p', '확인 불가: 응답 형식을 읽을 수 없습니다.'));
  return box;
}

function line(label, value, attention) {
  const item = textNode('li', '');
  item.append(textNode('span', `${label}: `), textNode('strong', value));
  if (attention) item.append(textNode('span', ' — 주의: 정상 상태가 아닙니다.', { 'data-student-attention': 'true' }));
  return item;
}

function present(value, fallback = '(없음)') {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function renderMe(me) {
  const box = section('현재 로그인', me, 'me');
  if (stateOf(me) !== 'ok') return box;
  const { user, device, session } = me.data && typeof me.data === 'object' ? me.data : {};
  if (!user || !device || !session) {
    box.append(textNode('p', '확인 불가: 사용자·기기·세션 값이 모두 오지 않았습니다.'));
    return box;
  }
  const list = textNode('ul', '');
  list.append(
    line('사용자', `${present(user.label, present(user.id))} (id: ${present(user.id)})`, false),
    line('기기', `${present(device.label, present(device.id))} (id: ${present(device.id)}) · ${codeLabel(DEVICE_LABELS, device.status)}`, DEVICE_ATTENTION.has(device.status) || !Object.hasOwn(DEVICE_LABELS, device.status)),
    line('세션', `id: ${present(session.id)} · ${codeLabel(SESSION_LABELS, session.status)}`, SESSION_ATTENTION.has(session.status) || !Object.hasOwn(SESSION_LABELS, session.status)),
  );
  box.append(list);
  return box;
}

function renderList(title, key, resource, emptyText, describe) {
  const box = section(title, resource, key);
  if (stateOf(resource) !== 'ok') return box;
  if (!Array.isArray(resource.data)) {
    box.append(textNode('p', '확인 불가: 목록 형식을 읽을 수 없습니다.'));
    return box;
  }
  if (resource.data.length === 0) {
    box.append(textNode('p', emptyText));
    return box;
  }
  const list = textNode('ul', '');
  for (const item of resource.data) list.append(describe(item && typeof item === 'object' ? item : {}));
  box.append(list);
  return box;
}

function renderIdentity(input) {
  const { me, devices, sessions } = input && typeof input === 'object' ? input : {};
  const root = textNode('div', '', { 'data-student-identity': 'true' });
  root.append(
    renderMe(me),
    renderList('내 기기 목록', 'devices', devices, '표시할 기기가 없습니다.', device => line(
      `${present(device.label, present(device.id))} (id: ${present(device.id)})`,
      codeLabel(DEVICE_LABELS, device.status),
      DEVICE_ATTENTION.has(device.status) || !Object.hasOwn(DEVICE_LABELS, device.status),
    )),
    renderList('내 세션 목록', 'sessions', sessions, '표시할 세션이 없습니다.', session => line(
      `세션 ${present(session.id)}`,
      codeLabel(SESSION_LABELS, session.status),
      SESSION_ATTENTION.has(session.status) || !Object.hasOwn(SESSION_LABELS, session.status),
    )),
  );
  return root;
}

export function createStudentView() {
  return {
    renderIdentity,
    renderDecision() { return '학생 구현 대기: 서버의 판정과 이유를 연결하세요.'; },
    renderEvents() { return '학생 구현 대기: 본인 접속·XDR 기록을 연결하세요.'; },
    renderStatus() { return '학생 구현 대기: 기기·세션·알림과 연결 점검 상태를 구분하세요.'; },
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection() { return '학생 구현 대기: 모델 응답 점검과 실제 사건 설명을 구분하고 AI 오류·취소·수동 복구를 안내하세요.'; },
    renderExplanation() { return '학생 구현 대기: 선택한 사건의 근거·규칙·현재 상태와 AI 설명을 연결하세요. 제안은 자동 실행하지 않습니다.'; },
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}

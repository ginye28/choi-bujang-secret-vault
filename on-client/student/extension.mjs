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
function section(title, resource, key, own = false) {
  const box = textNode('section', '', { 'aria-label': title, 'data-student-section': key, 'data-student-state': stateOf(resource) });
  box.append(textNode('h3', title));
  const mode = modeOf(resource);
  // 아직 요청하지 않은(idle) 자료에는 연결 상태가 없으므로 연결 안내를 붙이지 않습니다.
  if (mode !== 'connected' && !(resource && resource.status === 'idle')) box.append(textNode('p', MODE_NOTICES[mode], { 'data-student-mode': mode }));
  const state = stateOf(resource);
  if (state === 'loading') box.append(textNode('p', '불러오는 중'));
  else if (own && (state === 'error' || state === 'unknown')) { /* 호출한 화면이 직접 안내합니다 */ }
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

// ── 14단계: 업무 앱 접속 판정 표시 ───────────────────────────────────────────
// 서버가 돌려준 판정(allow·deny·challenge·unknown)과 요청 실패를 서로 다르게 보여 줍니다.
// 판정은 한국어 뜻과 원래 값을 함께 적고, 확인할 수 없는 값은 허용처럼 읽히지 않게 확인 불가로 둡니다.
const DECISION_INFO = Object.freeze({
  allow: { label: '접근 허용', note: '정책상 접근이 허용됐다는 뜻입니다. 실제 앱 접속 성공을 보장하지 않습니다.' },
  deny: { label: '접근 거부', note: '접근이 허용되지 않았습니다.' },
  challenge: { label: '추가 확인 필요', note: '추가 인증 또는 확인이 필요합니다. 이 앱이 추가 확인을 대신 수행하지 않았고, 접근은 아직 허용되지 않았습니다.' },
  unknown: { label: '판정 확인 불가', note: '판정을 확인할 수 없습니다. 허용되지 않았거나 정상이라는 뜻도 아닙니다.' },
});

function decisionBox(state, extra = {}) {
  return textNode('div', '', { 'data-student-decision': 'true', 'data-student-state': state, ...extra });
}

// 요청한 앱과 서버가 판정한 앱이 같은지 확인합니다. 다르면 다른 앱의 판정을 이 앱의 결과로 보이지 않게 합니다.
function appMatches(requestedAppId, data) {
  return typeof requestedAppId !== 'string' || requestedAppId === '' || data.appId === requestedAppId;
}

function renderDecision(input) {
  const view = input && typeof input === 'object' ? input : {};
  const state = ['idle', 'loading', 'ok', 'error'].includes(view.status) ? view.status : 'unknown';
  const appId = typeof view.appId === 'string' && view.appId !== '' ? view.appId : null;
  const box = decisionBox(state);
  const mode = modeOf(view);
  // idle 은 아직 요청 전이라 연결 상태가 없습니다. 요청한 뒤(loading·ok·error)에는 demo·disconnected·unknown 안내를 함께 보입니다.
  if (state !== 'idle' && mode !== 'connected') box.append(textNode('p', MODE_NOTICES[mode], { 'data-student-mode': mode }));

  if (state === 'idle') {
    box.append(textNode('p', '앱을 골라 접속을 요청하세요. 아직 요청하지 않았으므로 판정이 없습니다.'));
    return box;
  }
  if (state === 'loading') {
    box.append(textNode('p', appId ? `판정 확인 중: ${appId}` : '판정 확인 중'));
    return box;
  }
  if (state === 'error') {
    const message = view.error && typeof view.error.message === 'string' && view.error.message ? view.error.message : '서버가 오류 내용을 알려 주지 않았습니다.';
    // 요청 실패는 거부 판정이 아닙니다. 이전 판정 값은 남기지 않습니다.
    box.append(
      textNode('p', `요청 실패: ${message}`, { role: 'alert' }),
      textNode('p', '이것은 접근 거부 판정이 아니라 판정을 받지 못한 것입니다. 접근이 허용되지도 않았습니다(확인 불가).'),
    );
    return box;
  }
  const data = state === 'ok' && view.data && typeof view.data === 'object' ? view.data : null;
  if (!data) {
    box.append(textNode('p', '확인 불가: 판정 응답을 읽을 수 없습니다. 접근이 허용된 것이 아닙니다.'));
    return box;
  }
  if (!appMatches(appId, data)) {
    box.append(textNode('p', `확인 불가: 요청한 앱(${appId})과 판정의 앱(${String(data.appId)})이 다릅니다. 이 판정을 사용하지 않습니다.`));
    return box;
  }
  const known = Object.hasOwn(DECISION_INFO, data.decision);
  const info = known ? DECISION_INFO[data.decision] : DECISION_INFO.unknown;
  const code = known ? data.decision : `unknown, 받은 값: ${String(data.decision)}`;
  box.setAttribute('data-student-decision-code', known ? data.decision : 'unknown');
  const list = textNode('ul', '');
  list.append(
    line('업무 앱', present(data.appId)),
    line('판정', `${info.label}(${code})`),
    line('이유', present(data.reason, '(이유 없음)')),
    line('판정 시각', present(data.checkedAt, '(시각 없음)')),
  );
  box.append(list, textNode('p', info.note));
  return box;
}

// ── 15단계: 내 접속 기록과 XDR 경보 ──────────────────────────────────────────
// 받은 기록 배열 안에서만 걸러 보고(서버에 다시 묻지 않음), 행마다 상세를 엽니다.
// 새 자료가 오면 renderEvents 가 새 요소를 만들어 돌려주므로 이전 목록·상세·걸러 보기 상태는 남지 않습니다.
const KIND_LABELS = Object.freeze({ access: '접속', xdr: 'XDR 경보' });
const ACCESS_LABELS = Object.freeze({ allowed: '허용됨', denied: '거부됨', unknown: '확인 불가' });
const NO_APP = '__none__'; // appId 가 없는 옛 기록을 고르는 값

function appText(appId) {
  return typeof appId === 'string' && appId !== '' ? appId : '앱을 확인할 수 없음(appId 없음)';
}

// 시각은 서버가 준 원래 값과 한국 시각을 함께 적습니다. 읽을 수 없는 시각은 그대로 두고 확인 불가라고 알립니다.
function timeText(at) {
  const ms = Date.parse(at);
  if (!Number.isFinite(ms)) return `${String(at)} (시각을 읽을 수 없음)`;
  const kst = new Date(ms).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });
  return `${at} (한국 시각 ${kst})`;
}

function kindText(kind) {
  return Object.hasOwn(KIND_LABELS, kind) ? `${KIND_LABELS[kind]}(${kind})` : `확인 불가(${String(kind)})`;
}

// 종류 선택지는 접속·XDR 경보 순으로 두고, 모르는 종류는 그 뒤에 이름순으로 둡니다.
function kindsPresent(events) {
  const present_ = [...new Set(events.map(e => e.kind))];
  const known = Object.keys(KIND_LABELS).filter(k => present_.includes(k));
  const other = present_.filter(k => !known.includes(k)).sort((a, b) => String(a).localeCompare(String(b)));
  return [...known, ...other];
}

function validEvent(event) {
  return event !== null && typeof event === 'object' && typeof event.id === 'string' && event.id !== '';
}

function listOf(value) {
  return Array.isArray(value) ? value.filter(row => row && typeof row === 'object') : [];
}

function labelledSelect(id, name, options) {
  const wrap = textNode('div', '');
  const label = textNode('label', name, { for: id });
  const select = textNode('select', '', { id, 'aria-label': name });
  for (const [value, text] of options) select.append(textNode('option', text, { value }));
  wrap.append(label, select);
  return { wrap, select };
}

function detailView(event) {
  const detail = textNode('div', '', { 'data-student-event-detail': event.id, role: 'region', 'aria-label': `${event.id} 상세 내용` });
  detail.append(textNode('h4', `사건 ${event.id}`));
  const base = textNode('ul', '');
  base.append(
    line('사건 ID', event.id),
    line('업무 앱', appText(event.appId)),
    line('종류', kindText(event.kind)),
    line('시각', timeText(event.at)),
    line('요약', present(event.summary, '(요약 없음)')),
  );
  detail.append(base);

  const evidence = listOf(event.evidence);
  detail.append(textNode('h5', '근거'));
  if (evidence.length === 0) detail.append(textNode('p', '근거가 없습니다.'));
  else { const ul = textNode('ul', ''); for (const row of evidence) ul.append(line(present(row.id, '(id 없음)'), present(row.text, '(내용 없음)'))); detail.append(ul); }

  const rules = listOf(event.rules);
  detail.append(textNode('h5', '적용된 규칙'));
  if (rules.length === 0) detail.append(textNode('p', '표시할 규칙이 없습니다.'));
  else { const ul = textNode('ul', ''); for (const row of rules) ul.append(line(present(row.id, '(id 없음)'), present(row.text, '(내용 없음)'))); detail.append(ul); }

  const state = event.state && typeof event.state === 'object' ? event.state : {};
  detail.append(textNode('h5', '상태(세 값은 따로 봅니다)'));
  const states = textNode('ul', '');
  states.append(
    line('접속 상태(access)', codeLabel(ACCESS_LABELS, state.access), !Object.hasOwn(ACCESS_LABELS, state.access) || state.access !== 'allowed'),
    line('세션 상태(session)', codeLabel(SESSION_LABELS, state.session), SESSION_ATTENTION.has(state.session) || !Object.hasOwn(SESSION_LABELS, state.session)),
    line('기기 상태(device)', codeLabel(DEVICE_LABELS, state.device), DEVICE_ATTENTION.has(state.device) || !Object.hasOwn(DEVICE_LABELS, state.device)),
  );
  detail.append(states);
  // 16단계: 서버가 자동 확인이 연결되지 않은 조치를 넘겨 줄 때만, 요청을 보내지 않는 비활성 안내 버튼을 둡니다.
  // 지금 실제 목록은 supportedActions 가 비어 있어 버튼이 없습니다. 이 버튼은 어떤 요청도 보내지 않습니다.
  const actions = Array.isArray(event.supportedActions) ? event.supportedActions.filter(a => typeof a === 'string' && a !== '') : [];
  if (actions.length > 0) {
    detail.append(textNode('h5', '조치'));
    for (const action of actions) {
      const name = `${action} 미지원`;
      detail.append(
        textNode('button', name, { type: 'button', disabled: 'disabled', 'aria-disabled': 'true', 'aria-label': name }),
        textNode('p', `${action}: 조치 실행 연결은 준비 중입니다. 아직 지원하지 않는 조치이며 요청을 보내지 않았고, 실행되지 않았습니다.`),
      );
    }
  }
  return detail;
}

function renderEvents(input) {
  const view = input && typeof input === 'object' ? input : {};
  const state = stateOf(view);
  const root = textNode('div', '', { 'data-student-events': 'true', 'data-student-state': state });
  const mode = modeOf(view);
  if (mode !== 'connected') root.append(textNode('p', MODE_NOTICES[mode], { 'data-student-mode': mode }));

  if (state === 'loading') { root.append(textNode('p', '기록을 불러오는 중')); return root; }
  if (state === 'error') {
    const message = view.error && typeof view.error.message === 'string' && view.error.message ? view.error.message : '서버가 오류 내용을 알려 주지 않았습니다.';
    const code = view.error && typeof view.error.code === 'string' ? view.error.code : '';
    // 실패는 빈 목록이 아닙니다. 이전 목록과 상세는 남기지 않습니다.
    root.append(textNode('p', `기록을 불러오지 못했습니다: ${message}`, { role: 'alert' }));
    root.append(textNode('p', (code === 'CONTRACT_MISMATCH' || code === 'ENGINE_RESULT_UNVERIFIED')
      ? '확인 불가: 서버 응답 형식을 확인할 수 없어 기록을 표시하지 않습니다. 기록이 없다는 뜻이 아닙니다.'
      : '기록이 없다는 뜻이 아닙니다. 위쪽 다시 불러오기 버튼으로 직접 다시 시도하세요.'));
    return root;
  }
  if (state !== 'ok' || !Array.isArray(view.data)) { root.append(textNode('p', '확인 불가: 기록 응답을 읽을 수 없어 목록을 표시하지 않습니다.')); return root; }

  const events = view.data.filter(validEvent)
    .sort((a, b) => (Date.parse(b.at) || 0) - (Date.parse(a.at) || 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (events.length === 0) { root.append(textNode('p', '표시할 기록이 없습니다.')); return root; }

  const apps = [...new Set(events.map(e => (typeof e.appId === 'string' && e.appId !== '' ? e.appId : NO_APP)))].sort();
  const kindFilter = labelledSelect('student-events-kind', '기록 종류', [['all', '전체'], ...kindsPresent(events).map(k => [String(k), kindText(k)])]);
  const appFilter = labelledSelect('student-events-app', '업무 앱', [['all', '전체'], ...apps.map(a => [a, a === NO_APP ? appText(null) : a])]);
  const accessFilter = labelledSelect('student-events-access', '접속 상태', [['all', '전체'], ...Object.entries(ACCESS_LABELS).map(([v, t]) => [v, `${t}(${v})`])]);
  const filters = textNode('div', '', { role: 'group', 'aria-label': '걸러 보기' });
  filters.append(kindFilter.wrap, appFilter.wrap, accessFilter.wrap);

  const summary = textNode('p', '', { role: 'status' });
  const list = textNode('ul', '', { 'aria-label': '접속 기록과 XDR 경보' });
  const detailSlot = textNode('div', '', { 'aria-live': 'polite' });

  let openId = null;
  function showDetail(event) {
    detailSlot.textContent = '';
    detailSlot.append(detailView(event));
    openId = event.id;
  }

  function draw() {
    const kind = kindFilter.select.value;
    const app = appFilter.select.value;
    const access = accessFilter.select.value;
    const shown = events.filter(e => (kind === 'all' || String(e.kind) === kind)
      && (app === 'all' || (typeof e.appId === 'string' && e.appId !== '' ? e.appId : NO_APP) === app)
      && (access === 'all' || (e.state && e.state.access) === access));
    list.textContent = '';
    summary.textContent = `전체 ${events.length}건 중 ${shown.length}건 표시`;
    if (shown.length === 0) {
      list.append(textNode('li', '조건에 맞는 기록이 없습니다. 걸러 보기를 바꿔 보세요.'));
      return;
    }
    for (const event of shown) {
      const row = textNode('li', '', { 'data-student-event-id': event.id });
      row.append(
        textNode('strong', event.id),
        textNode('span', ` · ${timeText(event.at)} · ${kindText(event.kind)} · ${appText(event.appId)} · ${present(event.summary, '(요약 없음)')} `),
      );
      const button = textNode('button', '상세', { type: 'button', 'aria-label': `${event.id} 상세` });
      button.addEventListener('click', () => showDetail(event));
      row.append(button);
      list.append(row);
    }
    // 걸러서 사라진 행의 상세는 남기지 않습니다.
    if (openId !== null && !shown.some(e => e.id === openId)) { detailSlot.textContent = ''; openId = null; }
  }

  for (const f of [kindFilter, appFilter, accessFilter]) f.select.addEventListener('change', draw);
  draw();
  root.append(filters, summary, list, detailSlot);
  return root;
}

// ── 16단계: 알림·기기·세션·연결 점검·오류·빈 화면 ────────────────────────────
// 실패·빈 화면·불러오는 중을 서로 다르게 보이고, 다시 시도는 사용자가 위쪽 다시 불러오기 버튼을 직접 누를 때만 일어납니다.
// 이 함수는 어떤 요청도 보내지 않고 자동으로 다시 시도하지 않습니다. 도움정보에는 비밀값이 들어가지 않습니다.
const SECRET_PATTERN = /(?:Bearer\s+\S+|sk-(?:proj-|ant-|svcacct-)?[A-Za-z0-9_-]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(?:api[_ -]?key|authorization|password|secret|token|비밀번호|토큰|열쇠)\s*[:=]\s*\S+)/giu;

// 화면과 복사 내용에 쓰는 값: 비밀로 보이는 부분은 가리고 길이를 제한합니다.
function safeValue(value, max = 200) {
  if (value === null || value === undefined) return '(없음)';
  const text = String(value).replace(SECRET_PATTERN, '[가림]');
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isTimeout(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  const message = error && typeof error.message === 'string' ? error.message : '';
  return /TIMEOUT/iu.test(code) || /시간\s*초과|timed?\s*out/iu.test(message);
}

const RETRY_GUIDE = '다시 시도는 위쪽 다시 불러오기 버튼을 직접 누르세요. 자동으로 다시 요청하지 않습니다.';

// 자료 하나(기기·세션)의 불러오는 중·실패·빈 목록·목록을 서로 다른 문장으로 그립니다.
function statusSection(title, key, resource, emptyText, describe) {
  const box = section(title, resource, key, true); // mode 안내·불러오는 중은 13단계 도구를 그대로 쓰고, 실패 안내는 이 화면에서 씁니다.
  const state = stateOf(resource);
  if (state === 'unknown') { box.append(textNode('p', '확인 불가: 자료 응답을 읽을 수 없습니다. 비어 있다는 뜻이 아닙니다.')); return box; }
  if (state === 'error') {
    const message = resource.error && typeof resource.error.message === 'string' && resource.error.message ? safeValue(resource.error.message) : '서버가 오류 내용을 알려 주지 않았습니다.';
    box.append(textNode('p', `${title === '세션' ? '세션 정보를' : '기기 목록을'} 불러오지 못했습니다${isTimeout(resource.error) ? '(시간 초과)' : ''}: ${message}`, { role: 'alert' }), textNode('p', RETRY_GUIDE));
    return box;
  }
  if (state !== 'ok') return box;
  if (!Array.isArray(resource.data)) { box.append(textNode('p', '확인 불가: 목록 형식을 읽을 수 없습니다.')); return box; }
  if (resource.data.length === 0) { box.append(textNode('p', emptyText)); return box; }
  const list = textNode('ul', '');
  for (const item of resource.data) list.append(describe(item && typeof item === 'object' ? item : {}));
  box.append(list);
  return box;
}

function notificationsSection(notifications) {
  const box = textNode('section', '', { 'aria-label': '알림', 'data-student-section': 'notifications' });
  box.append(textNode('h3', '알림'));
  const rows = Array.isArray(notifications) ? notifications.filter(n => n && typeof n === 'object') : null;
  if (rows === null) { box.append(textNode('p', '확인 불가: 알림 목록을 읽을 수 없습니다.')); return box; }
  if (rows.length === 0) { box.append(textNode('p', '주의할 알림이 없습니다.')); return box; }
  const list = textNode('ul', '');
  for (const n of rows) list.append(line(`자료: ${safeValue(n.resource, 40)} · 코드: ${safeValue(n.code, 60)}`, safeValue(n.message), true));
  box.append(list);
  return box;
}

// 비밀 없는 연결 점검 값만 고릅니다.
function diagnosticsFields(data) {
  const d = data && typeof data === 'object' ? data : {};
  const engine = d.engine && typeof d.engine === 'object' ? d.engine : {};
  return [
    ['requestId', d.requestId], ['component', d.component], ['version', d.version], ['checkedAt', d.checkedAt],
    ['engine.mode', engine.mode], ['engine.code', engine.code],
  ];
}

function diagnosticsSection(diagnostics) {
  const state = stateOf(diagnostics);
  const box = section('연결 점검', diagnostics, 'diagnostics', true);
  if (state === 'unknown') {
    box.append(textNode('p', diagnostics && diagnostics.status === 'idle'
      ? '연결 점검 전입니다(아직 요청하지 않음). 점검은 제공 화면의 버튼을 직접 눌러 실행합니다.'
      : '확인 불가: 연결 점검 응답을 읽을 수 없습니다.'));
    return box;
  }
  if (state === 'error') {
    const message = diagnostics.error && typeof diagnostics.error.message === 'string' && diagnostics.error.message ? safeValue(diagnostics.error.message) : '서버가 오류 내용을 알려 주지 않았습니다.';
    box.append(textNode('p', `연결 점검 결과를 불러오지 못했습니다${isTimeout(diagnostics.error) ? '(시간 초과)' : ''}: ${message}`, { role: 'alert' }), textNode('p', RETRY_GUIDE));
    return box;
  }
  if (state !== 'ok') return box;
  const list = textNode('ul', '');
  for (const [name, value] of diagnosticsFields(diagnostics.data)) list.append(line(name, safeValue(value, 80)));
  box.append(list);
  return box;
}

// 도움 요청에 붙여 넣을 안전한 요약. 사용자가 버튼을 누를 때만 만듭니다.
function helpText(input) {
  const part = (resource, describe) => {
    const state = stateOf(resource);
    if (state !== 'ok') return `${state}${state === 'error' && resource.error ? `(${safeValue(resource.error.code, 60)})` : ''}`;
    return Array.isArray(resource.data) ? `${resource.data.length}건${resource.data.length ? ` — ${resource.data.map(describe).join(', ')}` : ''}` : '확인 불가';
  };
  const lines = [
    `연결 모드: ${modeOf({ mode: input.mode })}`,
    `기기: ${part(input.devices, d => `${safeValue(d.id, 40)}=${safeValue(d.status, 20)}`)}`,
    `세션: ${part(input.sessions, s => `${safeValue(s.id, 40)}=${safeValue(s.status, 20)}`)}`,
    `알림: ${Array.isArray(input.notifications) ? input.notifications.map(n => `${safeValue(n && n.resource, 30)}/${safeValue(n && n.code, 40)}`).join(', ') || '없음' : '확인 불가'}`,
    `연결 점검: ${stateOf(input.diagnostics)}`,
    ...(stateOf(input.diagnostics) === 'ok' ? diagnosticsFields(input.diagnostics.data).map(([n, v]) => `  ${n}: ${safeValue(v, 80)}`) : []),
  ];
  return lines.join('\n');
}

function renderStatus(input) {
  const view = input && typeof input === 'object' ? input : {};
  const root = textNode('div', '', { 'data-student-status': 'true' });
  const mode = modeOf(view);
  if (mode !== 'connected') root.append(textNode('p', MODE_NOTICES[mode], { 'data-student-mode': mode }));
  root.append(
    statusSection('기기', 'devices', view.devices, '등록된 기기가 없습니다.', d => line(
      `${present(d.label, present(d.id))} (id: ${present(d.id)})`, codeLabel(DEVICE_LABELS, d.status),
      DEVICE_ATTENTION.has(d.status) || !Object.hasOwn(DEVICE_LABELS, d.status))),
    statusSection('세션', 'sessions', view.sessions, '현재 연결된 세션이 없습니다.', s => line(
      `세션 ${present(s.id)}`, codeLabel(SESSION_LABELS, s.status),
      SESSION_ATTENTION.has(s.status) || !Object.hasOwn(SESSION_LABELS, s.status))),
    textNode('p', '세션은 지금 검증된 연결 하나만 보입니다. 지난 세션 목록이 아닙니다.'),
    notificationsSection(view.notifications),
    diagnosticsSection(view.diagnostics),
  );
  const help = textNode('div', '', { 'data-student-help': 'true' });
  const result = textNode('p', '', { role: 'status' });
  const button = textNode('button', '도움정보 복사', { type: 'button', 'aria-label': '도움정보 복사' });
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(helpText(view));
      result.textContent = '도움정보를 복사했습니다. 도움을 요청할 때 붙여 넣으세요.';
    } catch {
      result.textContent = '복사하지 못했습니다. 브라우저의 복사 권한을 확인하세요. 아무 내용도 전송되지 않았습니다.';
    }
  });
  help.append(
    textNode('p', '도움정보는 도움을 요청할 때 쓰도록 연결 상태 요약을 복사하는 것입니다. 열쇠·토큰·비밀번호는 들어가지 않으며, 버튼을 누를 때만 복사합니다.'),
    button, result,
  );
  root.append(help);
  return root;
}

// ── 17단계: 수업용 AI(알레프게이트) 연결 점검과 사건 설명 기초 ─────────────────────────────
// 연결 점검(모델 목록 확인)과 실제 사건 설명 실행은 서로 다른 일입니다. 점검이 ok 여도 사건 설명이 된 것으로 쓰지 않습니다.
// 이 함수들은 어떤 요청도 보내지 않고 자동으로 다시 점검하지 않습니다. 호출할 때마다 새 화면을 만들어
// 이전 점검 결과(권한·인증 오류 안내 등)가 남지 않습니다. 열쇠·토큰·원문 오류는 safeValue 로 가려서만 보입니다.
const AI_AUDIENCE_LABELS = Object.freeze({ test: '시험 연결 점검(test)', verified: '앱 권한 확인 후 점검(verified)' });

// 오류 코드를 원인별 안내로 나눕니다. 먼저 맞는 항목이 이깁니다(예: RATE_LIMIT 는 한도가 아니라 요청 제한).
const AI_ERROR_GUIDES = Object.freeze([
  { key: 'cancelled', pattern: /CANCEL|ABORT/iu, title: '취소', guide: '취소되었습니다. 이전 점검 결과는 현재 결과가 아닙니다. 필요하면 직접 다시 점검하세요.' },
  { key: 'rate-timeout-network', pattern: /RATE|TOO_MANY|429|TIMEOUT|TIMED?_?OUT|NETWORK|OFFLINE|FETCH|ECONN|UNREACHABLE/iu, title: '요청 제한·시간 초과·네트워크', guide: '잠시 뒤에 직접 다시 점검하세요. 자동으로 다시 점검하지 않습니다.' },
  { key: 'no-model', pattern: /NO_?MODEL|MODEL_NOT|MODELS?_(?:EMPTY|NONE|UNAVAILABLE)|MODEL_COUNT/iu, title: '쓸 수 있는 모델 없음', guide: '담당자에게 모델 허용 설정 확인을 요청하세요.' },
  { key: 'hours', pattern: /HOURS|TIME_WINDOW|SCHEDULE|OUTSIDE_|CLOSED|NOT_OPEN/iu, title: '이용 시간', guide: '이용 시간이 아닙니다. 이용 시간을 확인하세요.' },
  { key: 'limits', pattern: /QUOTA|USAGE|BUDGET|CLASS_(?:LIMIT|CAP)|LIMIT_EXCEEDED|EXHAUST/iu, title: '사용량·한도', guide: '반 사용량 또는 이용 한도 문제입니다. 담당자에게 확인하세요.' },
  { key: 'forbidden', pattern: /FORBID|DENIED|ACCESS|403|BLOCK/iu, title: '접근 제한', guide: '접근이 제한되었습니다. 계정 연결을 다시 확인하고 담당자에게 문의하세요.' },
  { key: 'auth', pattern: /AUTH|LOGIN|TOKEN|CREDENTIAL|401|EXPIRED/iu, title: '인증', guide: '인증에 실패했습니다. 계정 연결을 다시 확인하고, 계속되면 담당자에게 문의하세요.' },
  { key: 'permission-pending', pattern: /PREPAR|PENDING|NOT_READY|UNVERIFIED|NOT_CONNECTED|NO_AUDIENCE|PERMISSION|UNAVAILABLE/iu, title: '권한 준비 중·확인 불가', guide: '운영 측 계정·앱 권한 준비 중이거나 확인할 수 없는 상태입니다. 학생 잘못이 아닙니다. 담당자에게 계정 연결과 앱 권한 확인을 요청하세요.' },
]);

function aiErrorGuide(error) {
  const code = error && typeof error.code === 'string' ? error.code : '';
  return AI_ERROR_GUIDES.find(item => item.pattern.test(code)) ?? {
    key: 'unknown', title: '확인 불가', guide: '원인을 확인할 수 없습니다. 연결 상태를 확인하고 담당자에게 문의하세요.' };
}

function aiErrorBox(error) {
  const guide = aiErrorGuide(error);
  const box = textNode('div', '', { 'data-student-ai-error': guide.key });
  box.append(
    textNode('p', `AI 연결 점검 실패: ${guide.title}`),
    textNode('p', `오류 코드: ${safeValue(error && error.code, 60)} · 메시지: ${safeValue(error && error.message, 160)}`),
    textNode('p', guide.guide),
  );
  return box;
}

function renderAiConnection(input) {
  const view = input && typeof input === 'object' ? input : {};
  const root = textNode('div', '', { 'data-student-ai-connection': 'true' });
  const mode = modeOf(view);
  if (mode !== 'connected') root.append(textNode('p', MODE_NOTICES[mode], { 'data-student-mode': mode }));
  const status = view.status;
  if (status === 'idle') {
    root.setAttribute('data-student-ai-state', 'idle');
    root.append(textNode('p', 'AI 연결 점검 전'));
  } else if (status === 'loading') {
    root.setAttribute('data-student-ai-state', 'loading');
    root.append(textNode('p', 'AI 연결 점검 중', { role: 'status' }));
  } else if (status === 'ok' && view.data && typeof view.data === 'object') {
    root.setAttribute('data-student-ai-state', 'ok');
    const audience = Object.hasOwn(AI_AUDIENCE_LABELS, view.data.audienceAuthorization) ? AI_AUDIENCE_LABELS[view.data.audienceAuthorization] : `확인 불가(${safeValue(view.data.audienceAuthorization, 30)})`;
    root.append(
      textNode('p', `AI 연결 점검 결과: ${audience}`),
      textNode('p', `사용할 수 있는 모델 수: ${safeValue(view.data.modelCount, 20)} · 점검 시각: ${safeValue(view.checkedAt, 40)}`),
      textNode('p', view.explanationAccepted === true
        ? '사건 설명은 사건 설명 화면에서 따로 확인한 결과가 있습니다. 이 연결 점검 결과와는 별개입니다.'
        : '연결만 점검했습니다. 사건 설명은 아직 실행하지 않았습니다. 모델 목록 응답은 사건 설명이 아닙니다.', { 'data-student-ai-note': 'connection-only' }),
    );
  } else if (status === 'error') {
    root.setAttribute('data-student-ai-state', 'error');
    root.append(aiErrorBox(view.error));
  } else {
    root.setAttribute('data-student-ai-state', 'unknown');
    root.append(textNode('p', '확인 불가: AI 연결 점검 상태를 읽을 수 없습니다.'));
  }
  root.append(textNode('p', '다시 점검은 「현재 API 연결 점검」 버튼을 직접 누르는 것입니다. 자동으로 다시 점검하지 않습니다.'));
  return root;
}

// 18단계에서 넓힙니다. 지금은 설명이 성공일 때만 사건 표시(data-student-explanation-event)를 붙입니다.
function renderExplanation(input) {
  const view = input && typeof input === 'object' ? input : {};
  const explanation = view.explanation && typeof view.explanation === 'object' ? view.explanation : {};
  const eventId = view.event && typeof view.event === 'object' ? safeValue(view.event.id, 80) : '(없음)';
  if (explanation.status === 'ok' && explanation.data && typeof explanation.data === 'object') {
    const root = textNode('div', '', { 'data-student-explanation-event': String(eventId) });
    root.append(
      textNode('p', `사건 ID: ${eventId}`),
      textNode('p', `AI 설명 요약: ${safeValue(explanation.data.summary, 400)}`),
      textNode('p', `확인 시각: ${safeValue(view.checkedAt, 40)}`),
    );
    return root;
  }
  const root = textNode('div', '', { 'data-student-explanation-failed': 'true' });
  const error = explanation.error && typeof explanation.error === 'object' ? explanation.error : {};
  root.append(
    textNode('p', `AI 설명을 받지 못했습니다. 사건 ID: ${eventId}`),
    textNode('p', `오류 코드: ${safeValue(error.code, 60)} · 메시지: ${safeValue(error.message, 160)}`),
    textNode('p', '사건 기록과 접속 판정은 그대로입니다. AI 설명 실패가 기존 기록을 바꾸지 않습니다.'),
  );
  return root;
}

export function createStudentView() {
  return {
    renderIdentity,
    renderDecision,
    renderEvents,
    renderStatus,
    renderVulnerabilities() { return '학생 구현 대기: 정확한 설치 버전·OSV 출처·조회 시각·부분 결과·조회 실패를 구분하세요.'; },
    renderAiConnection,
    renderExplanation,
    renderAction() { return '학생 구현 대기: 현재 사건·조치·실제 대상·사람 확인·ACK와 원천 효과·unknown을 구분하세요.'; },
  };
}

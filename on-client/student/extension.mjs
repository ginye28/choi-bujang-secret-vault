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

// 여러 코드가 같은 안내를 쓰는 경우 문장을 한 번만 둡니다.
const ASK = '담당자에게 확인하세요.';
const NOT_STUDENT = '학생 잘못이 아닙니다. 담당자에게 계정 권한, native 호스트 설정, 수업용 AI 게이트 반영 여부를 확인해 달라고 요청하세요.';
const TIMEOUT_GUIDE = 'AI 응답 시간이 초과됐습니다. 연결 상태를 확인한 뒤 필요하면 직접 다시 점검하세요.';
const CANCEL_GUIDE = 'AI 점검을 취소했습니다. 이전 결과는 현재 점검 결과가 아닙니다.';
const FORMAT_GUIDE = `AI 서버 응답 형식을 확인할 수 없습니다. ${ASK}`;
const AI_CONNECTION_GUIDANCE = Object.freeze({
  ON_AI_PROVISIONING_PENDING: `학생 앱 전용 AI 권한·연결 준비가 아직 끝나지 않았습니다. ${ASK}`,
  WB_CLCO_AUTH_REQUIRED: '앱 전용 이용 인증을 확인할 수 없습니다. Workbench 열쇠를 복사하지 말고 담당자에게 확인하세요.',
  WB_CLCO_ACCESS_BLOCKED: `학생 앱의 AI 이용 권한이 허용되지 않았습니다. ${ASK}`,
  SUBJECT_SCOPE_UNVERIFIED: '현재 로그인과 프로젝트 범위를 확인할 수 없습니다. 계정 연결을 확인하고 담당자에게 문의하세요.',
  ON_AI_AUTHORIZATION_CHANGED: '점검 중 AI 이용 권한이 바뀌었습니다. 담당자에게 현재 권한을 확인하세요.',
  WB_CLCO_SESSION_CLOSED: '현재는 AI 이용 시간이 아닙니다. 이용 시간을 확인하세요.',
  WB_CLCO_COHORT_BUDGET_EXHAUSTED: `반의 AI 사용량이 소진됐습니다. ${ASK}`,
  WB_CLCO_RATE_LIMITED: 'AI 요청이 잠시 제한됐습니다. 잠시 기다린 뒤 직접 다시 점검하세요.',
  WB_CLCO_LIMIT_REACHED: `AI 이용 한도에 도달했습니다. ${ASK}`,
  WB_CLCO_TIMEOUT: TIMEOUT_GUIDE,
  TIMEOUT: TIMEOUT_GUIDE,
  REQUEST_TIMEOUT: '서버의 AI 응답 시간이 초과됐습니다. 필요하면 직접 다시 점검하세요.',
  ENGINE_TIMEOUT: '서버의 확인 시간이 초과됐습니다. 필요하면 직접 다시 점검하세요.',
  WB_CLCO_SERVER_UNAVAILABLE: 'AI 서버가 응답하지 않습니다. 연결을 확인하고 필요하면 직접 다시 점검하세요.',
  WB_CLCO_NETWORK_ERROR: 'AI 서버에 연결할 수 없습니다. 네트워크 상태를 확인하고 필요하면 직접 다시 점검하세요.',
  WB_CLCO_CANCELLED: CANCEL_GUIDE,
  CANCELLED: CANCEL_GUIDE,
  REQUEST_CANCELLED: CANCEL_GUIDE,
  MODEL_NOT_CONFIGURED: '앱 서버의 AI 모델 설정을 확인해야 합니다. 담당자에게 문의하세요.',
  ON_AI_MODEL_LIST_EMPTY: '현재 앱 권한으로 사용할 수 있는 모델이 없습니다. 담당자에게 모델 허용 설정을 확인하세요.',
  ON_AI_INVALID_INPUT: 'AI 점검 요청 형식을 확인할 수 없습니다. 새로고침한 뒤 직접 다시 점검하세요.',
  ON_AI_INVALID_OUTPUT: `AI 점검 응답 형식을 확인할 수 없습니다. ${ASK}`,
  WB_CLCO_INVALID_RESPONSE: FORMAT_GUIDE,
  WB_CLCO_INVALID_CONTENT_TYPE: FORMAT_GUIDE,
  WB_CLCO_RESPONSE_TOO_LARGE: `AI 서버 응답이 너무 큽니다. ${ASK}`,
  WB_CLCO_REDIRECT_BLOCKED: 'AI 서버 주소가 다른 곳으로 이동했습니다. 담당자에게 설정을 확인하세요.',
  WB_CLCO_INVALID_URL: 'AI 서버 주소 설정을 확인해야 합니다. 담당자에게 문의하세요.',
  WB_CLCO_INVALID_TOKEN: '앱 전용 인증 설정을 확인해야 합니다. 열쇠를 복사하지 말고 담당자에게 문의하세요.',
  WB_CLCO_INVALID_LIMIT: 'AI 요청 제한 시간 설정을 확인해야 합니다. 담당자에게 문의하세요.',
  WB_CLCO_REQUEST_FAILED: `AI 요청을 처리하지 못했습니다. ${ASK}`,
  NATIVE_HOST_DISABLED: NOT_STUDENT,
  AI_REQUEST_UNVERIFIED: `실제 모델 목록과 사건 설명 호출은 아직 확인되지 않았습니다. ${NOT_STUDENT}`,
});

function renderAiConnection(input) {
  const view = input && typeof input === 'object' ? input : {};
  const status = ['idle', 'loading', 'ok', 'error'].includes(view.status) ? view.status : 'unknown';
  const root = textNode('div', '', { 'data-student-ai-connection': 'true', 'data-student-state': status });
  const mode = modeOf(view);
  if (status !== 'idle' && mode !== 'connected') root.append(textNode('p', MODE_NOTICES[mode], { 'data-student-mode': mode }));

  if (status === 'idle') {
    root.append(textNode('p', 'AI 연결 점검 전입니다. 아직 요청하지 않았습니다. 점검은 제공 화면의 버튼을 직접 눌러 실행하세요.'));
    return root;
  }
  if (status === 'loading') {
    root.append(textNode('p', '현재 로그인으로 AI 모델 응답을 점검하는 중입니다. 자동으로 다시 요청하지 않습니다.'));
    return root;
  }
  if (status === 'error') {
    const rawCode = view.error && typeof view.error.code === 'string' ? view.error.code : '';
    const knownCode = Object.hasOwn(AI_CONNECTION_GUIDANCE, rawCode);
    const code = safeValue(rawCode || 'AI_REQUEST_UNVERIFIED', 80);
    const message = view.error && typeof view.error.message === 'string' && view.error.message
      ? safeValue(view.error.message) : '서버가 안전한 오류 내용을 제공하지 않았습니다.';
    const guidance = knownCode ? AI_CONNECTION_GUIDANCE[rawCode]
      : rawCode ? `확인 불가: ${NOT_STUDENT}` : AI_CONNECTION_GUIDANCE.AI_REQUEST_UNVERIFIED;
    root.append(
      textNode('p', `AI 연결 점검 실패(${code})`, { role: 'alert' }),
      textNode('p', message),
      textNode('p', guidance),
      textNode('p', '자동으로 다시 점검하지 않습니다. 필요하면 제공 화면의 다시 점검 버튼을 직접 누르세요.'),
    );
    return root;
  }
  if (status !== 'ok' || !view.data || typeof view.data !== 'object'
    || view.data.transportChecked !== true || !['test', 'verified'].includes(view.data.audienceAuthorization)
    || !Number.isSafeInteger(view.data.modelCount) || view.data.modelCount < 0) {
    root.setAttribute('data-student-state', 'unknown');
    root.append(textNode('p', '확인 불가: AI 연결 점검 응답 형식을 읽을 수 없습니다. 성공으로 간주하지 않습니다.'));
    return root;
  }
  const data = view.data;
  root.setAttribute('data-student-state', 'ok');
  root.append(
    textNode('p', data.audienceAuthorization === 'test'
      ? '시험 연결 점검(test)입니다. 실제 앱 권한 확인이나 게이트 수용을 뜻하지 않습니다.'
      : '앱 권한 확인 후 모델 응답 점검(verified)입니다. 이 점검 시점의 결과입니다.'),
  );
  const checkedAt = typeof view.checkedAt === 'string' ? view.checkedAt
    : typeof (view.meta && view.meta.checkedAt) === 'string' ? view.meta.checkedAt
      : typeof data.checkedAt === 'string' ? data.checkedAt : '(시각 없음)';
  const values = textNode('ul', '');
  values.append(line('응답 모델 수', String(data.modelCount)), line('점검 시각', checkedAt));
  root.append(values,
    textNode('p', '사건 설명은 아직 실행하지 않았습니다. 연결 점검은 사건 설명의 성공을 뜻하지 않습니다.'),
    textNode('p', '다시 점검하려면 제공 화면의 버튼을 직접 누르세요. 자동으로 재점검하지 않습니다.'),
  );
  return root;
}

function renderExplanation(input) {
  const view = input && typeof input === 'object' ? input : {};
  const event = view.event && typeof view.event === 'object' ? view.event : null;
  const explanation = view.explanation && typeof view.explanation === 'object' ? view.explanation : {};
  const status = ['idle', 'loading', 'ok', 'error'].includes(explanation.status) ? explanation.status : 'unknown';
  const root = textNode('div', '', { 'data-student-explanation': 'true', 'data-student-state': status });

  const safeErrorCode = error => {
    const rawCode = error && typeof error.code === 'string' ? error.code : '';
    return /^[A-Z][A-Z0-9_]{2,63}$/.test(rawCode) ? safeValue(rawCode, 64) : '';
  };

  // 오류는 event가 없어도 먼저 알려 줍니다. 오류 상태에서는 성공 표식을 붙이지 않습니다.
  if (status === 'error') {
    const code = safeErrorCode(explanation.error);
    const rawMessage = explanation.error && typeof explanation.error.message === 'string'
      ? explanation.error.message : '';
    const message = rawMessage ? safeValue(rawMessage, 200) : '서버가 안전한 오류 메시지를 제공하지 않았습니다.';

    root.append(
      textNode('p', `AI 설명 실패${code ? `(${code})` : ''}`, { role: 'alert' }),
      textNode('p', message),
      textNode('p', '실패 이유: 설명 결과가 오류 상태이므로 요약과 근거를 사용할 수 없습니다. 근거가 충분한지도 확인할 수 없습니다.'),
    );
    if (validEvent(event)) root.append(textNode('p', `관련 사건 ID: ${event.id}`));
    root.append(textNode('p', '기록은 그대로입니다. 설명은 표시하지 않았고 조치를 실행하지 않았습니다.'));
    return root;
  }

  if (!validEvent(event)) {
    root.append(textNode('p', '보안 기록에서 기록을 먼저 고르세요.'));
    return root;
  }

  if (status === 'idle') {
    root.append(textNode('p', `사건 ${event.id}: AI 설명은 아직 요청하지 않았습니다.`));
    return root;
  }
  if (status === 'loading') {
    root.append(textNode('p', `사건 ${event.id}: AI 설명 요청 중입니다.`));
    return root;
  }
  if (status !== 'ok') {
    root.append(textNode('p', `사건 ${event.id}: 확인 불가 — AI 설명 상태를 확인할 수 없습니다.`));
    return root;
  }

  const data = explanation.data && typeof explanation.data === 'object' ? explanation.data : null;
  const sourceEvidence = Array.isArray(event.evidence) ? event.evidence : null;
  const sourceEvidenceUsable = sourceEvidence !== null
    && sourceEvidence.every(row => row && typeof row === 'object'
      && typeof row.id === 'string' && row.id !== ''
      && typeof row.text === 'string' && row.text.trim() !== '');
  const sourceIds = sourceEvidenceUsable ? sourceEvidence.map(row => row.id) : [];
  const evidenceById = new Map(
    sourceEvidenceUsable ? sourceEvidence.map(row => [row.id, row]) : [],
  );
  const evidenceIds = data && Array.isArray(data.evidenceIds) ? data.evidenceIds : null;
  const evidenceMatches = sourceEvidenceUsable
    && new Set(sourceIds).size === sourceIds.length
    && evidenceIds !== null
    && evidenceIds.length > 0
    && evidenceIds.every(id => typeof id === 'string' && id !== '' && evidenceById.has(id))
    && new Set(evidenceIds).size === evidenceIds.length
    && evidenceIds.length === sourceIds.length;

  const proposalsValid = data && Array.isArray(data.proposals)
    && data.proposals.every(proposal => proposal && typeof proposal === 'object'
      && typeof proposal.action === 'string' && proposal.action.trim() !== ''
      && typeof proposal.reason === 'string' && proposal.reason.trim() !== ''
      && Array.isArray(proposal.evidenceIds)
      && proposal.evidenceIds.every(id => typeof id === 'string' && evidenceById.has(id))
      && new Set(proposal.evidenceIds).size === proposal.evidenceIds.length);

  const valid = data
    && typeof data.summary === 'string' && data.summary.trim() !== ''
    && evidenceMatches
    && proposalsValid
    && data.requiresHumanConfirmation === true
    && data.executed === false;

  if (!valid) {
    root.setAttribute('data-student-state', 'error');

    let reason = '설명 데이터 형식을 확인할 수 없어 내용을 사용하지 않습니다.';
    if (!evidenceMatches) {
      reason = '근거 ID가 현재 기록의 근거 ID와 일치하지 않거나 근거 문장을 확인할 수 없어 설명을 사용할 수 없습니다.';
    } else if (data && data.executed === true) {
      reason = '응답에 AI가 이미 실행했다고 표시되어 있어 이 설명을 사용할 수 없습니다.';
    } else if (data && data.requiresHumanConfirmation !== true) {
      reason = '사람의 확인이 필요한 설명인지 확인할 수 없어 내용을 사용하지 않습니다.';
    } else if (data && data.executed !== false) {
      reason = '조치가 실행되지 않았는지 확인할 수 없어 내용을 사용하지 않습니다.';
    }

    const code = safeErrorCode(explanation.error);
    root.append(
      textNode('p', `AI 설명을 사용할 수 없습니다: ${reason}`, { role: 'alert' }),
      ...(code ? [textNode('p', `오류 코드: ${code}`)] : []),
      textNode('p', '기록은 그대로입니다. 근거를 추측하거나 조치를 실행하지 않았습니다.'),
    );
    return root;
  }

  // 이 표식은 현재 이벤트의 근거와 검증된 설명에만 붙입니다.
  root.setAttribute('data-student-explanation-event', event.id);
  root.append(
    textNode('h3', `사건 ID: ${event.id}`),
    textNode('h4', 'AI 설명(참고용)'),
    textNode('p', data.summary),
  );

  if (typeof view.checkedAt === 'string' && view.checkedAt !== '') {
    root.append(textNode('p', `설명 확인 시각: ${timeText(view.checkedAt)}`));
  }

  root.append(textNode('h4', '인용한 근거'));
  root.append(textNode('p', `근거 ID: ${evidenceIds.join(', ')}`));
  const evidenceList = textNode('ul', '');
  for (const id of evidenceIds) {
    const row = evidenceById.get(id);
    evidenceList.append(textNode('li', `근거 ${id} — ${present(row.text, '(근거 글 없음)')}`));
  }
  root.append(evidenceList);

  root.append(textNode('h4', '규칙'));
  if (!Array.isArray(event.rules)) {
    root.append(textNode('p', '규칙을 확인할 수 없습니다.'));
  } else if (event.rules.length === 0) {
    root.append(textNode('p', '표시할 규칙이 없습니다.'));
  } else {
    const rulesList = textNode('ul', '');
    for (const rule of event.rules) {
      if (rule && typeof rule === 'object') {
        rulesList.append(textNode(
          'li',
          `규칙 ${present(rule.id, '(id 없음)')} — ${present(rule.text, '(규칙 글 없음)')}`,
        ));
      } else {
        rulesList.append(textNode('li', '규칙 정보를 읽을 수 없습니다.'));
      }
    }
    root.append(rulesList);
  }

  root.append(textNode('h4', '확인 불가 상태'));
  const state = event.state && typeof event.state === 'object' ? event.state : null;
  if (!state) {
    root.append(textNode('p', '현재 상태 정보를 확인할 수 없습니다.'));
  } else {
    const unknownStates = [];
    const missingStates = [];

    if (state.access === 'unknown') {
      unknownStates.push(`접속: ${codeLabel(ACCESS_LABELS, state.access)}`);
    } else if (typeof state.access !== 'string' || state.access === '') {
      missingStates.push('접속');
    }

    if (state.session === 'unknown') {
      unknownStates.push(`세션: ${codeLabel(SESSION_LABELS, state.session)}`);
    } else if (typeof state.session !== 'string' || state.session === '') {
      missingStates.push('세션');
    }

    if (state.device === 'unknown') {
      unknownStates.push(`기기: ${codeLabel(DEVICE_LABELS, state.device)}`);
    } else if (typeof state.device !== 'string' || state.device === '') {
      missingStates.push('기기');
    }

    if (unknownStates.length > 0) {
      const statesList = textNode('ul', '');
      for (const value of unknownStates) statesList.append(textNode('li', value));
      root.append(statesList);
    } else {
      root.append(textNode('p', '없음'));
    }

    if (missingStates.length > 0) {
      root.append(textNode('p', `상태 값을 받지 못해 확인할 수 없음: ${missingStates.join(', ')}`));
    }
  }

  root.append(textNode('h4', 'AI 제안'));
  if (data.proposals.length === 0) {
    const supportedActions = Array.isArray(event.supportedActions) ? event.supportedActions : null;
    root.append(textNode(
      'p',
      supportedActions && supportedActions.length === 0
        ? '연동 시스템이 지원하는 조치가 없어 제안이 없습니다(정상).'
        : 'AI가 제안한 조치가 없습니다.',
    ));
  } else {
    const proposalsList = textNode('ul', '');
    for (const proposal of data.proposals) {
      const item = textNode('li', '');
      item.append(
        textNode('p', `조치: ${proposal.action}`),
        textNode('p', `이유: ${proposal.reason}`),
        textNode('p', '사람 확인이 필요하며 아직 실행되지 않았습니다.'),
      );
      proposalsList.append(item);
    }
    root.append(proposalsList);
  }

  root.append(textNode('p', 'AI 설명은 참고 정보입니다. 사실 판단은 근거 글과 연동 시스템이 알려 준 상태로 합니다.'));
  return root;
}

function renderAction(input) {
  const view = input && typeof input === 'object' ? input : {};
  const allowedStatuses = ['idle', 'loading', 'executing', 'prepared', 'pending', 'succeeded', 'denied', 'failed', 'unknown', 'error', 'expired'];
  const status = allowedStatuses.includes(view.status) ? view.status : 'unknown';
  const event = view.event && typeof view.event === 'object' ? view.event : null;
  const target = view.target && typeof view.target === 'object' ? view.target : null;
  const receipt = view.receipt && typeof view.receipt === 'object' ? view.receipt : null;
  const observation = view.observation && typeof view.observation === 'object' ? view.observation : null;
  const root = textNode('div', '');
  const hasValue = value => value !== null && value !== undefined && value !== '';
  const valueText = (value, fallback = '(없음)', max = 160) => {
    if (!hasValue(value)) return fallback;
    if (!['string', 'number', 'boolean'].includes(typeof value)) return '(형식 확인 불가)';
    return present(safeValue(value, max), fallback);
  };
  const dateText = value => {
    if (typeof value !== 'string' || value === '') return valueText(value, '(받지 않음)');
    return timeText(safeValue(value, 160));
  };
  const addField = (list, label, value, force = false, format = valueText) => {
    if (!force && !hasValue(value)) return;
    list.append(line(label, format(value, force ? '(받지 않음)' : '(없음)')));
  };

  const eventIsValid = validEvent(event);
  const actionIdIsValid = typeof view.actionId === 'string' && view.actionId !== '';
  const receiptEventIdIsValid = receipt && typeof receipt.eventId === 'string' && receipt.eventId !== '';
  const receiptActionIdIsValid = receipt && typeof receipt.actionId === 'string' && receipt.actionId !== '';
  const bindingComplete = eventIsValid && actionIdIsValid && receiptEventIdIsValid && receiptActionIdIsValid;
  const bindingMatches = bindingComplete
    && receipt.eventId === event.id
    && receipt.actionId === view.actionId;
  const bindingProblem = !eventIsValid
    ? '현재 사건 ID를 확인할 수 없어 결과를 현재 사건에 연결할 수 없습니다.'
    : !actionIdIsValid
      ? '현재 actionId를 확인할 수 없어 결과를 현재 조치에 연결할 수 없습니다.'
      : !receiptEventIdIsValid || !receiptActionIdIsValid
        ? '접수 응답의 eventId 또는 actionId가 없어 현재 사건·조치와 결과를 연결할 수 없습니다.'
        : !bindingMatches
          ? '접수 응답의 eventId 또는 actionId가 현재 사건·조치와 다릅니다.'
          : '';
  const effectConfirmed = status === 'succeeded'
    && observation !== null
    && observation.effectApplied === true
    && bindingMatches;

  if (eventIsValid) root.setAttribute('data-student-action-event', event.id);
  if (receipt && typeof receipt.requestId === 'string' && receipt.requestId !== '') {
    root.setAttribute('data-student-action-request', receipt.requestId);
  }

  root.append(
    textNode('h3', '보안 조치 요청 상태와 실제 결과'),
    textNode('p', 'AI 제안, 사람 확인, 서버 접수(ACK), 실제 효과 관측은 서로 다른 단계입니다.'),
    textNode('p', '이 칸은 서버가 알려 준 상태만 표시하며 조치를 직접 요청하거나 실행하지 않습니다.'),
  );

  if (status === 'idle') {
    root.append(textNode('p', '아직 미실행(idle). 조치 요청을 하지 않았습니다.'));
    root.append(textNode('p', '연동 시스템이 지원하는 조치가 없는 기록(supportedActions 빈 배열)에는 조치 준비 버튼이 나오지 않으며, 이것이 정상입니다.'));
  } else if (status === 'loading') {
    root.append(textNode('p', '조치 준비 또는 결과 조회 중(loading). 서버 접수나 효과는 아직 확인되지 않았습니다.'));
  } else if (status === 'prepared') {
    root.append(textNode('p', '준비됨·미실행(prepared). 준비 상태는 사람 확인이나 조치 실행을 뜻하지 않습니다.'));
    root.append(textNode('p', '사람이 실제 대상과 조치를 직접 확인하고 제공 화면의 「대상과 조치를 확인했으며 집행합니다」를 눌러야 서버에 전달됩니다. 확인 기한이 지나면 다시 준비해야 합니다.'));
  } else if (status === 'executing') {
    root.append(textNode('p', '서버에 전달 중(executing). 결과가 아직 확인되지 않았습니다. 완료 아님.'));
    root.append(textNode('p', '같은 조치를 다시 집행하지 마세요. 결과는 「연동 시스템 결과만 재조회」로 확인합니다.'));
  } else if (status === 'pending') {
    root.append(textNode('p', '서버 접수·처리 중(pending). ACK는 실제 효과가 아니며 결과가 아직 확인되지 않았습니다. 완료 아님.'));
    root.append(textNode('p', '같은 조치를 다시 집행하지 마세요. 결과는 「연동 시스템 결과만 재조회」로 확인합니다.'));
  } else if (status === 'succeeded' && effectConfirmed) {
    root.append(textNode('p', '효과 확인(succeeded). 현재 사건·조치에 연결된 서버 응답에서 실제 효과를 관측했습니다.'));
  } else if (status === 'succeeded') {
    root.append(textNode('p', '결과 불명(unknown). 효과를 확인할 수 없어 성공이나 효과 없음으로 판단하지 않습니다.'));
    root.append(textNode('p', bindingProblem || 'observation.effectApplied가 true가 아니므로 효과 확인 조건을 충족하지 않았습니다.'));
    root.append(textNode('p', '제공 화면의 「연동 시스템 결과만 재조회」로 결과만 다시 조회하세요. 조치를 다시 요청하지 마세요.'));
  } else if (status === 'denied') {
    root.append(textNode('p', '연동 시스템에서 거절(denied)했습니다.'));
    if (hasValue(view.message)) root.append(textNode('p', `메시지: ${valueText(view.message)}`));
  } else if (status === 'failed') {
    root.append(textNode('p', '연동 시스템에서 실패(failed)했습니다.'));
    if (hasValue(view.message)) root.append(textNode('p', `메시지: ${valueText(view.message)}`));
  } else if (status === 'unknown') {
    root.append(textNode('p', '결과 불명(unknown). 성공이나 효과 없음으로 판단하지 않습니다.'));
    root.append(textNode('p', '제공 화면의 「연동 시스템 결과만 재조회」로 결과만 다시 조회하세요. 조치를 다시 요청하지 마세요.'));
  } else if (status === 'error') {
    const error = view.error && typeof view.error === 'object' ? view.error : {};
    root.append(textNode('p', '요청이 처리되지 않았습니다(error).', { role: 'alert' }));
    if (hasValue(error.code)) root.append(textNode('p', `오류 코드: ${valueText(error.code, '(없음)', 80)}`));
    root.append(textNode('p', `오류 메시지: ${valueText(error.message, '서버가 오류 메시지를 제공하지 않았습니다.')}`));
  } else if (status === 'expired') {
    root.append(textNode('p', '확인 기한이 지났습니다(expired). 제공 화면에서 다시 준비해야 합니다. 이 함수는 조치를 준비하거나 요청하지 않습니다.'));
  }

  if (!eventIsValid) root.append(textNode('p', '현재 사건 ID를 확인할 수 없습니다.'));
  if (view.status !== status) root.append(textNode('p', `받은 status: ${valueText(view.status, '(없음)', 80)}`));

  const details = textNode('ul', '');
  if (eventIsValid) addField(details, '사건 ID', event.id);
  if (event && Array.isArray(event.evidence)) {
    const evidenceIds = event.evidence
      .filter(row => row && typeof row === 'object' && hasValue(row.id))
      .map(row => valueText(row.id));
    details.append(line('근거 ID', evidenceIds.length > 0 ? evidenceIds.join(', ') : '(없음)'));
  } else if (status === 'prepared') {
    details.append(line('근거 ID', '(받지 않음)'));
  }
  addField(details, 'actionId', view.actionId, status === 'prepared');
  if (target) {
    addField(details, '실제 대상 ID(target.id)', target.id, status === 'prepared');
    addField(details, '대상 generation', target.generation, status === 'prepared');
  } else if (status === 'prepared') {
    details.append(line('실제 대상 ID(target.id)', '(대상 없음/null)'));
    details.append(line('대상 generation', '(대상 없음/null)'));
  }
  if (hasValue(view.confirmationExpiresAt) || status === 'prepared') {
    details.append(line('확인 기한', dateText(view.confirmationExpiresAt)));
  }
  if (receipt) {
    addField(details, 'receipt.eventId', receipt.eventId);
    addField(details, 'receipt.actionId', receipt.actionId);
    addField(details, 'requestId', receipt.requestId);
    addField(details, 'receiptId', receipt.receiptId, status === 'succeeded');
    addField(details, 'receipt.status(효과 판정 아님)', receipt.status);
    addField(details, 'receipt.version', receipt.version);
    addField(details, 'receipt.replayed', receipt.replayed);
  } else if (status === 'succeeded') {
    details.append(line('receiptId', '(받지 않음)'));
  }
  if (status === 'succeeded') {
    details.append(line('관측 시각', observation ? dateText(observation.observedAt) : '(관측 정보 없음)'));
    details.append(line(
      'observation.effectApplied',
      effectConfirmed ? 'true' : valueText(observation && observation.effectApplied, '(받지 않음)'),
    ));
  }
  if (details.children.length > 0) {
    root.append(textNode('h4', '현재 입력에서 확인할 수 있는 ID와 상태'), details);
  }
  if (receipt && receipt.replayed === true) {
    root.append(textNode('p', 'replayed: true — 이미 접수된 같은 요청에 대한 재응답이며 새 집행이 아닙니다.'));
  }
  if (status === 'prepared' && hasValue(view.confirmationExpiresAt)) {
    root.append(textNode('p', `사람 확인 기한: ${dateText(view.confirmationExpiresAt)}`));
  }

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
    renderAction,
  };
}

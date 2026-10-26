// 16단계 renderStatus 시험(모의 자료): 불러오는 중·빈 목록·실패·시간 초과 구분, 알림, 연결 점검, 도움정보 복사, 미지원 조치 안내.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-shim.mjs';

installDom();
let copied = null;
let requests = 0;
const setNavigator = value => Object.defineProperty(globalThis, 'navigator', { value, configurable: true, writable: true });
setNavigator({ clipboard: { writeText: async text => { copied = text; } } });
globalThis.fetch = async () => { requests += 1; throw new Error('요청을 보내면 안 됩니다'); };
const { createStudentView } = await import('../../on-client/student/extension.mjs');
const view = createStudentView({ api: { get: async () => { requests += 1; return {}; } }, onChange() {} });

const ok = (data, mode = 'connected') => ({ status: 'ok', mode, data });
const fail = (code, message, mode = 'connected') => ({ status: 'error', mode, error: { code, message } });
const base = (over = {}) => ({
  devices: ok([{ id: 'd-1', label: '내 PC', status: 'compliant' }]),
  sessions: ok([{ id: 's-1', status: 'active' }]),
  notifications: [],
  diagnostics: ok({ requestId: 'req-1', component: 'on-client', version: '0.1.0', checkedAt: '2026-10-19T00:00:00Z', engine: { mode: 'demo', code: 'DEMO_ONLY' }, ai: { configured: true } }),
  mode: 'connected',
  ...over,
});
const text = input => view.renderStatus(input).textContent;

test('기기·세션은 원래 값과 함께 보이고, 세션은 지금 연결 하나뿐이라고 알린다', () => {
  const t = text(base());
  for (const want of ['내 PC', 'd-1', '보안 기준 충족(compliant)', 's-1', '활성(active)', '지난 세션 목록이 아닙니다', '주의할 알림이 없습니다']) assert.ok(t.includes(want), want);
});

test('불러오는 중·빈 목록·실패는 서로 다른 문장이다', () => {
  const loading = text(base({ devices: { status: 'loading', mode: 'connected' }, sessions: { status: 'loading', mode: 'connected' } }));
  const empty = text(base({ devices: ok([]), sessions: ok([]) }));
  const failed = text(base({ devices: fail('NETWORK', '서버에 닿지 않습니다'), sessions: fail('NETWORK', '서버에 닿지 않습니다') }));
  assert.ok(loading.includes('불러오는 중') && !loading.includes('등록된 기기가 없습니다') && !loading.includes('불러오지 못했습니다'));
  assert.ok(empty.includes('등록된 기기가 없습니다') && empty.includes('현재 연결된 세션이 없습니다') && !empty.includes('불러오지 못했습니다'));
  assert.ok(failed.includes('기기 목록을 불러오지 못했습니다: 서버에 닿지 않습니다') && failed.includes('세션 정보를 불러오지 못했습니다: 서버에 닿지 않습니다'));
  assert.ok(!failed.includes('등록된 기기가 없습니다'));
  assert.equal(new Set([loading, empty, failed]).size, 3);
});

test('실패는 무엇을 못 불러왔는지와 사용자가 직접 누르는 다시 시도 안내를 보이고, 시간 초과는 드러나며, 성공하면 지워진다', () => {
  const failed = text(base({ devices: fail('REQUEST_TIMEOUT', '응답 시간이 초과됐습니다'), sessions: ok([{ id: 's-1', status: 'active' }]) }));
  assert.ok(failed.includes('(시간 초과)') && failed.includes('위쪽 다시 불러오기 버튼을 직접 누르세요') && failed.includes('자동으로 다시 요청하지 않습니다'));
  const plain = text(base({ devices: fail('X', '실패') }));
  assert.ok(!plain.includes('(시간 초과)'));
  const recovered = text(base());
  assert.ok(!recovered.includes('불러오지 못했습니다') && !recovered.includes('시간 초과') && !recovered.includes('다시 불러오기 버튼'));
});

test('알림은 자료·코드·message 를 보이고, 나쁜 값은 정상처럼 보이지 않는다', () => {
  const t = text(base({ notifications: [{ resource: 'devices', code: 'noncompliant', message: '내 PC: 보안 기준 미충족' }, { resource: 'events', code: 'xdr', message: 'event-9: XDR 경보' }] }));
  for (const want of ['devices', 'noncompliant', '내 PC: 보안 기준 미충족', 'events', 'xdr', '주의']) assert.ok(t.includes(want), want);
  assert.ok(!t.includes('주의할 알림이 없습니다'));
});

test('연결 점검: 전·불러오는 중·실패·성공이 다르고, 성공 시 정해진 값만 보인다', () => {
  assert.ok(text(base({ diagnostics: { status: 'idle', mode: null } })).includes('연결 점검 전입니다'));
  assert.ok(text(base({ diagnostics: { status: 'loading', mode: 'connected' } })).includes('불러오는 중'));
  const failed = text(base({ diagnostics: fail('TIMEOUT', '시간 초과') }));
  assert.ok(failed.includes('연결 점검 결과를 불러오지 못했습니다(시간 초과)'));
  const t = text(base());
  for (const want of ['req-1', 'on-client', '0.1.0', '2026-10-19T00:00:00Z', 'demo', 'DEMO_ONLY']) assert.ok(t.includes(want), want);
  assert.ok(!t.includes('configured'), '정해진 값 밖의 항목은 보이지 않는다');
});

test('비밀로 보이는 값은 화면과 복사 내용에서 가려진다', async () => {
  // 시험용 가짜 비밀값은 실행할 때 조각을 이어 만들어, 저장소 원문에 비밀 모양 문자열을 남기지 않는다.
  const join = (...parts) => parts.join('');
  const fakeBearer = join('Bea', 'rer ', 'abcdefghijklmnop', '1234');
  const input = base({ notifications: [{ resource: 'devices', code: 'X', message: `토큰 ${join('tok', 'en=', 'abc123')} ${fakeBearer}` }], diagnostics: ok({ requestId: join('sk', '-ant-', 'abcdefghijklmnop'), component: 'c', version: 'v', checkedAt: 'now', engine: { mode: 'm', code: join('pass', 'word=', 'hunter2') } }) });
  const root = view.renderStatus(input);
  for (const leaked of ['abc123', 'abcdefghijklmnop', 'hunter2']) assert.ok(!root.textContent.includes(leaked), leaked);
  const [button] = root.byName('도움정보 복사');
  button.dispatch('click');
  await new Promise(r => setImmediate(r));
  for (const leaked of ['abc123', 'abcdefghijklmnop', 'hunter2']) assert.ok(!copied.includes(leaked), `복사 내용에 ${leaked} 없음`);
});

test('「도움정보 복사」는 누를 때만 복사하고, 요청은 보내지 않는다', async () => {
  copied = null; requests = 0;
  const root = view.renderStatus(base({ notifications: [{ resource: 'devices', code: 'noncompliant', message: 'm' }] }));
  assert.equal(copied, null, '그리기만 해서는 복사하지 않는다');
  const buttons = root.byName('도움정보 복사');
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].tag, 'button');
  buttons[0].dispatch('click');
  await new Promise(r => setImmediate(r));
  assert.ok(copied.includes('연결 모드') && copied.includes('d-1=compliant') && copied.includes('s-1=active') && copied.includes('devices/noncompliant') && copied.includes('req-1'));
  assert.ok(root.textContent.includes('복사했습니다'));
  assert.equal(requests, 0, '어떤 요청도 보내지 않는다');
});

test('복사에 실패하면 그렇게 알린다', async () => {
  const saved = globalThis.navigator;
  setNavigator({ clipboard: { writeText: async () => { throw new Error('denied'); } } });
  const root = view.renderStatus(base());
  root.byName('도움정보 복사')[0].dispatch('click');
  await new Promise(r => setImmediate(r));
  assert.ok(root.textContent.includes('복사하지 못했습니다'));
  setNavigator(saved);
});

test('mode 안내와 깨진 입력 처리', () => {
  assert.ok(text(base({ mode: 'disconnected' })).includes('연결 없음(disconnected)'));
  assert.ok(text(base({ mode: 'demo' })).includes('예제 자료(demo)'));
  for (const bad of [undefined, null, {}, { devices: ok('x'), sessions: { status: 'bogus' }, notifications: 'x', diagnostics: 5 }]) assert.doesNotThrow(() => text(bad));
  assert.ok(text({}).includes('확인 불가'));
});

test('미지원 조치: supportedActions 가 있을 때만 요청 없이 비활성 「<action> 미지원」 버튼을 15단계 상세 안에 둔다', () => {
  const event = (supportedActions) => ({ id: 'ev-1', kind: 'xdr', at: '2026-10-12T03:00:00.000Z', appId: 'repository', summary: 's', evidence: [], rules: [], state: { access: 'denied', session: 'active', device: 'unknown' }, supportedActions });
  const none = view.renderEvents(ok([event([])]));
  none.byName('ev-1 상세')[0].dispatch('click');
  assert.equal(none.find(n => n.tag === 'button' && /미지원/.test(n.textContent)).length, 0);
  const some = view.renderEvents(ok([event(['isolate-device', 'revoke-session'])]));
  some.byName('ev-1 상세')[0].dispatch('click');
  const [detail] = some.byAttr('data-student-event-detail', 'ev-1');
  const buttons = detail.find(n => n.tag === 'button');
  assert.deepEqual(buttons.map(b => b.attrs['aria-label']), ['isolate-device 미지원', 'revoke-session 미지원']);
  assert.ok(buttons.every(b => b.disabled && b.handlers.click === undefined), '비활성이며 누름 처리기가 없다');
  assert.ok(detail.textContent.includes('조치 실행 연결은 준비 중입니다') && detail.textContent.includes('실행되지 않았습니다'));
  assert.ok(!/성공|완료/.test(detail.textContent.replace('미지원', '')), '성공한 것처럼 읽히는 문장이 없다');
});

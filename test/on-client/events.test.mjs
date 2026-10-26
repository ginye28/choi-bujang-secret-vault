// 15단계 renderEvents 시험(모의 자료): 정렬·표시·걸러 보기·상세·빈 목록/실패 구분·새 자료로 교체.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-shim.mjs';

installDom();
const { createStudentView } = await import('../../on-client/student/extension.mjs');
const view = createStudentView({ api: { get: async () => ({}) }, onChange() {} });

const ev = (id, over = {}) => ({
  id, kind: 'access', at: '2026-10-12T03:00:00.000Z', appId: 'repository', summary: `${id} 요약`,
  evidence: [{ id: `e-${id}`, text: `${id} 근거` }], rules: [{ id: `r-${id}`, text: `${id} 규칙` }],
  state: { access: 'denied', session: 'active', device: 'unknown' }, supportedActions: [], ...over,
});
const ok = data => ({ status: 'ok', mode: 'connected', data });
const sample = () => [
  ev('a-old', { at: '2026-10-10T00:00:00.000Z', appId: 'library', state: { access: 'allowed', session: 'expired', device: 'compliant' } }),
  ev('b-new', { at: '2026-10-12T05:00:00.000Z', kind: 'xdr', appId: 'repository' }),
  ev('c-mid', { at: '2026-10-11T00:00:00.000Z', appId: null, state: { access: 'unknown', session: 'unknown', device: 'unknown' } }),
];
const rowIds = root => root.find(n => n.attrs['data-student-event-id']).map(n => n.attrs['data-student-event-id']);

test('최신순으로 정렬하고 id·시각·종류·앱·요약을 글자로 보이며 원본 배열은 바꾸지 않는다', () => {
  const data = sample();
  const copy = structuredClone(data);
  const root = view.renderEvents(ok(data));
  assert.deepEqual(rowIds(root), ['b-new', 'c-mid', 'a-old']);
  assert.deepEqual(data, copy);
  const text = root.textContent;
  for (const want of ['2026-10-12T05:00:00.000Z', '한국 시각', 'XDR 경보(xdr)', '접속(access)', 'repository', 'b-new 요약', '앱을 확인할 수 없음(appId 없음)']) assert.ok(text.includes(want), want);
});

test('걸러 보기 세 개: 접근 가능한 이름과 값, 받은 배열 안에서만 걸러 목록이 줄어든다', () => {
  const root = view.renderEvents(ok(sample()));
  const [kind] = root.byName('기록 종류'); const [app] = root.byName('업무 앱'); const [access] = root.byName('접속 상태');
  assert.ok(kind && app && access);
  const values = select => select.children.filter(c => c.tag === 'option').map(c => c.attrs.value);
  assert.deepEqual(values(kind), ['all', 'access', 'xdr']);
  assert.deepEqual(values(access), ['all', 'allowed', 'denied', 'unknown']);
  assert.ok(values(app).includes('all') && values(app).includes('library') && values(app).includes('repository'));
  kind.value = 'xdr'; kind.dispatch('change');
  assert.deepEqual(rowIds(root), ['b-new']);
  kind.value = 'all'; access.value = 'allowed'; access.dispatch('change');
  assert.deepEqual(rowIds(root), ['a-old']);
  access.value = 'all'; app.value = 'library'; app.dispatch('change');
  assert.deepEqual(rowIds(root), ['a-old']);
  app.value = 'repository'; kind.value = 'access'; app.dispatch('change');
  assert.deepEqual(rowIds(root), []);
  assert.ok(root.textContent.includes('조건에 맞는 기록이 없습니다'));
});

test('「<id> 상세」 버튼이 근거·규칙·세 상태를 따로 보인다. unknown 은 확인 불가(unknown)', () => {
  const root = view.renderEvents(ok(sample()));
  assert.equal(root.byAttr('data-student-event-detail', 'c-mid').length, 0);
  const [button] = root.byName('c-mid 상세');
  assert.equal(button.tag, 'button');
  button.dispatch('click');
  const [detail] = root.byAttr('data-student-event-detail', 'c-mid');
  assert.ok(detail);
  const t = detail.textContent;
  for (const want of ['c-mid 근거', 'e-c-mid', 'c-mid 규칙', 'r-c-mid', '확인 불가(unknown)', '앱을 확인할 수 없음']) assert.ok(t.includes(want), want);
  assert.equal((t.match(/확인 불가\(unknown\)/g) || []).length, 3, 'access·session·device 세 값이 각각 보인다');
  root.byName('a-old 상세')[0].dispatch('click');
  const t2 = root.byAttr('data-student-event-detail', 'a-old')[0].textContent;
  for (const want of ['허용됨(allowed)', '만료(expired)', '보안 기준 충족(compliant)']) assert.ok(t2.includes(want), want);
  assert.equal(root.byAttr('data-student-event-detail', 'c-mid').length, 0, '다른 상세를 열면 앞 상세는 사라진다');
});

test('걸러서 사라진 행의 상세는 남지 않는다', () => {
  const root = view.renderEvents(ok(sample()));
  root.byName('a-old 상세')[0].dispatch('click');
  const [kind] = root.byName('기록 종류');
  kind.value = 'xdr'; kind.dispatch('change');
  assert.equal(root.find(n => n.attrs['data-student-event-detail']).length, 0);
});

test('빈 배열·실패·확인 불가·불러오는 중은 서로 다르게 읽힌다', () => {
  const empty = view.renderEvents(ok([])).textContent;
  const failed = view.renderEvents({ status: 'error', mode: 'connected', error: { code: 'X', message: '서버 오류' } }).textContent;
  const mismatch = view.renderEvents({ status: 'error', mode: 'connected', error: { code: 'CONTRACT_MISMATCH', message: '형식 불일치' } }).textContent;
  const loading = view.renderEvents({ status: 'loading', mode: 'connected' }).textContent;
  assert.ok(empty.includes('표시할 기록이 없습니다') && !empty.includes('불러오지 못했습니다'));
  assert.ok(failed.includes('기록을 불러오지 못했습니다: 서버 오류') && !failed.includes('표시할 기록이 없습니다'));
  assert.ok(mismatch.includes('확인 불가') && mismatch.includes('기록이 없다는 뜻이 아닙니다'));
  assert.ok(loading.includes('불러오는 중'));
  assert.equal(new Set([empty, failed, mismatch, loading]).size, 4);
});

test('새 자료가 오면 이전 목록·상세·걸러 보기가 새로 그려진다', () => {
  const first = view.renderEvents(ok(sample()));
  first.byName('a-old 상세')[0].dispatch('click');
  const second = view.renderEvents(ok([ev('z-1')]));
  assert.notEqual(first, second);
  assert.deepEqual(rowIds(second), ['z-1']);
  assert.equal(second.find(n => n.attrs['data-student-event-detail']).length, 0);
  assert.ok(!second.textContent.includes('a-old'));
  const failed = view.renderEvents({ status: 'error', mode: 'disconnected', error: { code: 'X', message: '실패' } });
  assert.equal(rowIds(failed).length, 0);
});

test('조치 버튼은 만들지 않고, 값은 textContent 로만 들어가며, 깨진 입력도 던지지 않는다', () => {
  const root = view.renderEvents(ok([ev('x-1', { summary: '<b>굵게</b>', supportedActions: [] })]));
  assert.equal(root.find(n => n.tag === 'b').length, 0);
  assert.ok(root.textContent.includes('<b>굵게</b>'));
  assert.equal(root.find(n => n.tag === 'button').length, 1, '상세 버튼만 있다');
  for (const bad of [undefined, null, {}, { status: 'ok' }, ok('x'), ok([null, 1, {}, { id: '' }]), { status: 'bogus' }]) assert.doesNotThrow(() => view.renderEvents(bad).textContent);
  assert.ok(view.renderEvents(ok([null, 1, {}])).textContent.includes('표시할 기록이 없습니다'));
});

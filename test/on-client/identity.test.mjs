// 13단계 renderIdentity 시험: 브라우저 없이 아주 작은 DOM 모형으로 상태별 표시를 확인합니다.
// 실제 화면 확인(예제 자료·연결 끊김)은 npm run demo 로 따로 합니다. 이 시험은 모의 자료 점검입니다.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class Node_ {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this._text = ''; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { this.children.push(...nodes); }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(c => c.textContent).join(''); }
  find(predicate, out = []) { if (predicate(this)) out.push(this); this.children.forEach(c => c.find(predicate, out)); return out; }
}
globalThis.document = { createElement: tag => new Node_(tag) };
const { createStudentView } = await import('../../on-client/student/extension.mjs');
const view = createStudentView({ api: { get: async () => ({}) }, onChange() {} });

const ok = (data, mode = 'connected') => ({ status: 'ok', mode, data });
const me = (device = 'compliant', session = 'active') => ok({ user: { id: 'u-1', label: '김보안' }, device: { id: 'd-1', label: '내 노트북', status: device }, session: { id: 's-1', status: session } });
const text = input => view.renderIdentity(input).textContent;

test('정상 값: 사용자·기기·세션이 뜻과 원래 값으로 보인다', () => {
  const t = text({ me: me(), devices: ok([{ id: 'd-1', label: '내 노트북', status: 'compliant' }]), sessions: ok([{ id: 's-1', status: 'active' }]) });
  for (const want of ['김보안', 'u-1', '내 노트북', 'd-1', '보안 기준 충족(compliant)', 's-1', '활성(active)']) assert.ok(t.includes(want), want);
  assert.ok(!t.includes('주의'), '정상 값에는 주의 문구가 없다');
});

test('나쁜 상태는 정상처럼 보이지 않고 글자로 주의가 붙는다', () => {
  for (const [device, session, shown] of [['noncompliant', 'active', '보안 기준 미충족(noncompliant)'], ['unknown', 'active', '확인 불가(unknown)'], ['compliant', 'expired', '만료(expired)'], ['compliant', 'revoked', '철회됨(revoked)'], ['compliant', 'unknown', '확인 불가(unknown)']]) {
    const t = text({ me: me(device, session), devices: ok([]), sessions: ok([]) });
    assert.ok(t.includes(shown) && t.includes('주의'), `${device}/${session}`);
  }
  assert.ok(text({ me: me('weird', 'odd'), devices: ok([]), sessions: ok([]) }).includes('확인 불가(weird)'), '모르는 값은 확인 불가로 읽는다');
});

test('loading·error 에서도 mode 안내가 보이고, error 에는 이전 사용자 값이 남지 않는다', () => {
  const first = text({ me: me(), devices: ok([]), sessions: ok([]) });
  assert.ok(first.includes('김보안'));
  const failed = text({
    me: { status: 'error', mode: 'disconnected', error: { code: 'ENGINE_NOT_CONNECTED', message: '서버에 닿지 않습니다' } },
    devices: { status: 'loading', mode: 'demo' },
    sessions: { status: 'error', mode: 'unknown', error: { code: 'X', message: '' } },
  });
  assert.ok(!failed.includes('김보안') && !failed.includes('u-1') && !failed.includes('내 노트북'));
  for (const want of ['연결 실패: 서버에 닿지 않습니다', '연결 없음(disconnected)', '불러오는 중', '예제 자료(demo)', '확인 불가(unknown)', '확인 불가']) assert.ok(failed.includes(want), want);
});

test('빈 목록과 오류는 다르게 보이고, 깨진 입력도 던지지 않는다', () => {
  assert.ok(text({ me: me(), devices: ok([]), sessions: ok([]) }).includes('표시할 기기가 없습니다.'));
  assert.ok(!text({ me: me(), devices: ok([]), sessions: ok([]) }).includes('연결 실패'));
  for (const bad of [undefined, null, {}, { me: ok(null) }, { me: ok({}), devices: ok('x'), sessions: { status: 'ok', data: [null, 1] } }, { me: { status: 'bogus' } }]) {
    assert.doesNotThrow(() => text(bad));
    assert.ok(text(bad).includes('확인 불가'));
  }
});

test('같은 입력을 다시 그려도 새 값으로 바뀌고 옛 DOM 이 섞이지 않는다', () => {
  const a = view.renderIdentity({ me: me(), devices: ok([]), sessions: ok([]) });
  const b = view.renderIdentity({ me: ok({ user: { id: 'u-2', label: '박다른' }, device: { id: 'd-2', label: '다른 PC', status: 'compliant' }, session: { id: 's-2', status: 'active' } }), devices: ok([]), sessions: ok([]) });
  assert.notEqual(a, b);
  assert.ok(b.textContent.includes('박다른') && !b.textContent.includes('김보안'));
});

test('값은 textContent 로만 넣는다: 태그 문자열이 요소가 되지 않는다', () => {
  const root = view.renderIdentity({ me: me(), devices: ok([{ id: 'd-x', label: '<img src=x onerror=alert(1)>', status: 'compliant' }]), sessions: ok([]) });
  assert.equal(root.find(n => n.tag === 'img').length, 0);
  assert.ok(root.textContent.includes('<img src=x onerror=alert(1)>'));
});

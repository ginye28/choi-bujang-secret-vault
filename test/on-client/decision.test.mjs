// 14단계 renderDecision 시험: 모의 자료로 판정 네 가지, 요청 실패, 이전 값 제거를 확인합니다.
// 실제 화면 확인은 npm run demo 로 따로 합니다. 이 시험은 모의 자료 점검입니다.
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

const ok = (decision, extra = {}) => ({ status: 'ok', mode: 'connected', appId: 'app-1', data: { appId: 'app-1', decision, reason: '정책 규칙 7', checkedAt: '2026-10-19T00:00:00Z', ...extra } });
const text = input => view.renderDecision(input).textContent;

test('네 판정은 서로 다른 한국어 뜻과 원래 값으로 보이고 이유·시각이 함께 보인다', () => {
  const seen = new Set();
  for (const [decision, want] of [['allow', '접근 허용(allow)'], ['deny', '접근 거부(deny)'], ['challenge', '추가 확인 필요(challenge)'], ['unknown', '판정 확인 불가(unknown)']]) {
    const t = text(ok(decision));
    assert.ok(t.includes(want), decision);
    assert.ok(t.includes('정책 규칙 7') && t.includes('2026-10-19T00:00:00Z') && t.includes('app-1'));
    seen.add(want);
  }
  assert.equal(seen.size, 4);
});

test('unknown 과 모르는 값은 허용처럼 읽히지 않는다', () => {
  for (const decision of ['unknown', 'maybe', '', null, undefined, 7, 'ALLOW']) {
    const t = text(ok(decision));
    assert.ok(t.includes('판정 확인 불가(unknown'), String(decision));
    assert.ok(!t.includes('접근 허용(allow)'), String(decision));
  }
  assert.ok(text(ok('maybe')).includes('받은 값: maybe'));
});

test('요청 실패는 거부 판정과 다르게 보이고 허용으로 읽히지 않는다', () => {
  const t = text({ status: 'error', mode: 'disconnected', appId: 'app-1', error: { code: 'ENGINE_NOT_CONNECTED', message: '서버에 닿지 않습니다' } });
  assert.ok(t.includes('요청 실패: 서버에 닿지 않습니다'));
  assert.ok(t.includes('접근 거부 판정이 아니라'));
  assert.ok(t.includes('연결 없음(disconnected)'));
  assert.ok(!t.includes('접근 거부(deny)') && !t.includes('접근 허용(allow)'));
});

test('idle·loading 안내와 error 에서 이전 판정이 남지 않는다', () => {
  assert.ok(text({ status: 'idle', mode: null, appId: null }).includes('앱을 골라 접속을 요청하세요'));
  assert.ok(text({ status: 'loading', mode: null, appId: 'app-2' }).includes('판정 확인 중: app-2'));
  const before = text(ok('allow'));
  assert.ok(before.includes('정책 규칙 7'));
  const after = text({ status: 'error', mode: 'unknown', appId: 'app-1', error: { code: 'X', message: '실패' } });
  assert.ok(!after.includes('접근 허용(allow)'));
  assert.ok(!after.includes('정책 규칙 7'));
});

test('demo·unknown 모드 안내가 함께 보이고, 다른 앱의 판정은 쓰지 않는다', () => {
  assert.ok(text({ ...ok('deny'), mode: 'demo' }).includes('예제 자료(demo)'));
  assert.ok(text({ ...ok('deny'), mode: 'unknown' }).includes('확인 불가(unknown)'));
  const other = text({ ...ok('allow'), appId: 'app-9' });
  assert.ok(other.includes('확인 불가') && !other.includes('접근 허용(allow)'));
});

test('깨진 입력도 던지지 않고, 값은 textContent 로만 들어간다', () => {
  for (const bad of [undefined, null, {}, { status: 'ok' }, { status: 'ok', data: 'x' }, { status: 'bogus' }]) assert.doesNotThrow(() => text(bad));
  assert.ok(text({ status: 'ok' }).includes('확인 불가'));
  const root = view.renderDecision(ok('allow', { reason: '<script>alert(1)</script>' }));
  assert.equal(root.find(n => n.tag === 'script').length, 0);
  assert.ok(root.textContent.includes('<script>alert(1)</script>'));
});

test('13단계 renderIdentity 는 그대로 동작한다', () => {
  const t = view.renderIdentity({ me: { status: 'loading', mode: 'connected' }, devices: { status: 'loading', mode: 'connected' }, sessions: { status: 'loading', mode: 'connected' } }).textContent;
  assert.ok(t.includes('불러오는 중'));
});

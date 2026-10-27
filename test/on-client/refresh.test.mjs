// 마지막 총공세 4일차 다시 조회 시험(모의 자료): 대기 표시·버튼 잠금, 잰 시각, 실패와 다음 할 일, 예제 구분, 중복 요청 막기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-shim.mjs';
installDom();

const { createStudentView } = await import('../../on-client/student/extension.mjs');

function makeInput(overrides = {}) {
  return {
    devices: { status: 'ok', mode: 'connected', data: [] },
    sessions: { status: 'ok', mode: 'connected', data: [] },
    notifications: [],
    diagnostics: { status: 'ok', mode: 'connected', data: {} },
    mode: 'connected',
    ...overrides,
  };
}

function createHarness(fakeGet) {
  let changes = 0;
  const view = createStudentView({
    api: { get: fakeGet },
    onChange: () => { changes += 1; },
  });
  return {
    view,
    get changes() { return changes; },
    render() { return view.renderStatus(makeInput()); },
  };
}

function findRefreshButton(node) {
  if (!node || typeof node !== 'object') return null;
  if ((node.tagName === 'BUTTON' || node.tag === 'button') && node.textContent === '다시 조회') return node;
  for (const child of Array.isArray(node.children) ? node.children : []) {
    const found = findRefreshButton(child);
    if (found) return found;
  }
  return null;
}

function findStatusNode(node) {
  if (!node || typeof node !== 'object') return null;
  const isStatus = (node.tagName === 'P' || node.tag === 'p')
    && (node.getAttribute?.('role') === 'status' || node.attributes?.role === 'status');
  if (isStatus) return node;
  for (const child of Array.isArray(node.children) ? node.children : []) {
    const found = findStatusNode(child);
    if (found) return found;
  }
  return null;
}

function treeText(node) {
  if (!node || typeof node !== 'object') return '';
  const own = typeof node.textContent === 'string' ? node.textContent : '';
  const descendants = (Array.isArray(node.children) ? node.children : []).map(treeText).join(' ');
  return `${own} ${descendants}`;
}

function callStoredClickListener(button) {
  // DOM shim에 click()이 없는 경우 addEventListener가 저장한 click 리스너를 직접 부릅니다.
  // Map 및 객체 형태의 리스너 저장소를 모두 지원합니다.
  const stores = [button.listeners, button._listeners, button.eventListeners, button._eventListeners];
  for (const store of stores) {
    const entry = store instanceof Map ? store.get('click') : store?.click;
    const listeners = Array.isArray(entry) ? entry : entry ? [entry] : [];
    for (const listener of listeners) {
      const callback = typeof listener === 'function' ? listener : listener?.listener ?? listener?.callback ?? listener?.handler;
      if (typeof callback === 'function') {
        callback.call(button, { type: 'click', target: button, currentTarget: button });
        return;
      }
    }
  }
  throw new Error('DOM shim에서 click 리스너를 찾지 못했습니다. dom-shim의 addEventListener 저장 형식을 확인하세요.');
}

function clickButton(button) {
  if (typeof button.click === 'function') button.click();
  else if (typeof button.dispatch === 'function') button.dispatch('click');
  else callStoredClickListener(button);
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

function success(meta = { checkedAt: '2026-10-27T00:00:00Z', mode: 'connected' }, data = []) {
  return { ok: true, data, meta };
}

async function waitForDone(harness) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const tree = harness.render();
    if (treeText(tree).includes('다시 조회 결과:')) return tree;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  throw new Error('다시 조회가 완료 상태가 되지 않았습니다.');
}

function startRefresh(harness) {
  const button = findRefreshButton(harness.render());
  assert.ok(button, '다시 조회 버튼이 있어야 합니다.');
  clickButton(button);
}

test('처음에는 다시 조회 버튼과 idle 안내가 있고 요청하지 않는다', () => {
  let requests = 0;
  const harness = createHarness(async () => { requests += 1; return success(); });
  const tree = harness.render();
  assert.ok(findRefreshButton(tree));
  assert.match(treeText(tree), /다시 조회를 누르면 기기·세션·보안 기록을 새로 읽고 잰 시각을 보여 줍니다/);
  assert.equal(requests, 0);
});

test('누르면 변경 알림이 오고 모든 요청이 끝날 때까지 loading과 disabled를 표시한다', async () => {
  const pending = [];
  let requests = 0;
  const harness = createHarness(() => {
    requests += 1;
    const task = deferred();
    pending.push(task);
    return task.promise;
  });
  const changesBefore = harness.changes;
  startRefresh(harness);
  assert.ok(harness.changes > changesBefore);

  let tree = harness.render();
  assert.match(treeText(tree), /새로 읽는 중…/);
  let button = findRefreshButton(tree);
  assert.ok(button);
  assert.ok(button.disabled === true || button.getAttribute?.('disabled') !== null || button.attributes?.disabled !== undefined);

  for (let index = 0; index < 3; index += 1) {
    for (let spin = 0; spin < 100 && pending.length <= index; spin += 1) await Promise.resolve();
    assert.ok(pending[index], `조회 ${index + 1}이 시작되어야 합니다.`);
    pending[index].resolve(success());
    await Promise.resolve();
  }
  tree = await waitForDone(harness);
  assert.match(treeText(tree), /성공 3건 · 실패 0건/);
});

test('세 조회 성공 결과에 잰 시각을 표시한다', async () => {
  let requests = 0;
  const harness = createHarness(async () => { requests += 1; return success(); });
  startRefresh(harness);
  const tree = await waitForDone(harness);
  assert.equal(requests, 3);
  assert.match(treeText(tree), /성공 3건 · 실패 0건/);
  assert.match(treeText(tree), /잰 시각 2026-10-27T00:00:00Z/);
});

test('기기 조회 실패는 오류와 다음 조치를 보여 주고 성공 행으로 바꾸지 않는다', async () => {
  const harness = createHarness(async path => path === '/api/devices'
    ? { ok: false, error: { code: 'NETWORK_ERROR', message: '로컬 서버에 연결할 수 없습니다.' } }
    : success());
  startRefresh(harness);
  const tree = await waitForDone(harness);
  const text = treeText(tree);
  assert.match(text, /기기 목록을\(를\) 읽지 못했습니다/);
  assert.match(text, /앱 서버 PowerShell 창/);
  assert.doesNotMatch(text, /기기 목록: 새로 읽음/);
});

test('demo 모드의 성공 결과를 예제 자료로 구분한다', async () => {
  const harness = createHarness(async () => success({ checkedAt: '2026-10-27T00:00:00Z', mode: 'demo' }));
  startRefresh(harness);
  const tree = await waitForDone(harness);
  assert.match(treeText(tree), /예제 자료\(실제 조회 아님\)/);
});

test('로딩 중 다시 눌러도 중복 get 요청을 보내지 않는다', async () => {
  const pending = [];
  let requests = 0;
  const harness = createHarness(() => {
    requests += 1;
    const task = deferred();
    pending.push(task);
    return task.promise;
  });
  startRefresh(harness);
  assert.equal(requests, 1);
  const loadingButton = findRefreshButton(harness.render());
  assert.ok(loadingButton);
  clickButton(loadingButton);
  assert.equal(requests, 1);

  for (let index = 0; index < 3; index += 1) {
    for (let spin = 0; spin < 100 && pending.length <= index; spin += 1) await Promise.resolve();
    assert.ok(pending[index], `조회 ${index + 1}이 시작되어야 합니다.`);
    pending[index].resolve(success());
    await Promise.resolve();
  }
  await waitForDone(harness);
});

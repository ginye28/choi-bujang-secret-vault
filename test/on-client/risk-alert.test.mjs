// 마지막 총공세 위험 알림 시험(모의 자료): 높음·확인 필요 분류, 연결 없음·예제에서 위험 없음이라 말하지 않기, 비밀값 가림.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-shim.mjs';
installDom();

const { createStudentView } = await import('../../on-client/student/extension.mjs');
const view = createStudentView({ api: { get: async () => ({}) }, onChange() {} });

function makeInput(overrides = {}) {
  return {
    devices: { status: 'ok', mode: 'connected', data: [{ id: 'd-1', label: '내 PC', status: 'compliant' }] },
    sessions: { status: 'ok', mode: 'connected', data: [{ id: 's-1', status: 'active' }] },
    notifications: [],
    diagnostics: { status: 'ok', mode: 'connected', data: {} },
    mode: 'connected',
    ...overrides,
  };
}

function statusText(input) {
  return view.renderStatus(input).textContent;
}

test('connected이고 기기·세션이 정상이며 알림이 비어 있으면 위험 없음으로 표시한다', () => {
  const text = statusText(makeInput());
  assert.match(text, /지금 확인된 위험 알림이 없습니다/);
});

test('noncompliant와 xdr은 높음, expired는 확인 필요로 표시한다', () => {
  const text = statusText(makeInput({
    notifications: [
      { resource: 'device:d-1', code: 'noncompliant', message: '기기가 기준을 충족하지 않습니다.' },
      { resource: 'event:e-1', code: 'xdr', message: 'XDR 경보가 있습니다.' },
      { resource: 'session:s-1', code: 'expired', message: '세션이 만료되었습니다.' },
    ],
  }));
  assert.match(text, /높음 2건 · 확인 필요 1건/);
  assert.match(text, /\[높음\]/);
  assert.match(text, /\[확인 필요\]/);
});

test('연결이 끊긴 상태의 빈 알림은 위험 없음으로 표시하지 않는다', () => {
  const text = statusText(makeInput({ mode: 'disconnected' }));
  assert.match(text, /위험이 없다는 뜻이 아닙니다/);
  assert.doesNotMatch(text, /지금 확인된 위험 알림이 없습니다/);
});

test('demo 모드는 실제 위험 판정이 아님을 표시한다', () => {
  const text = statusText(makeInput({ mode: 'demo' }));
  assert.match(text, /실제 위험 판정이 아닙니다/);
});

test('처음 보는 알림 코드는 확인 필요로 분류한다', () => {
  const text = statusText(makeInput({
    notifications: [{ resource: 'source:unknown', code: 'weird', message: '처음 보는 코드입니다.' }],
  }));
  assert.match(text, /높음 0건 · 확인 필요 1건/);
  assert.match(text, /\[확인 필요\]/);
});

test('알림이 null이면 목록을 읽을 수 없다고 표시한다', () => {
  const text = statusText(makeInput({ notifications: null }));
  assert.match(text, /확인 불가: 알림 목록을 읽을 수 없습니다/);
});

test('알림 메시지의 비밀처럼 보이는 값은 가려서 표시한다', () => {
  const secretPart = ['abcdefghijkl', 'mnop1234'].join('');
  const fake = ['Bea', 'rer ', secretPart].join('');
  const text = statusText(makeInput({
    notifications: [{ resource: 'source:test', code: 'unknown', message: fake }],
  }));
  assert.equal(text.includes(secretPart), false);
  assert.match(text, /\[가림\]/);
});

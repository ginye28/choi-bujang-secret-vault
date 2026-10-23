// 19단계 renderAction 시험(모의 자료): 제안·준비·전달·접수(ACK)·효과 확인 구분, 효과 관측 없이는 성공 아님,
// 현재 사건·조치 결속, unknown 은 성공·효과 없음으로 단정하지 않음, 새 입력마다 다시 그림, 버튼·요청 없음.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './dom-shim.mjs';

installDom();
let requests = 0;
globalThis.fetch = async () => { requests += 1; throw new Error('요청을 보내면 안 됩니다'); };
const { createStudentView } = await import('../../on-client/student/extension.mjs');
const view = createStudentView({ api: { get: async () => { requests += 1; return {}; } }, onChange() {} });

const event = { id: 'evt-3', evidence: [{ id: 'e1', text: '근거' }, { id: 'e2', text: '근거2' }], supportedActions: ['lock_device'] };
const receipt = { requestId: 'req-1', receiptId: 'rcpt-1', eventId: 'evt-3', actionId: 'lock_device', status: 'pending', version: 2, replayed: false };
const action = (over = {}) => view.renderAction({ status: 'idle', event: null, actionId: null, target: null, receipt: null, observation: null, message: '', ...over });

test('renderAction 이 학생 함수로 연결되고 상태마다 다른 문장을 원래 값과 함께 보인다', () => {
  assert.equal(typeof view.renderAction, 'function');
  const texts = {
    idle: action().textContent,
    loading: action({ status: 'loading', event, actionId: 'lock_device' }).textContent,
    prepared: action({ status: 'prepared', event, actionId: 'lock_device', target: { id: 'pc-7', generation: 4 }, confirmationExpiresAt: '2026-10-23T09:00:00Z' }).textContent,
    executing: action({ status: 'executing', event, actionId: 'lock_device', target: { id: 'pc-7', generation: 4 } }).textContent,
    pending: action({ status: 'pending', event, actionId: 'lock_device', receipt }).textContent,
    denied: action({ status: 'denied', event, actionId: 'lock_device', receipt, message: '정책상 거절' }).textContent,
    failed: action({ status: 'failed', event, actionId: 'lock_device', receipt, message: '대상 없음' }).textContent,
    unknown: action({ status: 'unknown', event, actionId: 'lock_device', receipt }).textContent,
    expired: action({ status: 'expired', event, actionId: 'lock_device' }).textContent,
    error: action({ status: 'error', event, actionId: 'lock_device', error: { code: 'ACTION_TIMEOUT', message: '시간 초과' } }).textContent,
  };
  assert.ok(texts.idle.includes('아직 미실행(idle)') && texts.idle.includes('정상'));
  assert.ok(texts.loading.includes('(loading)'));
  for (const want of ['준비됨·미실행(prepared)', 'evt-3', 'e1, e2', 'lock_device', 'pc-7', '4', '확인 기한', '대상과 조치를 확인했으며 집행합니다']) assert.ok(texts.prepared.includes(want), want);
  assert.ok(texts.executing.includes('서버에 전달 중(executing)') && texts.executing.includes('완료 아님'));
  assert.ok(texts.pending.includes('서버 접수·처리 중(pending)') && texts.pending.includes('ACK는 실제 효과가 아니'));
  for (const want of ['req-1', 'rcpt-1', '2']) assert.ok(texts.pending.includes(want), want);
  assert.ok(texts.denied.includes('거절(denied)') && texts.denied.includes('정책상 거절'));
  assert.ok(texts.failed.includes('실패(failed)') && texts.failed.includes('대상 없음'));
  assert.ok(texts.unknown.includes('결과 불명(unknown)') && texts.unknown.includes('결과만 재조회'));
  assert.ok(texts.expired.includes('(expired)') && texts.expired.includes('다시 준비'));
  assert.ok(texts.error.includes('ACTION_TIMEOUT') && texts.error.includes('시간 초과'));
  for (const [status, value] of Object.entries(texts)) {
    if (status !== 'succeeded') assert.ok(!value.includes('효과 확인(succeeded)'), `${status} 는 효과 확인으로 보이지 않는다`);
  }
});

test('succeeded 는 현재 사건·조치에 결속된 effectApplied:true 관측일 때만 효과 확인이다', () => {
  const ok = action({ status: 'succeeded', event, actionId: 'lock_device', receipt: { ...receipt, status: 'succeeded' }, observation: { observedAt: '2026-10-23T09:05:00Z', effectApplied: true } });
  for (const want of ['효과 확인(succeeded)', 'effectApplied: true', 'rcpt-1', '관측 시각']) assert.ok(ok.textContent.includes(want), want);
  assert.equal(ok.getAttribute('data-student-action-event'), 'evt-3');
  assert.equal(ok.getAttribute('data-student-action-request'), 'req-1');

  const cases = [
    { observation: { observedAt: '2026-10-23T09:05:00Z', effectApplied: false } },
    { observation: null },
    { receipt: { ...receipt, eventId: 'evt-other' }, observation: { observedAt: 'x', effectApplied: true } },
    { receipt: { ...receipt, actionId: 'other_action' }, observation: { observedAt: 'x', effectApplied: true } },
  ];
  for (const over of cases) {
    const node = action({ status: 'succeeded', event, actionId: 'lock_device', receipt, ...over });
    assert.ok(!node.textContent.includes('효과 확인(succeeded)'));
    assert.ok(node.textContent.includes('결과 불명(unknown)'));
  }
});

test('버튼·요청을 만들지 않고, 새 입력마다 이전 대상·요청·결과를 남기지 않는다', () => {
  const first = action({ status: 'pending', event, actionId: 'lock_device', receipt: { ...receipt, replayed: true } });
  assert.ok(first.textContent.includes('새 집행이 아닙니다'));
  assert.equal(first.find(n => n.tag === 'button').length, 0);
  const second = action();
  assert.notEqual(second, first);
  for (const old of ['req-1', 'rcpt-1', 'evt-3', 'lock_device']) assert.ok(!second.textContent.includes(old), old);
  assert.equal(second.getAttribute('data-student-action-request'), null);
  assert.equal(requests, 0);
});

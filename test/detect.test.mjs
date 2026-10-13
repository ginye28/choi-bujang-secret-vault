import assert from 'node:assert/strict';
import test from 'node:test';
import { detect } from '../src/detect.mjs';

const START = Date.UTC(2026, 9, 1, 0, 0, 0);
const reads = (count, { gapSeconds = 2, sub = 'learner_fixture', method = 'GET', deviceId } = {}) =>
  Array.from({ length: count }, (_, i) => ({
    at: new Date(START + i * gapSeconds * 1000).toISOString(), method,
    identity: { sub }, ...(deviceId ? { deviceId } : {}),
  }));

test('정확히 120건은 관찰만, 121건부터 회수 제안', () => {
  assert.deepEqual(detect(reads(120)), { action: 'observe' });
  assert.deepEqual(detect(reads(121)), {
    action: 'propose_revocation', reasonCode: 'burst_read', subject: 'learner_fixture' });
});

test('다른 사용자 합산·10분 밖 분산·GET 이 아닌 요청은 세지 않는다', () => {
  const mixed = [...reads(100), ...reads(100, { sub: 'other_fixture' })];
  assert.deepEqual(detect(mixed), { action: 'observe' });
  assert.deepEqual(detect(reads(200, { gapSeconds: 7 })), { action: 'observe' });
  assert.deepEqual(detect(reads(300, { method: 'POST' })), { action: 'observe' });
});

test('기기 번호가 있으면 가장 많이 쓰인 확인된 기기 한 개만 대상으로 한다', () => {
  const events = [...reads(100, { deviceId: 'a'.repeat(16) }), ...reads(40, { deviceId: 'b'.repeat(16) })]
    .sort((a, b) => a.at.localeCompare(b.at));
  const out = detect(events);
  assert.equal(out.action, 'propose_revocation');
  assert.equal(out.deviceId, 'a'.repeat(16));
  assert.deepEqual(Object.keys(out).sort(), ['action', 'deviceId', 'reasonCode', 'subject']);
});

test('잘못된 사건은 건너뛰고, 배열이 아니면 오류, 비밀값은 결과에 없다', () => {
  assert.throws(() => detect('x'), TypeError);
  const noisy = [null, 3, { at: 'x', method: 'GET', identity: { sub: 'a' } },
    { at: new Date(START).toISOString(), method: 'GET', identity: {} }, ...reads(121)]
    .map((e) => (e && typeof e === 'object' ? { ...e, token: 'secret-token', body: '메모 본문' } : e));
  const out = detect(noisy);
  assert.equal(out.action, 'propose_revocation');
  assert.doesNotMatch(JSON.stringify(out), /secret-token|메모 본문/u);
});

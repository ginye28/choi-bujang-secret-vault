import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decide, RULE_IDS } from '../src/decider.mjs';

const valid = () => ({
  schema: 'aleph.decision.v1', requestId: '11111111-1111-4111-8111-111111111111', classId: 'class_fixture',
  projectId: 'project_fixture', subjectId: 'learner_fixture', deviceId: 'a'.repeat(16), service: 'notes',
  method: 'GET', path: '/notes/0b2f9d3e-6a14-4a39-8f0e-3d1c7a9b5e21', route: 'GET /notes/:id', queryLength: 0,
  querySha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', at: new Date().toISOString(),
  policyRevision: 1, deviceRegistered: true, stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
  signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
});

test('판정기는 형식이 틀린 가상 요청에도 예외 없이 5개 이름의 거부 응답을 돌려준다', async () => {
  const cases = [
    {}, null, undefined, 'x', 42, [],
    { ...valid(), recentEvents: null }, { ...valid(), recentEvents: [null] }, { ...valid(), stepUp: null },
    { ...valid(), signals: null }, { ...valid(), at: 'bad' }, { ...valid(), schema: 'other' }, { ...valid(), path: 1 },
    { ...valid(), route: null }, { ...valid(), queryLength: -1 }, { ...valid(), deviceRegistered: 'yes' },
    { ...valid(), requestId: 42 }, { ...valid(), subjectId: null }, { ...valid(), extra: true },
  ];
  for (const request of cases) {
    const out = await decide(request);
    assert.deepEqual(Object.keys(out).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
    assert.equal(out.schema, 'aleph.decision.v1');
    assert.equal(out.decision, 'deny');
    assert.ok(out.ruleIds.length >= 1 && out.ruleIds.every((id) => RULE_IDS.includes(id)));
  }
});

test('정상 가상 요청의 응답도 5개 이름이고 ruleIds 는 RULE_IDS 안의 이름뿐이다', async () => {
  const out = await decide(valid());
  assert.deepEqual(Object.keys(out).sort(), ['decision', 'reasonCode', 'requestId', 'ruleIds', 'schema']);
  assert.equal(out.requestId, valid().requestId);
  assert.ok(out.ruleIds.every((id) => RULE_IDS.includes(id)));
});

test('판정기는 계약에 없는 request.role·identity·device·geo 를 읽지 않는다', () => {
  const source = readFileSync(new URL('../src/decider.mjs', import.meta.url), 'utf8');
  assert.equal(/request\??\.(?:role|identity|device|geo)\b/u.test(source), false);
});

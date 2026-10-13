import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { decide } from '../src/decider.mjs';
import {
  SAFE_POLICY, buildPolicyCopy, diffPolicy, policyHash, restorePolicy, verifyPolicyCopy,
} from '../src/policy.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const clone = (value) => JSON.parse(JSON.stringify(value));
const testPolicy = () => ({
  policy: clone(SAFE_POLICY),
  otherServices: { ai: { dailyLimit: 20 } },
  audit: [{ at: '2026-10-01T00:00:00.000Z', action: 'created' }],
});

function request(method, path, route, overrides = {}) {
  return {
    schema: 'aleph.decision.v1', requestId: randomUUID(), classId: 'class_fixture',
    projectId: 'project_fixture', subjectId: 'learner_fixture', deviceId: 'a'.repeat(16),
    service: path.split('/')[1], method, path, route,
    queryLength: 0, querySha256: createHash('sha256').update('').digest('hex'),
    at: new Date().toISOString(), policyRevision: 1, deviceRegistered: true,
    stepUp: { verified: false, authAgeSeconds: null }, recentEvents: [],
    signals: { source: 'judge_fixture', region: 'local', network: 'usual', hour: 14 },
    ...overrides,
  };
}

test('커밋된 안전 정책 사본은 검증을 통과하고 현재 구역 규칙과 같다', async () => {
  const copy = JSON.parse(await readFile(join(root, 'policy', 'safe-policy.json'), 'utf8'));
  assert.deepEqual(verifyPolicyCopy(copy), { ok: true, version: copy.version, sha256: copy.sha256 });
  assert.equal(copy.sha256, policyHash(SAFE_POLICY));

  // 사본이 말하는 구역 규칙을 실제 판정기와 대조합니다.
  for (const [service, templates] of Object.entries(copy.policy.zones)) {
    for (const [template, methods] of Object.entries(templates)) {
      const path = template.replace(':id', '0b2f9d3e-6a14-4a39-8f0e-3d1c7a9b5e21');
      for (const method of ['GET', 'PUT', 'DELETE', 'POST']) {
        const out = await decide(request(method, path, `${method} ${template}`));
        assert.equal(out.decision === 'allow', methods.includes(method), `${service} ${method} ${template}`);
      }
    }
  }
});

test('사본이 없거나 형식·해시가 맞지 않으면 차이도 복원도 하지 않고 멈춘다', () => {
  const copy = buildPolicyCopy();
  for (const bad of [null, undefined, { ...copy, schema: 'x' }, { ...copy, sha256: 'f'.repeat(64) },
    { ...clone(copy), policy: { ...clone(copy.policy), query: 'allow' } }]) {
    const diff = diffPolicy(bad, testPolicy());
    assert.equal(diff.ok, false);
    assert.deepEqual(diff.changes, []);
    const restored = restorePolicy(bad, testPolicy(), { confirm: true });
    assert.equal(restored.restored, false);
    assert.equal(restored.testPolicy, undefined);
  }
});

test('실행 전에 버전과 바뀔 항목이 보이고, 확인 없이는 아무것도 바꾸지 않는다', () => {
  const copy = buildPolicyCopy();
  const tampered = testPolicy();
  tampered.policy.zones.notes['/notes/:id'] = ['GET', 'PUT'];
  tampered.policy.ownerRule.denyOtherSubjects = false;

  const plan = diffPolicy(copy, tampered);
  assert.equal(plan.ok, true);
  assert.equal(plan.version, copy.version);
  assert.deepEqual(plan.changes.map((change) => change.path),
    ['ownerRule.denyOtherSubjects', 'zones.notes./notes/:id']);
  assert.deepEqual(plan.preserved, ['audit', 'otherServices']);

  const dry = restorePolicy(copy, tampered, { confirm: false });
  assert.equal(dry.restored, false);
  assert.equal(dry.reason, 'CONFIRMATION_REQUIRED');
  assert.deepEqual(tampered.policy.zones.notes['/notes/:id'], ['GET', 'PUT']);
});

test('확인 뒤 복원하면 안전 정책으로 돌아오고 다른 서비스 규칙과 감사 이력은 보존된다', async () => {
  const copy = buildPolicyCopy();
  const tampered = testPolicy();
  tampered.policy.zones.notes['/notes/:id'] = ['GET', 'PUT', 'DELETE'];
  tampered.policy.device.requireRegisteredDevice = false;
  tampered.otherServices.ai.dailyLimit = 999;

  const out = restorePolicy(copy, tampered, { confirm: true, now: new Date('2026-10-13T00:00:00.000Z') });
  assert.equal(out.restored, true);
  assert.deepEqual(out.testPolicy.policy, clone(SAFE_POLICY));
  assert.equal(out.testPolicy.otherServices.ai.dailyLimit, 999);
  assert.equal(out.testPolicy.audit.length, 2);
  assert.equal(out.testPolicy.audit[0].action, 'created');
  assert.deepEqual(out.testPolicy.audit[1].changed.sort(),
    ['device.requireRegisteredDevice', 'zones.notes./notes/:id']);

  // 되돌린 정책으로: B 의 A 자료 요청은 거부되고 A 의 정상 요청은 유지된다.
  const other = await decide(request('GET', '/notes/demo', 'GET /notes/:id', { subjectId: 'learner_other' }));
  assert.equal(other.decision, 'deny');
  const own = await decide(request('GET', '/notes/demo', 'GET /notes/:id'));
  assert.equal(own.decision, 'allow');
});

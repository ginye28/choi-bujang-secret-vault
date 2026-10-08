import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import {
  getActiveXdrDenyRules,
  isDeniedByXdrSourceAddress,
  syncBruteForceDenyRules,
} from '../xdr/brute-force/connect-ztna.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

async function makeSandbox() {
  const root = await mkdtemp(join(tmpdir(), 'xdr-ztna-'));
  await mkdir(join(root, 'xdr', 'fixtures'), { recursive: true });
  await mkdir(join(root, 'xdr', 'brute-force'), { recursive: true });
  await cp(join(projectRoot, 'xdr', 'brute-force', 'patterns.json'), join(root, 'xdr', 'brute-force', 'patterns.json'));
  return root;
}

function alert(id, sourceAddress, description, level = 12) {
  return {
    id,
    timestamp: '2026-09-27T09:12:01+09:00',
    agent: { name: 'training-fixture' },
    rule: { level, description, mitre: ['T1110'] },
    data: { srcip: sourceAddress, count: '48' },
  };
}

const attackPattern = '짧은 시간 같은 주소의 로그인 실패 연속';

test('확정 차단 후보만 만료·근거가 있는 별도 거부 규칙이 되고 정상 사용자는 제외된다', async () => {
  const root = await makeSandbox();
  try {
    const alerts = [
      alert('bf-attack', '203.0.113.10', '같은 주소에서 1분 안에 로그인 실패 48건입니다.'),
      alert('bf-normal-source', '192.0.2.60', '로그인이 성공했습니다.'),
      alert('bf-uncertain', '198.51.100.20', '실패가 있었지만 판별이 애매합니다.'),
      alert('bf-low-level', '198.51.100.21', '같은 주소에서 1분 안에 로그인 실패 48건입니다.', 3),
    ];
    await writeFile(join(root, 'xdr', 'fixtures', 'brute-force.json'), JSON.stringify({
      schema: 'aleph.xdr.fixture.v1', moduleKey: 'brute-force', alerts,
    }));
    const logPath = join(root, 'xdr', 'alerts.log');
    await writeFile(logPath, `${JSON.stringify({ type: 'existing' })}\n`);

    const result = await syncBruteForceDenyRules({
      root,
      now: () => new Date('2026-10-01T00:00:00.000Z'),
      ttlMs: 60_000,
      decideAlert: async (item) => {
        if (item.id === 'bf-normal-source') {
          return { action: 'block', confidence: 0.99, reason: attackPattern };
        }
        if (item.id === 'bf-uncertain') {
          return { action: 'block', confidence: 0.84, reason: attackPattern };
        }
        if (item.id === 'bf-low-level') {
          return { action: 'block', confidence: 0.99, reason: attackPattern };
        }
        return { action: 'block', confidence: 0.99, reason: attackPattern };
      },
    });

    assert.deepEqual(result.addedRules.map((rule) => rule.evidenceAlertId), ['bf-attack']);
    assert.equal(result.notificationsAppended, 1);
    const rule = result.activeRules[0];
    assert.equal(rule.action, 'deny');
    assert.deepEqual(rule.match, { sourceAddress: '203.0.113.10' });
    assert.equal(rule.evidenceAlertId, 'bf-attack');
    assert.equal(rule.expiresAt, '2026-10-01T00:01:00.000Z');
    assert.equal(await getActiveXdrDenyRules({ root, at: new Date('2026-10-01T00:00:30.000Z') }).then((rules) => rules.length), 1);
    assert.equal(await isDeniedByXdrSourceAddress('203.0.113.10', { root, at: new Date('2026-10-01T00:00:30.000Z') }), true);
    assert.equal(await isDeniedByXdrSourceAddress('192.0.2.60', { root, at: new Date('2026-10-01T00:00:30.000Z') }), false);
    assert.equal(await getActiveXdrDenyRules({ root, at: new Date('2026-10-01T00:01:00.000Z') }).then((rules) => rules.length), 0);

    const logLines = (await readFile(logPath, 'utf8')).trim().split('\n');
    assert.equal(logLines.length, 2);
    assert.deepEqual(JSON.parse(logLines[0]), { type: 'existing' });
    assert.deepEqual(JSON.parse(logLines[1]), {
      type: 'ztna_deny_rule_created',
      createdAt: '2026-10-01T00:00:00.000Z',
      ruleId: 'xdr_bruteforce_bf_attack',
      evidenceAlertId: 'bf-attack',
      expiresAt: '2026-10-01T00:01:00.000Z',
    });

    const secondRun = await syncBruteForceDenyRules({
      root,
      now: () => new Date('2026-10-01T00:00:10.000Z'),
      ttlMs: 60_000,
      decideAlert: async () => ({ action: 'block', confidence: 1, reason: attackPattern }),
    });
    assert.deepEqual(secondRun.addedRules, []);
    assert.equal(secondRun.notificationsAppended, 0);
    assert.equal((await readFile(logPath, 'utf8')).trim().split('\n').length, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('규칙 만료 시간을 24시간 초과로 설정하지 않는다', async () => {
  const root = await makeSandbox();
  try {
    await writeFile(join(root, 'xdr', 'fixtures', 'brute-force.json'), JSON.stringify({
      schema: 'aleph.xdr.fixture.v1', moduleKey: 'brute-force', alerts: [],
    }));
    await assert.rejects(
      syncBruteForceDenyRules({ root, ttlMs: 24 * 60 * 60 * 1000 + 1 }),
      /1초 이상 24시간 이하/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

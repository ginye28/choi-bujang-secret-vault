import assert from 'node:assert/strict';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { decide } from '../xdr/web-injection/decide.mjs';
import {
  getActiveXdrDenyRules,
  isDeniedByXdrSourceAddress,
  syncWebInjectionDenyRules,
} from '../xdr/web-injection/connect-ztna.mjs';

const projectRoot = fileURLToPath(new URL('..', import.meta.url));

async function makeSandbox() {
  const root = await mkdtemp(join(tmpdir(), 'web-injection-ztna-'));
  await mkdir(join(root, 'xdr', 'fixtures'), { recursive: true });
  await mkdir(join(root, 'xdr', 'web-injection'), { recursive: true });
  await cp(join(projectRoot, 'xdr', 'fixtures', 'web-injection.json'), join(root, 'xdr', 'fixtures', 'web-injection.json'));
  await cp(join(projectRoot, 'xdr', 'web-injection', 'patterns.json'), join(root, 'xdr', 'web-injection', 'patterns.json'));
  return root;
}

test('웹 주입 시험 경보 중 명확한 공격만 제한 시간 동안 거부하고 정상 요청은 통과시킨다', async () => {
  const root = await makeSandbox();
  try {
    const fixture = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', 'web-injection.json'), 'utf8'));
    const decisions = await Promise.all(fixture.alerts.map(async (alert) => ({
      id: alert.id,
      alert,
      decision: await decide(alert),
    })));
    const expectedBlockedIds = ['wi-01', 'wi-02', 'wi-03', 'wi-04', 'wi-05', 'wi-06', 'wi-07', 'wi-08'];
    assert.deepEqual(
      decisions.filter(({ decision }) => decision.action === 'block').map(({ id }) => id),
      expectedBlockedIds,
    );
    assert.deepEqual(
      decisions.filter(({ decision }) => decision.action === 'alert').map(({ id }) => id),
      ['wi-09', 'wi-10', 'wi-11', 'wi-12', 'wi-13', 'wi-14', 'wi-15', 'wi-16', 'wi-17'],
    );
    assert.deepEqual(
      decisions.filter(({ decision }) => decision.action === 'record').map(({ id }) => id),
      ['wi-18', 'wi-19', 'wi-20', 'wi-21', 'wi-22', 'wi-23', 'wi-24', 'wi-25', 'wi-26'],
    );

    const result = await syncWebInjectionDenyRules({
      root,
      now: () => new Date('2026-10-01T00:00:00.000Z'),
      ttlMs: 60_000,
    });
    assert.deepEqual(result.addedRules.map((rule) => rule.evidenceAlertId), expectedBlockedIds);
    assert.equal(result.notificationsAppended, result.addedRules.length);
    assert.ok(result.addedRules.every((rule) => rule.action === 'deny'
      && rule.expiresAt === '2026-10-01T00:01:00.000Z'
      && typeof rule.evidenceAlertId === 'string'
      && rule.reason.includes('패턴')));

    const ruleFile = JSON.parse(await readFile(join(root, 'xdr', 'ztna-deny-rules.json'), 'utf8'));
    assert.equal(ruleFile.rules.length, result.addedRules.length);
    const activeAt = new Date('2026-10-01T00:00:30.000Z');
    const activeRules = await getActiveXdrDenyRules({ root, at: activeAt });
    assert.equal(activeRules.length, result.addedRules.length);
    const expectedDeniedAddresses = new Set(result.addedRules.map((rule) => rule.match.sourceAddress));
    for (const { id, alert } of decisions) {
      const denied = await isDeniedByXdrSourceAddress(alert.data.srcip, { root, at: activeAt });
      assert.equal(denied, expectedDeniedAddresses.has(alert.data.srcip), `${id} address deny state must match allowed rules`);
    }
    assert.equal((await getActiveXdrDenyRules({ root, at: new Date('2026-10-01T00:01:00.000Z') })).length, 0);

    const logLines = (await readFile(join(root, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n');
    assert.equal(logLines.length, result.addedRules.length);
    for (const line of logLines) {
      const entry = JSON.parse(line);
      assert.ok(result.addedRules.some((rule) => rule.evidenceAlertId === entry.evidenceAlertId));
      assert.equal(entry.expiresAt, '2026-10-01T00:01:00.000Z');
    }

    const secondRun = await syncWebInjectionDenyRules({
      root,
      now: () => new Date('2026-10-01T00:00:10.000Z'),
      ttlMs: 60_000,
    });
    assert.deepEqual(secondRun.addedRules, []);
    assert.equal(secondRun.notificationsAppended, 0);
    assert.equal((await readFile(join(root, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n').length, result.addedRules.length);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('등록 패턴과 별개인 경보는 IP 차단 후보가 될 수 없다', async () => {
  const root = await makeSandbox();
  try {
    const fixturePath = join(root, 'xdr', 'fixtures', 'web-injection.json');
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
    fixture.alerts = [
      {
        id: 'custom-01',
        rule: { level: 12, description: '등록되지 않은 현상 반복 9번', mitre: ['T1190'] },
        data: { srcip: '203.0.113.99', url: '/notes?q=ordinary', count: 9 },
      },
    ];
    await writeFile(fixturePath, JSON.stringify(fixture));
    const result = await syncWebInjectionDenyRules({
      root,
      decideAlert: async () => ({ action: 'block', confidence: 0.99, reason: '등록되지 않은 현상' }),
    });
    assert.deepEqual(result.addedRules, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('규칙 TTL은 24시간을 넘지 않는다', async () => {
  const root = await makeSandbox();
  try {
    await assert.rejects(
      syncWebInjectionDenyRules({ root, ttlMs: 24 * 60 * 60 * 1000 + 1 }),
      /1초 이상 24시간 이하/u,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

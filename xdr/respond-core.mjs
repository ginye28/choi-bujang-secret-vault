import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 3차 XDR 모듈(known-cve·persistence·privilege·exfiltration)이 함께 쓰는 대응 연결입니다.
// decide.mjs 가 돌려준 차단 후보만 별도 ZTNA 거부 규칙 파일(xdr/ztna-deny-rules.json)에 넣고,
// 알림은 xdr/alerts.log 에 한 줄씩 쌓습니다. src/decider.mjs 의 기존 규칙은 읽거나 고치지 않습니다.
const PROJECT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const RULES_PATH = join('xdr', 'ztna-deny-rules.json');
const ALERTS_PATH = join('xdr', 'alerts.log');
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const ALERT_ID = /^[A-Za-z0-9_-]{1,80}$/u;
const RULE_ID = /^[a-z][a-z0-9_]{0,63}$/u;

function isSafeRule(rule) {
  return Boolean(rule) && typeof rule === 'object' && !Array.isArray(rule)
    && typeof rule.ruleId === 'string' && RULE_ID.test(rule.ruleId)
    && rule.action === 'deny'
    && typeof rule.match?.sourceAddress === 'string' && isIP(rule.match.sourceAddress) !== 0
    && typeof rule.createdAt === 'string' && Number.isFinite(Date.parse(rule.createdAt))
    && typeof rule.expiresAt === 'string' && Number.isFinite(Date.parse(rule.expiresAt))
    && typeof rule.evidenceAlertId === 'string' && ALERT_ID.test(rule.evidenceAlertId)
    && typeof rule.reason === 'string';
}

async function readOptionalText(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

async function readRules(root) {
  const text = await readOptionalText(join(root, RULES_PATH));
  if (text === null) return [];
  const document = JSON.parse(text);
  if (document?.schema !== 'aleph.ztna.deny-rules.v1' || !Array.isArray(document.rules)
      || !document.rules.every(isSafeRule)) {
    throw new Error('ZTNA 거부 규칙 파일 형식이 올바르지 않습니다.');
  }
  return document.rules;
}

async function readNotifiedRuleIds(root) {
  const text = await readOptionalText(join(root, ALERTS_PATH));
  const notified = new Set();
  if (text === null) return notified;
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.type === 'ztna_deny_rule_created' && typeof entry.ruleId === 'string') {
        notified.add(entry.ruleId);
      }
    } catch {
      // 다른 형식이거나 손상된 기존 행은 건드리지 않고 건너뜁니다.
    }
  }
  return notified;
}

/**
 * 확신도 0.9 이상인 block 후보만 거부 규칙으로 넣습니다.
 * 같은 출발 주소에서 record(정상) 판정이 나온 경보가 있으면 그 주소는 막지 않습니다.
 */
export async function syncDenyRules({
  root = PROJECT_ROOT,
  moduleKey,
  decide,
  now = () => new Date(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (typeof moduleKey !== 'string' || !/^[a-z][a-z-]{0,40}$/u.test(moduleKey)) {
    throw new TypeError('moduleKey 가 올바르지 않습니다.');
  }
  if (typeof decide !== 'function') throw new TypeError('decide 함수가 필요합니다.');
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > MAX_TTL_MS) {
    throw new RangeError('규칙 만료 시간은 1초 이상 24시간 이하여야 합니다.');
  }
  const projectRoot = resolve(root);
  const current = now instanceof Date ? now : new Date(typeof now === 'function' ? now() : now);
  if (!Number.isFinite(current.getTime())) throw new TypeError('현재 시각이 유효하지 않습니다.');
  const createdAt = current.toISOString();
  const expiresAt = new Date(current.getTime() + ttlMs).toISOString();

  const fixture = JSON.parse(await readFile(
    join(projectRoot, 'xdr', 'fixtures', `${moduleKey}.json`), 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || fixture.moduleKey !== moduleKey
      || !Array.isArray(fixture.alerts)) {
    throw new Error('경보 묶음 형식이 올바르지 않습니다.');
  }

  const decided = [];
  const normalSources = new Set();
  for (const alert of fixture.alerts) {
    const decision = await decide(alert);
    decided.push({ alert, decision });
    const source = alert?.data?.srcip;
    if (decision?.action === 'record' && typeof source === 'string') normalSources.add(source);
  }

  const rules = await readRules(projectRoot);
  const seenEvidence = new Set(rules.map((rule) => rule.evidenceAlertId));
  const added = [];
  for (const { alert, decision } of decided) {
    const id = alert?.id;
    const source = alert?.data?.srcip;
    if (decision?.action !== 'block' || !(decision.confidence >= 0.9)) continue;
    if (typeof id !== 'string' || !ALERT_ID.test(id) || seenEvidence.has(id)) continue;
    if (typeof source !== 'string' || isIP(source) === 0 || normalSources.has(source)) continue;
    const rule = {
      ruleId: `xdr_${moduleKey.replace(/-/gu, '')}_${id.replace(/[^A-Za-z0-9]/gu, '_')}`.toLowerCase(),
      action: 'deny',
      match: { sourceAddress: source },
      createdAt,
      expiresAt,
      evidenceAlertId: id,
      reason: decision.reason,
    };
    if (!isSafeRule(rule)) throw new Error(`생성한 규칙 형식이 올바르지 않습니다: ${id}`);
    rules.push(rule);
    added.push(rule);
    seenEvidence.add(id);
  }

  await mkdir(dirname(join(projectRoot, RULES_PATH)), { recursive: true });
  await writeFile(join(projectRoot, RULES_PATH), `${JSON.stringify({
    schema: 'aleph.ztna.deny-rules.v1', generatedAt: createdAt, rules,
  }, null, 2)}\n`, 'utf8');

  const notified = await readNotifiedRuleIds(projectRoot);
  const pending = rules.filter((rule) => !notified.has(rule.ruleId));
  if (pending.length > 0) {
    const alertsPath = join(projectRoot, ALERTS_PATH);
    const old = await readOptionalText(alertsPath);
    const separator = old && !old.endsWith('\n') ? '\n' : '';
    const lines = pending.map((rule) => JSON.stringify({
      type: 'ztna_deny_rule_created', createdAt: rule.createdAt, ruleId: rule.ruleId,
      evidenceAlertId: rule.evidenceAlertId, expiresAt: rule.expiresAt,
    }));
    await mkdir(dirname(alertsPath), { recursive: true });
    await appendFile(alertsPath, `${separator}${lines.join('\n')}\n`, 'utf8');
  }

  const counts = { block: 0, alert: 0, record: 0 };
  for (const { decision } of decided) counts[decision?.action] += 1;
  return { addedRules: added, notificationsAppended: pending.length, counts };
}

import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURE_RELATIVE_PATH = join('xdr', 'fixtures', 'brute-force.json');
const PATTERNS_RELATIVE_PATH = join('xdr', 'brute-force', 'patterns.json');
const RULES_RELATIVE_PATH = join('xdr', 'ztna-deny-rules.json');
const ALERTS_RELATIVE_PATH = join('xdr', 'alerts.log');
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const ALERT_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/u;
const RULE_ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;
const EXPLICIT_SUCCESS_OR_NORMAL = /로그인이 성공했습니다|로그인에 성공했습니다|로그아웃(?:했습니다)?|비밀번호 변경이 성공했습니다|세션 유지|자료실 화면이 열렸습니다|로그인 상태가 유지되고 있습니다|그\s*뒤에?\s*성공했습니다|실패\s*\d+\s*건\s*뒤에?\s*성공했습니다/u;

function dateValue(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} 시각이 유효하지 않습니다.`);
  return date;
}

function isSafeRule(rule) {
  return Boolean(rule)
    && typeof rule === 'object'
    && !Array.isArray(rule)
    && typeof rule.ruleId === 'string'
    && RULE_ID_PATTERN.test(rule.ruleId)
    && rule.action === 'deny'
    && typeof rule.match?.sourceAddress === 'string'
    && isIP(rule.match.sourceAddress) !== 0
    && typeof rule.createdAt === 'string'
    && Number.isFinite(Date.parse(rule.createdAt))
    && typeof rule.expiresAt === 'string'
    && Number.isFinite(Date.parse(rule.expiresAt))
    && typeof rule.evidenceAlertId === 'string'
    && ALERT_ID_PATTERN.test(rule.evidenceAlertId)
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

async function readRulesManifest(root) {
  const text = await readOptionalText(join(root, RULES_RELATIVE_PATH));
  if (text === null) return { schema: 'aleph.ztna.deny-rules.v1', generatedAt: null, rules: [] };

  const document = JSON.parse(text);
  if (document?.schema !== 'aleph.ztna.deny-rules.v1' || !Array.isArray(document.rules)) {
    throw new Error('ZTNA 거부 규칙 파일 형식이 올바르지 않습니다.');
  }
  const seenEvidence = new Set();
  for (const rule of document.rules) {
    if (!isSafeRule(rule) || seenEvidence.has(rule.evidenceAlertId)) {
      throw new Error('ZTNA 거부 규칙 파일에 유효하지 않거나 중복된 규칙이 있습니다.');
    }
    seenEvidence.add(rule.evidenceAlertId);
  }
  return document;
}

async function readNotifiedRuleIds(root) {
  const text = await readOptionalText(join(root, ALERTS_RELATIVE_PATH));
  if (text === null) return new Set();
  const notified = new Set();
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.type === 'ztna_deny_rule_created'
          && typeof entry.ruleId === 'string'
          && RULE_ID_PATTERN.test(entry.ruleId)) {
        notified.add(entry.ruleId);
      }
    } catch {
      // 기존의 다른/손상된 로그 행은 변경하지 않고 건너뜁니다.
    }
  }
  return notified;
}

function explicitNormalSource(alert) {
  const description = alert?.rule?.description;
  const sourceAddress = alert?.data?.srcip;
  return typeof description === 'string'
    && EXPLICIT_SUCCESS_OR_NORMAL.test(description)
    && typeof sourceAddress === 'string'
    && isIP(sourceAddress) !== 0
    ? sourceAddress
    : null;
}

function hasStrongPatternEvidence(alert, reason) {
  const description = alert?.rule?.description;
  if (typeof description !== 'string') return false;

  if (reason === '짧은 시간 같은 주소의 로그인 실패 연속') {
    const rawCount = alert?.data?.count;
    const count = typeof rawCount === 'number' && Number.isFinite(rawCount)
      ? rawCount
      : typeof rawCount === 'string' && /^\d+$/u.test(rawCount.trim())
        ? Number(rawCount)
        : Number(description.match(/실패\s*(\d+)\s*건/u)?.[1]);
    const windowMatch = description.match(/(\d+)\s*(초|분)\s*(?:안에?|동안|이내)/u);
    if (!windowMatch || !Number.isFinite(count) || count < 10) return false;
    const seconds = Number(windowMatch[1]) * (windowMatch[2] === '분' ? 60 : 1);
    return seconds <= 120 && /로그인\s*실패|실패/u.test(description);
  }

  if (reason === '여러 계정에 같은 비밀번호 대입') {
    const accounts = alert?.data?.accounts;
    const hasMultipleAccounts = /여러\s*계정|서로\s*다른\s*계정|계정\s*\d+\s*개/u.test(description)
      || (typeof accounts === 'string' && accounts.split(',').filter((item) => item.trim()).length > 1);
    return /같은\s*비밀번호/u.test(description) && hasMultipleAccounts;
  }

  return false;
}

function isStrongBlockCandidate(alert, decision, patternNames, knownNormalSources) {
  const description = alert?.rule?.description;
  const sourceAddress = alert?.data?.srcip;
  const evidenceAlertId = alert?.id;
  return decision?.action === 'block'
    && Number.isFinite(decision.confidence)
    && decision.confidence >= 0.95
    && patternNames.has(decision.reason)
    && hasStrongPatternEvidence(alert, decision.reason)
    && Array.isArray(alert?.rule?.mitre)
    && alert.rule.mitre.includes('T1110')
    && Number.isFinite(alert?.rule?.level)
    && alert.rule.level >= 10
    && typeof description === 'string'
    && !EXPLICIT_SUCCESS_OR_NORMAL.test(description)
    && typeof sourceAddress === 'string'
    && isIP(sourceAddress) !== 0
    && !knownNormalSources.has(sourceAddress)
    && typeof evidenceAlertId === 'string'
    && ALERT_ID_PATTERN.test(evidenceAlertId);
}

function validateTtl(ttlMs) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > MAX_TTL_MS) {
    throw new RangeError('규칙 만료 시간은 1초 이상 24시간 이하여야 합니다.');
  }
}

/**
 * 확정된 brute-force 차단 후보만 별도 ZTNA 거부 규칙 파일에 추가합니다.
 * 기존 src/decider.mjs 규칙은 읽거나 수정하지 않습니다.
 */
export async function syncBruteForceDenyRules({
  root = PROJECT_ROOT,
  now = () => new Date(),
  ttlMs = DEFAULT_TTL_MS,
  decideAlert,
} = {}) {
  validateTtl(ttlMs);
  const currentTime = dateValue(typeof now === 'function' ? now() : now, '현재');
  const createdAt = currentTime.toISOString();
  const expiresAt = new Date(currentTime.getTime() + ttlMs).toISOString();
  const projectRoot = resolve(root);

  const [fixtureText, patternsText] = await Promise.all([
    readFile(join(projectRoot, FIXTURE_RELATIVE_PATH), 'utf8'),
    readFile(join(projectRoot, PATTERNS_RELATIVE_PATH), 'utf8'),
  ]);
  const fixture = JSON.parse(fixtureText);
  const patternsDocument = JSON.parse(patternsText);
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'brute-force'
      || !Array.isArray(fixture.alerts)
      || patternsDocument?.moduleKey !== 'brute-force'
      || !Array.isArray(patternsDocument.patterns)) {
    throw new Error('brute-force 경보 또는 패턴 파일 형식이 올바르지 않습니다.');
  }
  const patternNames = new Set(patternsDocument.patterns
    .map((pattern) => pattern?.name)
    .filter((name) => typeof name === 'string'));
  if (patternNames.size === 0) throw new Error('근거 패턴 이름을 찾을 수 없습니다.');

  const { decide } = decideAlert ? { decide: decideAlert } : await import('./decide.mjs');
  if (typeof decide !== 'function') throw new TypeError('경보 판정 함수가 올바르지 않습니다.');

  const knownNormalSources = new Set(fixture.alerts.map(explicitNormalSource).filter(Boolean));
  const manifest = await readRulesManifest(projectRoot);
  const existingEvidence = new Set(manifest.rules.map((rule) => rule.evidenceAlertId));
  const nextRules = [...manifest.rules];
  const addedRules = [];

  for (const alert of fixture.alerts) {
    const evidenceAlertId = alert?.id;
    if (typeof evidenceAlertId !== 'string' || existingEvidence.has(evidenceAlertId)) continue;
    const decision = await decide(alert);
    if (!isStrongBlockCandidate(alert, decision, patternNames, knownNormalSources)) continue;

    const ruleId = `xdr_bruteforce_${evidenceAlertId.replace(/[^A-Za-z0-9]/gu, '_')}`;
    const rule = {
      ruleId,
      action: 'deny',
      match: { sourceAddress: alert.data.srcip },
      createdAt,
      expiresAt,
      evidenceAlertId,
      reason: decision.reason,
    };
    if (!isSafeRule(rule)) throw new Error(`생성한 규칙 형식이 올바르지 않습니다: ${evidenceAlertId}`);
    nextRules.push(rule);
    addedRules.push(rule);
    existingEvidence.add(evidenceAlertId);
  }

  const rulesPath = join(projectRoot, RULES_RELATIVE_PATH);
  await mkdir(dirname(rulesPath), { recursive: true });
  await writeFile(rulesPath, `${JSON.stringify({
    schema: 'aleph.ztna.deny-rules.v1',
    generatedAt: createdAt,
    rules: nextRules,
  }, null, 2)}\n`, 'utf8');

  const notifiedRuleIds = await readNotifiedRuleIds(projectRoot);
  const pendingNotifications = nextRules.filter((rule) => !notifiedRuleIds.has(rule.ruleId));
  if (pendingNotifications.length > 0) {
    const alertsPath = join(projectRoot, ALERTS_RELATIVE_PATH);
    await mkdir(dirname(alertsPath), { recursive: true });
    const oldLog = await readOptionalText(alertsPath);
    const separator = oldLog && !oldLog.endsWith('\n') ? '\n' : '';
    const lines = pendingNotifications.map((rule) => JSON.stringify({
      type: 'ztna_deny_rule_created',
      createdAt: rule.createdAt,
      ruleId: rule.ruleId,
      evidenceAlertId: rule.evidenceAlertId,
      expiresAt: rule.expiresAt,
    }));
    await appendFile(alertsPath, `${separator}${lines.join('\n')}\n`, 'utf8');
  }

  const activeRules = nextRules.filter((rule) => Date.parse(rule.expiresAt) > currentTime.getTime());
  return {
    addedRules,
    activeRules,
    notificationsAppended: pendingNotifications.length,
  };
}

/** 만료되지 않은 별도 XDR 규칙을 반환합니다. */
export async function getActiveXdrDenyRules({ root = PROJECT_ROOT, at = new Date() } = {}) {
  const currentTime = dateValue(at, '조회');
  const manifest = await readRulesManifest(resolve(root));
  return manifest.rules.filter((rule) => Date.parse(rule.expiresAt) > currentTime.getTime());
}

/** 신뢰된 실행 환경에서 얻은 출발 주소와 활성 XDR 규칙의 일치 여부를 확인합니다. */
export async function isDeniedByXdrSourceAddress(sourceAddress, options = {}) {
  if (typeof sourceAddress !== 'string' || isIP(sourceAddress) === 0) return false;
  const activeRules = await getActiveXdrDenyRules(options);
  return activeRules.some((rule) => rule.action === 'deny'
    && rule.match.sourceAddress === sourceAddress);
}

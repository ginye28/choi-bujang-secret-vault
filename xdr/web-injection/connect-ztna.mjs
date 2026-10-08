import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FIXTURE_PATH = join('xdr', 'fixtures', 'web-injection.json');
const PATTERNS_PATH = join('xdr', 'web-injection', 'patterns.json');
const RULES_PATH = join('xdr', 'ztna-deny-rules.json');
const ALERTS_PATH = join('xdr', 'alerts.log');
const DEFAULT_TTL_MS = 15 * 60 * 1000;
const MAX_TTL_MS = 24 * 60 * 60 * 1000;
const ALERT_ID_PATTERN = /^[A-Za-z0-9_-]{1,46}$/u;
const RULE_ID_PATTERN = /^[a-z][a-z0-9_]{0,63}$/u;

function dateValue(value, label) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new TypeError(`${label} 시각이 유효하지 않습니다.`);
  return date;
}

function validateTtl(ttlMs) {
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 1_000 || ttlMs > MAX_TTL_MS) {
    throw new RangeError('규칙 만료 시간은 1초 이상 24시간 이하여야 합니다.');
  }
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
    && Date.parse(rule.expiresAt) > Date.parse(rule.createdAt)
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

async function readRules(root) {
  const text = await readOptionalText(join(root, RULES_PATH));
  if (text === null) return { schema: 'aleph.ztna.deny-rules.v1', generatedAt: null, rules: [] };
  const document = JSON.parse(text);
  if (document?.schema !== 'aleph.ztna.deny-rules.v1' || !Array.isArray(document.rules)) {
    throw new Error('ZTNA 거부 규칙 파일 형식이 올바르지 않습니다.');
  }
  const evidenceIds = new Set();
  for (const rule of document.rules) {
    if (!isSafeRule(rule) || evidenceIds.has(rule.evidenceAlertId)) {
      throw new Error('ZTNA 거부 규칙 파일에 유효하지 않거나 중복된 규칙이 있습니다.');
    }
    evidenceIds.add(rule.evidenceAlertId);
  }
  return document;
}

async function readNotifiedRuleIds(root) {
  const text = await readOptionalText(join(root, ALERTS_PATH));
  const result = new Set();
  if (text === null) return result;
  for (const line of text.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      if (entry?.type === 'ztna_deny_rule_created'
          && typeof entry.ruleId === 'string'
          && RULE_ID_PATTERN.test(entry.ruleId)) result.add(entry.ruleId);
    } catch {
      // 기존 로그 행은 수정하지 않고 건너뜁니다.
    }
  }
  return result;
}

function countOf(alert) {
  const value = alert?.data?.count;
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/u.test(value.trim())) return Number(value);
  const description = alert?.rule?.description;
  const match = typeof description === 'string' ? description.match(/(\d+)\s*번/u) : null;
  return match ? Number(match[1]) : null;
}

function matchesPattern(name, alert) {
  const description = typeof alert?.rule?.description === 'string' ? alert.rule.description : '';
  const requestArgument = typeof alert?.data?.url === 'string' ? alert.data.url : '';
  const text = `${description}\n${requestArgument}`;
  switch (name) {
    case '요청 인자 내 SQL 구문':
      return /SQL\s*(?:구문|표기|표식)/iu.test(text)
        || /데이터베이스\s*조회.{0,30}(?:이어\s*붙|표기)/iu.test(text)
        || /doc-(?:sql-(?:chain|or|select-chain)|mixed-marker)/iu.test(text)
        || /\bunion\s+(?:all\s+)?select\b|\bselect\b.{0,40}\bfrom\b/iu.test(requestArgument)
        || /(?:%27|')\s*(?:or|and)\s+(?:%27|')?\d/iu.test(requestArgument);
    case '반복 명령 구분자 표기':
      return /명령\s*구분자\s*표기/iu.test(text)
        || /doc-cmd-separator/iu.test(requestArgument);
    case '요청 인자 내 스크립트 태그':
      return /스크립트\s*(?:삽입\s*)?(?:표기|표식)/iu.test(text)
        || /doc-(?:script-marker|mixed-marker)/iu.test(text)
        || /<\s*script\b|%3c\s*script\b/iu.test(requestArgument);
    case '반복 경로 거슬러 올라가기':
      return /경로.{0,30}(?:거슬러\s*올라가는\s*표기|이탈\s*표기)/iu.test(text)
        || /doc-up-repeat/iu.test(requestArgument)
        || /(?:\.\.|%2e%2e)(?:\/|%2f|\\|%5c)/iu.test(requestArgument);
    default:
      return false;
  }
}

function isStrongBlockCandidate(alert, decision, patternNames) {
  const sourceAddress = alert?.data?.srcip;
  const level = alert?.rule?.level;
  const techniques = alert?.rule?.mitre;
  const reason = decision?.reason;
  const count = countOf(alert);
  const matchedNames = [...patternNames].filter((name) => matchesPattern(name, alert));
  return decision?.action === 'block'
    && Number.isFinite(decision.confidence)
    && decision.confidence >= 0.85
    && decision.confidence <= 1
    && typeof reason === 'string'
    && matchedNames.some((name) => reason.includes(name))
    && count !== null
    && count >= 5
    && Number.isFinite(level)
    && level >= 10
    && Array.isArray(techniques)
    && techniques.includes('T1190')
    && typeof sourceAddress === 'string'
    && isIP(sourceAddress) !== 0;
}

/** 확정된 웹 주입 차단 후보만 별도 규칙 파일에 추가합니다. 기존 판정기 규칙은 변경하지 않습니다. */
export async function syncWebInjectionDenyRules({
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
    readFile(join(projectRoot, FIXTURE_PATH), 'utf8'),
    readFile(join(projectRoot, PATTERNS_PATH), 'utf8'),
  ]);
  const fixture = JSON.parse(fixtureText);
  const patternsDocument = JSON.parse(patternsText);
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'web-injection'
      || !Array.isArray(fixture.alerts)
      || patternsDocument?.schema !== 'aleph.xdr.patterns.v1'
      || patternsDocument.moduleKey !== 'web-injection'
      || !Array.isArray(patternsDocument.patterns)) {
    throw new Error('web-injection 경보 또는 패턴 파일 형식이 올바르지 않습니다.');
  }
  const patternNames = new Set(patternsDocument.patterns
    .map((pattern) => pattern?.name)
    .filter((name) => typeof name === 'string'));
  if (patternNames.size === 0) throw new Error('근거 패턴 이름을 찾을 수 없습니다.');

  const { decide } = decideAlert ? { decide: decideAlert } : await import('./decide.mjs');
  if (typeof decide !== 'function') throw new TypeError('경보 판정 함수가 올바르지 않습니다.');

  const manifest = await readRules(projectRoot);
  const knownEvidenceIds = new Set(manifest.rules.map((rule) => rule.evidenceAlertId));
  const assessedAlerts = [];
  for (const alert of fixture.alerts) {
    const evidenceAlertId = alert?.id;
    if (typeof evidenceAlertId !== 'string' || !ALERT_ID_PATTERN.test(evidenceAlertId)) {
      assessedAlerts.push({ alert, strongCandidate: false });
      continue;
    }
    if (knownEvidenceIds.has(evidenceAlertId)) {
      assessedAlerts.push({ alert, strongCandidate: false });
      continue;
    }
    const decision = await decide(alert);
    assessedAlerts.push({
      alert,
      decision,
      strongCandidate: isStrongBlockCandidate(alert, decision, patternNames),
    });
  }

  // IP 단위 차단은 같은 주소의 모든 시험 이벤트가 강한 차단 후보인 경우에만 허용합니다.
  // 정상·애매·미판정 이벤트가 하나라도 같은 주소에 있으면 해당 주소의 신규 규칙을 만들지 않습니다.
  const unsafeSourceAddresses = new Set();
  for (const item of assessedAlerts) {
    const sourceAddress = item.alert?.data?.srcip;
    if (typeof sourceAddress !== 'string' || isIP(sourceAddress) === 0) continue;
    if (!item.strongCandidate) unsafeSourceAddresses.add(sourceAddress);
  }

  const nextRules = [...manifest.rules];
  const addedRules = [];
  for (const item of assessedAlerts) {
    if (!item.strongCandidate) continue;
    const alert = item.alert;
    const evidenceAlertId = alert.id;
    const sourceAddress = alert.data.srcip;
    if (unsafeSourceAddresses.has(sourceAddress) || knownEvidenceIds.has(evidenceAlertId)) continue;
    const matchedNames = [...patternNames].filter((name) => matchesPattern(name, alert));
    const rule = {
      ruleId: `xdr_web_injection_${evidenceAlertId.replace(/[^A-Za-z0-9]/gu, '_')}`,
      action: 'deny',
      match: { sourceAddress },
      createdAt,
      expiresAt,
      evidenceAlertId,
      reason: `반복 공격 패턴: ${matchedNames.join(', ')}`,
    };
    if (!isSafeRule(rule)) throw new Error(`생성한 규칙 형식이 올바르지 않습니다: ${evidenceAlertId}`);
    nextRules.push(rule);
    addedRules.push(rule);
    knownEvidenceIds.add(evidenceAlertId);
  }

  const rulesPath = join(projectRoot, RULES_PATH);
  await mkdir(dirname(rulesPath), { recursive: true });
  await writeFile(rulesPath, `${JSON.stringify({
    schema: 'aleph.ztna.deny-rules.v1',
    generatedAt: createdAt,
    rules: nextRules,
  }, null, 2)}\n`, 'utf8');

  const notifiedRuleIds = await readNotifiedRuleIds(projectRoot);
  const webRulesPendingNotification = nextRules.filter((rule) =>
    rule.ruleId.startsWith('xdr_web_injection_') && !notifiedRuleIds.has(rule.ruleId));
  if (webRulesPendingNotification.length > 0) {
    const alertsPath = join(projectRoot, ALERTS_PATH);
    await mkdir(dirname(alertsPath), { recursive: true });
    const oldLog = await readOptionalText(alertsPath);
    const separator = oldLog && !oldLog.endsWith('\n') ? '\n' : '';
    const lines = webRulesPendingNotification.map((rule) => JSON.stringify({
      type: 'ztna_deny_rule_created',
      createdAt: rule.createdAt,
      ruleId: rule.ruleId,
      evidenceAlertId: rule.evidenceAlertId,
      expiresAt: rule.expiresAt,
    }));
    await appendFile(alertsPath, `${separator}${lines.join('\n')}\n`, 'utf8');
  }

  const activeRules = nextRules.filter((rule) => Date.parse(rule.expiresAt) > currentTime.getTime());
  return { addedRules, activeRules, notificationsAppended: webRulesPendingNotification.length };
}

/** 만료되지 않은 XDR 거부 규칙을 반환합니다. */
export async function getActiveXdrDenyRules({ root = PROJECT_ROOT, at = new Date() } = {}) {
  const currentTime = dateValue(at, '조회');
  const manifest = await readRules(resolve(root));
  return manifest.rules.filter((rule) => Date.parse(rule.expiresAt) > currentTime.getTime());
}

/** 호출자가 신뢰된 실행 계층에서 확인한 IP만 전달해야 합니다. */
export async function isDeniedByXdrSourceAddress(sourceAddress, options = {}) {
  if (typeof sourceAddress !== 'string' || isIP(sourceAddress) === 0) return false;
  const activeRules = await getActiveXdrDenyRules(options);
  return activeRules.some((rule) => rule.action === 'deny'
    && rule.match.sourceAddress === sourceAddress);
}

const isMain = process.argv[1]
  && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  try {
    const result = await syncWebInjectionDenyRules();
    process.stdout.write(`${JSON.stringify({
      addedRuleCount: result.addedRules.length,
      activeRuleCount: result.activeRules.length,
      notificationsAppended: result.notificationsAppended,
      evidenceAlertIds: result.addedRules.map((rule) => rule.evidenceAlertId),
      expiresAt: result.addedRules.map((rule) => rule.expiresAt),
    }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`웹 주입→ZTNA 연결 오류: ${error instanceof Error ? error.message : '실행 실패'}\n`);
    process.exitCode = 1;
  }
}

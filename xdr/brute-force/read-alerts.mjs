import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const FIXTURE_URL = new URL('../fixtures/brute-force.json', import.meta.url);
const REDACTED = '[비밀값 숨김]';
const SECRET_LIKE_PATTERNS = [
  /\b(?:password|passwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|authorization)\b\s*[:=]\s*\S+/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /(?:비밀번호|비밀키|토큰|접근키)\s*[:=]\s*\S+/,
];

function safeText(value) {
  if (typeof value !== 'string') return null;
  return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(value)) ? REDACTED : value;
}

/** 경보 묶음에서 허용된 다섯 항목만 추려 반환합니다. */
export async function readAlerts() {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'brute-force'
      || !Array.isArray(fixture.alerts)) {
    throw new Error('brute-force 경보 묶음 형식이 아닙니다.');
  }

  return fixture.alerts.map((alert) => ({
    timestamp: safeText(alert?.timestamp),
    sourceAddress: safeText(alert?.data?.srcip),
    account: safeText(alert?.data?.srcuser),
    ruleLevel: Number.isFinite(alert?.rule?.level) ? alert.rule.level : null,
    description: safeText(alert?.rule?.description),
  }));
}

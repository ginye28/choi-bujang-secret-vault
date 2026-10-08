import { readFile } from 'node:fs/promises';

const FIXTURE_URL = new URL('../fixtures/web-injection.json', import.meta.url);
const REDACTED = '[비밀값 숨김]';
const SECRET_LIKE_PATTERNS = [
  /\b(?:password|passwd|token|secret|api[_-]?key|access[_-]?key|private[_-]?key|authorization)\b\s*[:=]\s*["']?[^\s,"'}`]+/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /(?:비밀번호|비밀키|토큰|접근키)\s*[:=]\s*[^\s,"'}`]+/,
  /\b(?:sk_(?:live|test)_|gh[pousr]_|glpat-|AKIA)[A-Za-z0-9_-]{8,}\b/,
];

function safeText(value) {
  if (typeof value !== 'string') return null;
  return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(value)) ? REDACTED : value;
}

/** 웹 주입 경보에서 시각·출발 주소·계정·규칙 수준·설명만 추려 반환합니다. */
export async function readAlerts() {
  const fixture = JSON.parse(await readFile(FIXTURE_URL, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'web-injection'
      || !Array.isArray(fixture.alerts)) {
    throw new Error('web-injection 경보 묶음 형식이 아닙니다.');
  }

  const rows = fixture.alerts.map((alert) => ({
    timestamp: safeText(alert?.timestamp),
    sourceAddress: safeText(alert?.data?.srcip),
    account: safeText(alert?.data?.srcuser),
    ruleLevel: Number.isFinite(alert?.rule?.level) ? alert.rule.level : null,
    description: safeText(alert?.rule?.description),
  }));

  if (rows.length !== fixture.alerts.length) {
    throw new Error('경보 건수와 추출한 줄 수가 일치하지 않습니다.');
  }
  return rows;
}

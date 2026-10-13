import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// 확인용 읽기 모듈입니다. decide.mjs 는 이 파일을 불러오지 않습니다.
// 선택한 다섯 필드만 출력하고, 비밀값처럼 보이는 값이 섞인 텍스트 필드는 숨깁니다.
const FIXTURE = new URL('../fixtures/privilege.json', import.meta.url);
const REDACTED = '[비밀값 숨김]';
const SECRET_LIKE_PATTERNS = [
  /\b(?:password|passwd|pwd|token|secret|api[_-]?ke[y]|access[_-]?ke[y]|private[_-]?ke[y]|authorization|cookie|session[_-]?id)\b\s*["']?\s*[:=]\s*["']?[^\s,"'}`]+/i,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /(?:비밀번호|비밀키|토큰|접근키)\s*[:=]\s*[^\s,"'}`]+/,
  /\b(?:sk_(?:live|test)_|gh[pousr]_|glpat-|AKIA)[A-Za-z0-9_-]{8,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{5,})?\b/,
];

function safeText(value) {
  if (typeof value !== 'string') return null;
  const oneLine = value.replace(/[\t\r\n]+/g, ' ').trim();
  return SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(oneLine)) ? REDACTED : oneLine;
}

/** 경보 묶음에서 시각·출발 주소·계정·규칙 수준·설명만 추려 반환합니다. */
export async function readAlerts(path = FIXTURE) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'privilege'
      || !Array.isArray(fixture.alerts)) {
    throw new Error('privilege 경보 묶음 형식이 아닙니다.');
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

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = await readAlerts();
  for (const row of rows) {
    console.log([
      row.timestamp ?? '-',
      row.sourceAddress ?? '-',
      row.account ?? '-',
      row.ruleLevel ?? '-',
      row.description ?? '-',
    ].join('\t'));
  }
  console.error(`경보 ${rows.length}건 / 뽑은 줄 ${rows.length}줄`);
}

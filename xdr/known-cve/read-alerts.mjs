import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// 확인용 읽기 모듈입니다. decide.mjs 는 이 파일을 불러오지 않습니다.
// 시각·출발 주소·계정·규칙 수준·설명만 뽑고, 요청 본문이나 비밀값처럼 보이는 값은 내지 않습니다.
const FIXTURE = new URL('../fixtures/known-cve.json', import.meta.url);

export async function readAlerts(path = FIXTURE) {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1' || !Array.isArray(fixture.alerts)) {
    throw new Error('경보 묶음 형식이 아닙니다.');
  }
  return fixture.alerts.map((alert) => ({
    id: alert.id,
    time: alert.timestamp,
    source: alert.data?.srcip ?? null,
    account: alert.data?.srcuser ?? null,
    level: alert.rule?.level ?? null,
    description: alert.rule?.description ?? '',
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const rows = await readAlerts();
  for (const row of rows) {
    console.log([row.id, row.time, row.source, row.account ?? '-', row.level, row.description].join('\t'));
  }
  console.error(`경보 ${rows.length}건 / 뽑은 줄 ${rows.length}줄`);
}

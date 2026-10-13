import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { runAttackChecks } from '../src/attack-check.mjs';
import { buildCheckRecord, summarizeCheckRecord } from '../src/check-record.mjs';

// 12단계 제출 점검 기록 만들기: npm run checks:record
// npm run bundle 과 같은 점검(src/attack-check.mjs)을 실제 배포에 실행하고, 가린 결과를 docs/check-record.json 에 씁니다.
// 이 파일을 커밋하면 작전실 화면과 GET /api/checks 가 같은 기록에서 수치를 셉니다.
const root = resolve(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(root, 'aleph.config.json'), 'utf8'));
const attempts = await runAttackChecks(config);
const record = buildCheckRecord(attempts);
writeFileSync(join(root, 'docs', 'check-record.json'), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
const { counts } = summarizeCheckRecord(record);
process.stdout.write(`제출 점검 기록 작성: 점검 ${counts.total}건 · 막음 ${counts.blocked} · 뚫림 ${counts.breached} · 미실행 ${counts.notRun}\n`);

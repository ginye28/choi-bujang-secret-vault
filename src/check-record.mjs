import { readFileSync } from 'node:fs';
import { classifyAttempt } from './attack-check.mjs';

// 12단계 제출 점검 기록: `npm run checks:record` 가 src/attack-check.mjs 를 실제 배포에 실행한 결과를
// docs/check-record.json 에 남깁니다. 기록에는 점검 이름·기대 결과·관측 값(HTTP 상태, method)만 있고
// 요청 주소·응답 본문·토큰은 없습니다(가린 기록).
// 작전실 화면과 /api/checks 의 수치는 이 기록의 각 점검을 classifyAttempt 로 나눠 센 값뿐입니다.
// 기록에 없는 점검을 만들거나 빼기로 미실행을 채우지 않습니다.
export const CHECK_RECORD_SCHEMA = 'aleph.check.record.v1';
export const JUDGE_SUITE_TOTAL = 41;
const ID = /^[a-z0-9][a-z0-9_.-]{0,79}$/iu;

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max).replace(/[\u0000-\u001f\u007f]/gu, ' ') : '');

// 화면 수치의 근거가 되는 기록을 읽습니다.
// 1) 같은 폴더에서 방금 만든 제출 묶음(artifacts/submission.json, npm run bundle 결과)이 있으면 그 점검 결과를,
// 2) 없으면(배포 환경 등) 커밋된 docs/check-record.json 을 씁니다. 둘 다 없으면 빈 기록입니다.
// 경로는 배포 함수 묶음에 파일이 함께 실리도록 문자열 그대로 둡니다.
export function loadCheckRecord({
  bundleUrl = new URL('../artifacts/submission.json', import.meta.url),
  recordUrl = new URL('../docs/check-record.json', import.meta.url),
} = {}) {
  try {
    const bundle = JSON.parse(readFileSync(bundleUrl, 'utf8'));
    if (bundle?.schema === 'aleph.defense.submission.v2' && Array.isArray(bundle.attackAttempts)) {
      const checkedAt = typeof bundle.checkedAt === 'string' && !Number.isNaN(Date.parse(bundle.checkedAt)) ? new Date(bundle.checkedAt) : null;
      return { ...buildCheckRecord(bundle.attackAttempts, { checkedAt }), source: 'artifacts/submission.json' };
    }
  } catch {
    // 제출 묶음이 없으면 커밋된 기록을 봅니다.
  }
  try {
    return { ...JSON.parse(readFileSync(recordUrl, 'utf8')), source: 'docs/check-record.json' };
  } catch {
    return null;
  }
}

export function buildCheckRecord(attempts, { checkedAt = new Date() } = {}) {
  return {
    schema: CHECK_RECORD_SCHEMA,
    checkedAt: checkedAt ? checkedAt.toISOString() : null,
    note: 'npm run checks:record 로 실제 배포에 보낸 읽기 요청의 관측 값입니다. 심판의 41종 시험 결과가 아닙니다.',
    attempts: attempts.map(({ attackId, stage, expected, observed }) => ({
      attackId, stage, expected, observed, result: classifyAttempt({ attackId, observed }),
    })),
  };
}

export function summarizeCheckRecord(record) {
  const attempts = record?.schema === CHECK_RECORD_SCHEMA && Array.isArray(record.attempts) ? record.attempts : [];
  const rows = attempts
    .filter((item) => typeof item?.attackId === 'string' && ID.test(item.attackId))
    .slice(0, 20)
    .map((item) => ({
      attackId: item.attackId,
      stage: Number.isInteger(item.stage) ? item.stage : null,
      expected: text(item.expected, 300),
      observed: text(item.observed, 300),
      result: classifyAttempt(item),
    }));
  const counts = { total: rows.length, blocked: 0, breached: 0, notRun: 0 };
  for (const row of rows) {
    if (row.result === 'blocked') counts.blocked += 1;
    else if (row.result === 'breached') counts.breached += 1;
    else counts.notRun += 1;
  }
  return {
    available: rows.length > 0,
    checkedAt: rows.length > 0 ? text(record.checkedAt, 40) || null : null,
    source: rows.length > 0 ? text(record.source, 40) || null : null,
    counts,
    rows,
    // 심판의 41종 시험 결과는 이 기록에 없습니다. 막음·통과로 세지 않고 미실행으로만 둡니다.
    judgeSuite: { total: JUDGE_SUITE_TOTAL, recorded: 0, status: '미실행' },
  };
}

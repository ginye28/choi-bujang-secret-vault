import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diffPolicy, restorePolicy } from '../src/policy.mjs';

// 침해 전에 검증한 안전 정책 사본(policy/safe-policy.json)과 현재 시험 정책(policy/test-policy.json)을
// 다룹니다. 실제 운영 정책(src/decider.mjs)은 읽지도 바꾸지도 않습니다.
//   node scripts/policy-restore.mjs diff                 차이만 보여 줍니다(아무것도 바꾸지 않음).
//   node scripts/policy-restore.mjs restore --confirm    차이를 확인한 뒤 시험 정책을 되돌립니다.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COPY_PATH = join(root, 'policy', 'safe-policy.json');
const TEST_PATH = join(root, 'policy', 'test-policy.json');

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    return { schema: 'invalid' };
  }
}

function show(plan) {
  console.log(`복원할 버전: ${plan.version} (sha256 ${plan.sha256.slice(0, 16)}…)`);
  if (plan.changes.length === 0) console.log('바뀔 항목: 없음(시험 정책이 이미 안전 정책과 같습니다)');
  for (const change of plan.changes) console.log(`  - ${change.path}: ${change.from} → ${change.to}`);
  console.log(`보존할 항목: ${plan.preserved.join(', ') || '없음'}`);
}

const [, , command, flag] = process.argv;
const copy = await readJson(COPY_PATH);
const testPolicy = await readJson(TEST_PATH);

if (command === 'diff') {
  const plan = diffPolicy(copy, testPolicy);
  if (!plan.ok) {
    console.error(`중단: 사본을 확인할 수 없습니다 (${plan.reason}). 아무것도 바꾸지 않았습니다.`);
    process.exitCode = 1;
  } else {
    show(plan);
  }
} else if (command === 'restore') {
  const result = restorePolicy(copy, testPolicy, { confirm: flag === '--confirm' });
  if (!result.ok && result.reason !== 'CONFIRMATION_REQUIRED') {
    console.error(`중단: 사본을 확인할 수 없습니다 (${result.reason}). 아무것도 바꾸지 않았습니다.`);
    process.exitCode = 1;
  } else if (!result.restored) {
    show(result);
    console.log('실행하지 않았습니다. 위 내용을 확인한 뒤 --confirm 을 붙여 다시 실행하세요.');
  } else {
    await writeFile(TEST_PATH, `${JSON.stringify(result.testPolicy, null, 2)}\n`, 'utf8');
    show(result);
    console.log('시험 정책을 되돌렸고 감사 이력에 한 줄을 더했습니다.');
  }
} else {
  console.error('사용법: node scripts/policy-restore.mjs diff | restore [--confirm]');
  process.exitCode = 1;
}

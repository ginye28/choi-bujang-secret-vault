import { readFile } from 'node:fs/promises';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncDenyRules } from '../respond-core.mjs';
import { decide } from './decide.mjs';

const PROJECT_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const MIN_BLOCK_CONFIDENCE = 0.9;
const PRIVILEGE_PATTERNS = new Set([
  '관리자 그룹 추가',
  '처음 보는 관리자 명령',
  '업무 시간 밖 권한 사용',
]);
const PRIVILEGE_TECHNIQUES = new Set(['T1068', 'T1078']);

function isStrongCandidate(alert, decision) {
  return decision?.action === 'block'
    && Number.isFinite(decision.confidence)
    && decision.confidence >= MIN_BLOCK_CONFIDENCE
    && PRIVILEGE_PATTERNS.has(decision.reason)
    && Number.isFinite(alert?.rule?.level)
    && alert.rule.level >= 10
    && Array.isArray(alert?.rule?.mitre)
    && alert.rule.mitre.some((technique) => PRIVILEGE_TECHNIQUES.has(technique))
    && typeof alert?.data?.srcip === 'string'
    && isIP(alert.data.srcip) !== 0;
}

async function prepareDecisions(root) {
  const fixture = JSON.parse(await readFile(resolve(root, 'xdr', 'fixtures', 'privilege.json'), 'utf8'));
  if (fixture?.schema !== 'aleph.xdr.fixture.v1'
      || fixture.moduleKey !== 'privilege'
      || !Array.isArray(fixture.alerts)) {
    throw new Error('privilege 경보 묶음 형식이 올바르지 않습니다.');
  }

  const decisions = new Map();
  const unsafeSources = new Set();
  const seenIds = new Set();
  for (const alert of fixture.alerts) {
    const id = alert?.id;
    if (typeof id !== 'string' || id.length === 0 || seenIds.has(id)) {
      throw new Error('privilege 경보 번호가 없거나 중복되었습니다.');
    }
    seenIds.add(id);
    const decision = await decide(alert);
    decisions.set(id, decision);
    const source = alert?.data?.srcip;
    // IP 하나를 거부하면 그 주소의 정상·애매한 요청도 막힐 수 있으므로,
    // 같은 주소의 경보가 하나라도 확정 차단 후보가 아니면 그 주소 전체를 제외합니다.
    if (typeof source === 'string' && isIP(source) !== 0 && !isStrongCandidate(alert, decision)) {
      unsafeSources.add(source);
    }
  }

  return { fixture, decisions, unsafeSources };
}

// decide.mjs 는 판단만 합니다. 여기서만 엄격한 기준을 적용해 확정 후보를
// 별도 ZTNA 거부 규칙(xdr/ztna-deny-rules.json)으로 보내고, 알림은
// xdr/alerts.log 에 한 줄씩 누적합니다. src/decider.mjs 는 수정하지 않습니다.
export async function respond(options = {}) {
  const root = resolve(options.root ?? PROJECT_ROOT);
  const { decisions, unsafeSources } = await prepareDecisions(root);
  const decideForResponse = (alert) => {
    const decision = decisions.get(alert?.id) ?? decide(alert);
    const source = alert?.data?.srcip;
    if (decision?.action === 'block'
        && (!isStrongCandidate(alert, decision) || unsafeSources.has(source))) {
      return { ...decision, action: 'alert' };
    }
    return decision;
  };
  return syncDenyRules({ ...options, root, moduleKey: 'privilege', decide: decideForResponse });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const out = await respond();
    console.log(JSON.stringify({
      counts: out.counts, addedRules: out.addedRules.length, notifications: out.notificationsAppended,
    }));
  } catch (error) {
    console.error(`권한 가로채기→ZTNA 연결 오류: ${error instanceof Error ? error.message : '실행 실패'}`);
    process.exitCode = 1;
  }
}

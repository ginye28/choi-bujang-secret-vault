// 보호 자원: 모든 읽기·쓰기는 (1) 차단 여부 (2) 활성 정책 순서로 판정합니다.
// 소유자는 요청 본문이 아니라 로그인 토큰에서 온 ctx.actor.userId 로만 정합니다.
//
// 저장: resources/<zone>/<id> → { owner, zone, data, createdAt, runId }
import { randomUUID } from 'node:crypto';
import { ProductError } from '../platform/errors.mjs';
import { canonicalJson, utf8Length } from '../../vendor/defense-product-contracts/index.mjs';
import { CONFIG } from './config.mjs';
import { badInput, isoAt, isPlainObject } from './shared.mjs';
import { activeVersion, decide } from './policy.mjs';

const SEGMENT = /^[A-Za-z0-9_.:-]{1,64}$/u;
const error = (status, code, detail = '') => ({ status, body: { error: { code, detail } } });

function checkSegment(value, name) {
  if (typeof value !== 'string' || !SEGMENT.test(value)) throw badInput('resource_invalid', name);
}

// 차단 상태를 확인하지 못하면 열어 주지 않습니다(집행 서비스 장애 = 닫힘).
async function isBlocked(ctx) {
  try {
    return await ctx.executor.isBlocked(`subject:${ctx.actor.userId}`);
  } catch {
    throw new ProductError(503, 'executor_unavailable', '차단 상태를 확인하지 못해 요청을 처리하지 않았습니다.');
  }
}

function judged(version, result) {
  return { ...result, revision: version?.revision ?? 0, digest: version?.digest ?? null };
}

// 판정 결과를 응답으로 바꿉니다. 허용이면 null 을 돌려 호출한 쪽이 이어서 처리합니다.
function refusal(decision) {
  if (decision.decision === 'allow') return null;
  if (decision.decision === 'step_up') return { ...error(401, 'step_up_required', '추가 확인이 필요합니다.'), decision };
  return { ...error(403, 'policy_denied', '정책이 이 요청을 허용하지 않습니다.'), decision };
}

/** → { status, body, decision } */
export async function readResource(ctx, { zone, id }) {
  checkSegment(zone, 'zone');
  checkSegment(id, 'id');
  const version = await activeVersion(ctx.store);
  if (await isBlocked(ctx)) {
    return { ...error(403, 'blocked', '차단된 사용자입니다.'), decision: judged(version, { decision: 'deny', ruleIds: ['blocked'], reasonCode: 'blocked' }) };
  }
  const row = await ctx.store.get('resources', `${zone}/${id}`);
  // 없는 자원은 소유자를 모르므로 'other' 로 판정합니다. 허용될 때만 404 를 알려 존재 여부를 흘리지 않습니다.
  const owner = row && row.owner === ctx.actor.userId ? 'self' : 'other';
  const decision = judged(version, decide({ method: 'GET', zone, owner, role: ctx.actor.role }, version?.snapshot ?? null));
  const refused = refusal(decision);
  if (refused) return refused;
  if (!row) return { ...error(404, 'not_found', '없는 자원입니다.'), decision };
  return { status: 200, body: { id, zone, data: row.data }, decision };
}

/** → 허용이면 201 { id }. 소유자는 ctx.actor.userId 입니다. */
export async function writeResource(ctx, { zone, body }) {
  checkSegment(zone, 'zone');
  if (!isPlainObject(body)) throw badInput('body_invalid', 'object required');
  const version = await activeVersion(ctx.store);
  if (await isBlocked(ctx)) {
    return { ...error(403, 'blocked', '차단된 사용자입니다.'), decision: judged(version, { decision: 'deny', ruleIds: ['blocked'], reasonCode: 'blocked' }) };
  }
  const decision = judged(version, decide({ method: 'POST', zone, owner: 'self', role: ctx.actor.role }, version?.snapshot ?? null));
  const refused = refusal(decision);
  if (refused) return refused;
  const data = body.data === undefined ? null : body.data;
  try {
    if (utf8Length(canonicalJson(data)) > CONFIG.limits.resourceBytes) throw new Error('too large');
  } catch {
    throw badInput('data_invalid', 'data');
  }
  const id = randomUUID();
  await ctx.store.put('resources', `${zone}/${id}`, { owner: ctx.actor.userId, zone, data, createdAt: isoAt(ctx.clock()), runId: ctx.runId ?? null });
  return { status: 201, body: { id }, decision };
}

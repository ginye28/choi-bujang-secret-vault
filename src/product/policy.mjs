// D1 정책: 규칙 목록을 검사해 활성화하고, 바꾼 기록을 남기고, 예전 판으로 되돌립니다.
//
// 저장 모양(모음: 값)
//   policy_meta/current          { revision }                     지금 판 번호(없으면 0). 경합 검사는 이 한 행으로 합니다.
//   policy_versions/<10자리 판>  { revision, digest, snapshot, activatedAt, activatedBy, source }  지난 판도 모두 보존
//   policy_drafts/<draftId>      { snapshot, digest, createdBy, createdAt }
import { randomUUID } from 'node:crypto';
import { conflict, notFound, unprocessable } from '../platform/errors.mjs';
import { POLICY_LIMITS, canonicalJson, policyDigest, utf8Length, validatePolicySnapshot } from '../../vendor/defense-product-contracts/index.mjs';
import { CONFIG } from './config.mjs';
import { appendAudit, badInput, isPlainObject, isoAt, requireOperator } from './shared.mjs';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
const OWNERS = ['self', 'other', 'any'];
const ROLES = ['member', 'operator'];
const MATCH_KEYS = ['method', 'zone', 'owner', 'role'];
const ZONE = /^[A-Za-z0-9_.:-]{1,64}$/u;
const STRICT = { deny: 3, step_up: 2, allow: 1 };
const pad = revision => String(revision).padStart(10, '0');

// ── 규칙 판정(순수 함수) ─────────────────────────────────────────────────────

function ruleMatches(rule, request) {
  if (rule.match === undefined) return true;
  if (!isPlainObject(rule.match)) return false; // 모양이 이상한 규칙은 맞는 것으로 치지 않습니다.
  const m = rule.match;
  if (m.zone !== undefined && m.zone !== '*' && m.zone !== request.zone) return false;
  if (m.method !== undefined && m.method !== request.method) return false;
  if (m.owner !== undefined && m.owner !== 'any' && m.owner !== request.owner) return false;
  if (m.role !== undefined && m.role !== request.role) return false;
  return true;
}

const priorityOf = rule => (Number.isFinite(rule.priority) ? rule.priority : 0);

/** 순수 함수. request: { method, zone, owner: 'self'|'other', role } → { decision, ruleIds, reasonCode }
 *  맞는 규칙 가운데 priority 가 가장 큰 것, 같으면 deny > step_up > allow. 맞는 규칙이 없거나 정책이 없으면 deny. */
export function decide(request, policy) {
  const rules = Array.isArray(policy?.rules) ? policy.rules : [];
  const fits = rules.filter(rule => rule !== null && typeof rule === 'object' && ruleMatches(rule, request ?? {}));
  if (fits.length === 0) return { decision: 'deny', ruleIds: [], reasonCode: 'no_rule' };
  const top = Math.max(...fits.map(priorityOf));
  const winner = fits.filter(rule => priorityOf(rule) === top)
    .reduce((best, rule) => ((STRICT[rule.effect] ?? 0) > (STRICT[best.effect] ?? 0) ? rule : best));
  return { decision: winner.effect, ruleIds: [winner.id], reasonCode: `rule_${winner.effect}` };
}

// ── 규칙 어휘 검사 ───────────────────────────────────────────────────────────
// 공개 계약(validatePolicySnapshot)은 id·effect 만 봅니다. match·priority 는 우리 어휘로 한 번 더 확인합니다.
// 몰래 넓게 맞는 규칙(알 수 없는 항목, 이상한 값)이 정책에 들어오지 못하게 막습니다.
function checkVocabulary(rules) {
  const bad = detail => unprocessable('policy_rules', detail);
  rules.forEach((rule, i) => {
    const at = `rules[${i}]`;
    if (rule.priority !== undefined && (!Number.isSafeInteger(rule.priority) || Math.abs(rule.priority) > 1_000_000_000)) throw bad(`${at}.priority`);
    if (rule.match === undefined) return;
    if (!isPlainObject(rule.match)) throw bad(`${at}.match`);
    for (const key of Object.keys(rule.match)) if (!MATCH_KEYS.includes(key)) throw bad(`${at}.match.${key}`);
    const m = rule.match;
    if (m.method !== undefined && !METHODS.includes(m.method)) throw bad(`${at}.match.method`);
    if (m.owner !== undefined && !OWNERS.includes(m.owner)) throw bad(`${at}.match.owner`);
    if (m.role !== undefined && !ROLES.includes(m.role)) throw bad(`${at}.match.role`);
    if (m.zone !== undefined && m.zone !== '*' && !(typeof m.zone === 'string' && ZONE.test(m.zone))) throw bad(`${at}.match.zone`);
  });
}

/** 정책 스냅샷 전체 검사. 공개 계약 + 프로젝트 확인 + 규칙 어휘 + 크기. 실패하면 422. */
export function checkSnapshot(snapshot, projectId) {
  try {
    validatePolicySnapshot(snapshot);
  } catch (error) {
    throw unprocessable(error.code ?? 'policy_shape', error.detail ?? '');
  }
  if (snapshot.projectId !== projectId) throw unprocessable('policy_project', 'projectId');
  checkVocabulary(snapshot.rules);
  if (utf8Length(canonicalJson(snapshot)) > CONFIG.limits.policyBytes) throw unprocessable('policy_too_large', 'policy');
}

// ── 저장소 읽기 ──────────────────────────────────────────────────────────────

export async function currentRevision(reader) {
  return (await reader.get('policy_meta', 'current'))?.revision ?? 0;
}

/** 지금 활성인 판(없으면 null). 한 번에 한 행만 읽어 요청을 받은 순간의 판으로 판정합니다. */
export async function activeVersion(reader) {
  const revision = await currentRevision(reader);
  return revision === 0 ? null : reader.get('policy_versions', pad(revision));
}

/** 트랜잭션 안에서 새 판을 만듭니다. expectedRevision 이 주어지면 지금 판과 같아야 합니다(아니면 409). */
export async function installPolicy(tx, ctx, snapshot, source, expectedRevision) {
  const revision = await currentRevision(tx);
  if (expectedRevision !== undefined && revision !== expectedRevision) {
    throw conflict('revision_conflict', `지금 판 번호는 ${revision} 입니다.`);
  }
  const next = revision + 1;
  if (next > POLICY_LIMITS.maxRevision) throw unprocessable('policy_revision', 'revision limit');
  const stored = { ...snapshot, revision: next, projectId: ctx.projectId };
  const digest = policyDigest(stored);
  await tx.put('policy_versions', pad(next), { revision: next, digest, snapshot: stored, activatedAt: isoAt(ctx.clock()), activatedBy: ctx.actor.userId, source });
  await tx.put('policy_meta', 'current', { revision: next });
  await appendAudit(tx, ctx, `policy.${source}`, { revision: next, digest });
  return { revision: next, digest };
}

// ── 공개 함수 ────────────────────────────────────────────────────────────────

/** 로그인 사용자 누구나. → { active: 정책 스냅샷 또는 null, digest: 문자열 또는 null } */
export async function getPolicy(ctx) {
  const version = await activeVersion(ctx.store);
  return { active: version?.snapshot ?? null, digest: version?.digest ?? null };
}

/** operator 만. 최신 판부터. */
export async function policyHistory(ctx, { limit } = {}) {
  requireOperator(ctx);
  const take = Number.isInteger(limit) && limit >= 1 ? Math.min(limit, CONFIG.limits.historyLimitMax) : 50;
  const rows = await ctx.store.list('policy_versions');
  return {
    items: rows.map(r => r.value).sort((a, b) => b.revision - a.revision).slice(0, take)
      .map(({ revision, digest, activatedAt, activatedBy, source }) => ({ revision, digest, activatedAt, activatedBy, source })),
  };
}

/** operator 만. body { snapshot } → 201 { draftId, digest } */
export async function createDraft(ctx, body) {
  requireOperator(ctx);
  if (!isPlainObject(body)) throw badInput('body_invalid', 'object required');
  checkSnapshot(body.snapshot, ctx.projectId);
  const draftId = randomUUID();
  const digest = policyDigest(body.snapshot);
  await ctx.store.put('policy_drafts', draftId, { snapshot: body.snapshot, digest, createdBy: ctx.actor.userId, createdAt: isoAt(ctx.clock()) });
  return { draftId, digest };
}

function expectedRevisionOf(body) {
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) throw badInput('expected_revision_invalid', 'expectedRevision');
  return body.expectedRevision;
}

/** operator 만. body { draftId, expectedRevision } → { revision, digest } */
export async function activatePolicy(ctx, body) {
  requireOperator(ctx);
  if (!isPlainObject(body)) throw badInput('body_invalid', 'object required');
  if (typeof body.draftId !== 'string' || body.draftId === '') throw badInput('draft_id_invalid', 'draftId');
  const expected = expectedRevisionOf(body);
  return ctx.store.transaction(async tx => {
    const draft = await tx.get('policy_drafts', body.draftId);
    if (!draft) throw notFound('draft_not_found', body.draftId);
    return installPolicy(tx, ctx, draft.snapshot, 'edit', expected);
  });
}

/** operator 만. body { toRevision, expectedRevision } → 예전 판의 규칙을 새 판 번호로 다시 활성화합니다. */
export async function rollbackPolicy(ctx, body) {
  requireOperator(ctx);
  if (!isPlainObject(body)) throw badInput('body_invalid', 'object required');
  if (!Number.isSafeInteger(body.toRevision) || body.toRevision < 1) throw badInput('to_revision_invalid', 'toRevision');
  const expected = expectedRevisionOf(body);
  return ctx.store.transaction(async tx => {
    const target = await tx.get('policy_versions', pad(body.toRevision));
    if (!target) throw notFound('revision_not_found', String(body.toRevision));
    return installPolicy(tx, ctx, target.snapshot, 'rollback', expected);
  });
}

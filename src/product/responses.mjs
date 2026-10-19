// D3 대응: 제안 → 사람이 승인 → 딱 한 번 집행 → (필요하면) 해제.
//
// 작업 한 건(operations/<operationKey>)의 상태 변화는 이 파일 한 곳에서만 일어납니다.
//   approval  waiting → approved | rejected | expired
//   state     pending → succeeded | failed | (보류는 pending 으로 남음) → released | rejected | expired
//
// 한 번만 집행하는 방법: 승인할 때 트랜잭션 안에서 "집행 중(executing)" 표시를 먼저 가져간 요청 하나만 집행기를 부릅니다.
// 나머지 요청은 집행하지 않고, 진행 중이면 끝나기를 기다렸다가 결과만 돌려줍니다.
import { ProductError, conflict, notFound } from '../platform/errors.mjs';
import { compareOperation, isOperationKey, operationFingerprint, retryDecision } from '../../vendor/defense-product-contracts/index.mjs';
import { CONFIG } from './config.mjs';
import { appendAudit, badInput, isPlainObject, isoAt, requireOperator } from './shared.mjs';

const ACTION_TARGET = { block_subject: 'subject', block_device: 'device' };
const TARGET = /^(subject|device):[A-Za-z0-9._:-]{1,200}$/u;

const view = op => ({
  operationKey: op.operationKey, state: op.state, approval: op.approval, attempts: op.attempts ?? 0,
  executedAt: op.executedAt ?? null, releasedAt: op.releasedAt ?? null,
});

function checkKey(key) {
  if (!isOperationKey(key)) throw badInput('operation_key_invalid', 'operationKey');
  return key;
}

async function loadOperation(store, key) {
  const op = await store.get('operations', key);
  if (!op) throw notFound('operation_not_found', key);
  return op;
}

// ── 같은 서버 안에서 진행 중인 집행 ──────────────────────────────────────────
const running = new WeakMap(); // store → Map(operationKey → Promise)
const runningFor = store => { if (!running.has(store)) running.set(store, new Map()); return running.get(store); };

// ── 집행기 호출 결과 읽기 ────────────────────────────────────────────────────
function outcomeOf(error) {
  if (error?.name === 'ExecutorError') {
    const status = Number.isInteger(error.status) ? error.status : null;
    let retryAfterMs = Number.isFinite(error.retryAfterMs) && error.retryAfterMs >= 0 ? error.retryAfterMs : null;
    if (retryAfterMs !== null) retryAfterMs = Math.min(retryAfterMs, 60_000);
    return { status, uncertain: Boolean(error.uncertain) || status === null, retryAfterMs };
  }
  return { status: null, uncertain: true, retryAfterMs: null }; // 알 수 없는 실패는 집행됐을 수도 있다고 봅니다.
}

/** 집행기 호출 하나를 계약의 재시도 규칙대로 되풀이합니다.
 *  send() 가 던지지 않으면 성공. 응답을 못 받았으면(uncertain) 다시 보내기 전에 confirmed() 로 이미 처리됐는지 확인합니다.
 *  → { outcome: 'done'|'give_up'|'hold', sent: 보낸 횟수 } */
async function runWithRetry(ctx, send, confirmed) {
  const startedAt = ctx.clock();
  let sent = 0;
  for (;;) {
    sent += 1;
    let result = { status: 200, uncertain: false, retryAfterMs: null };
    try {
      await send();
    } catch (error) {
      result = outcomeOf(error);
    }
    if (result.status === 200 && !result.uncertain) return { outcome: 'done', sent };
    if (result.uncertain) {
      let already;
      try {
        already = await confirmed();
      } catch {
        return { outcome: 'hold', sent }; // 확인하지 못한 상태는 성공으로 바꾸지 않습니다.
      }
      if (already) return { outcome: 'done', sent };
    }
    const decision = retryDecision({
      status: result.status, uncertain: result.uncertain, attempt: sent,
      elapsedMs: Math.max(0, ctx.clock() - startedAt), budgetMs: CONFIG.retryBudgetMs, retryAfterMs: result.retryAfterMs,
    });
    if (!decision.retry) return { outcome: decision.outcome, sent };
    await ctx.sleep(decision.delayMs);
  }
}

// ── 제안 ─────────────────────────────────────────────────────────────────────

/** operator 만. 새 작업 201, 같은 키·같은 내용 200(처음 작업의 지금 상태), 같은 키·다른 내용 409. */
export async function createResponse(ctx, body) {
  requireOperator(ctx);
  if (!isPlainObject(body)) throw badInput('body_invalid', 'object required');
  const { operationKey, incidentId, target, action } = body;
  const payload = body.payload === undefined ? null : body.payload;
  checkKey(operationKey);
  if (typeof incidentId !== 'string' || incidentId === '') throw badInput('incident_id_invalid', 'incidentId');
  if (typeof target !== 'string' || !TARGET.test(target)) throw badInput('target_invalid', 'target');
  if (!Object.hasOwn(ACTION_TARGET, action) || !target.startsWith(`${ACTION_TARGET[action]}:`)) throw badInput('action_invalid', 'action');
  let fingerprint;
  try {
    fingerprint = operationFingerprint({ projectId: ctx.projectId, target, action, payload });
  } catch {
    throw badInput('payload_invalid', 'payload');
  }
  return ctx.store.transaction(async tx => {
    const existing = await tx.get('operations', operationKey);
    if (existing) {
      const same = compareOperation({ key: existing.operationKey, fingerprint: existing.fingerprint }, { key: operationKey, fingerprint }) === 'same'
        && existing.incidentId === incidentId;
      if (!same) throw conflict('operation_conflict', '같은 작업 키에 다른 내용이 왔습니다.');
      return { status: 200, body: view(existing) };
    }
    if (!await tx.get('incidents', incidentId)) throw notFound('incident_not_found', incidentId);
    const now = ctx.clock();
    const op = {
      operationKey, fingerprint, incidentId, target, action, payload,
      state: 'pending', approval: 'waiting', attempts: 0,
      createdAt: isoAt(now), createdMs: now, createdBy: ctx.actor.userId,
      executedAt: null, releasedAt: null, executing: null, runId: ctx.runId ?? null,
    };
    await tx.put('operations', operationKey, op);
    await appendAudit(tx, ctx, 'response.create', { operationKey, target, action });
    return { status: 201, body: { operationKey, state: 'pending', approval: 'waiting' } };
  });
}

// ── 승인과 집행 ──────────────────────────────────────────────────────────────

/** operator 만. 승인한 뒤에만 집행하고, 한 작업은 딱 한 번만 실제로 집행합니다. */
export async function approveResponse(ctx, key) {
  requireOperator(ctx);
  checkKey(key);
  const claim = await ctx.store.transaction(async tx => {
    const op = await loadOperation(tx, key);
    const now = ctx.clock();
    if (op.approval === 'rejected') throw conflict('operation_rejected', '거절된 제안은 승인할 수 없습니다.');
    if (op.approval === 'expired') throw conflict('approval_expired', '승인 기한이 지난 제안입니다.');
    if (op.approval === 'waiting') {
      if (CONFIG.approvalTtlMs !== null && now - op.createdMs > CONFIG.approvalTtlMs) {
        await tx.put('operations', key, { ...op, approval: 'expired', state: 'expired' });
        await appendAudit(tx, ctx, 'response.expire', { operationKey: key });
        return { expired: true };
      }
      await tx.put('operations', key, { ...op, approval: 'approved', state: 'pending', approvedAt: isoAt(now), approvedBy: ctx.actor.userId, executing: now });
      await appendAudit(tx, ctx, 'response.approve', { operationKey: key });
      return { claimed: true, resume: false };
    }
    // 이미 승인됨. 보류(pending)이고 집행 중인 요청이 없을 때만 이어서 집행합니다.
    const leaseActive = op.executing !== null && op.executing !== undefined && now - op.executing < CONFIG.leaseMs;
    if (op.approval === 'approved' && op.state === 'pending' && !leaseActive) {
      await tx.put('operations', key, { ...op, executing: now });
      return { claimed: true, resume: true };
    }
    return { claimed: false };
  });
  if (claim.expired) throw conflict('approval_expired', '승인 기한이 지난 제안입니다.');

  const inflight = runningFor(ctx.store);
  if (!claim.claimed) {
    // 다른 요청이 집행 중이면 끝나기를 기다렸다가 결과만 돌려줍니다. 집행은 하지 않습니다.
    const pending = inflight.get(key);
    if (pending) await pending.catch(() => {});
    return approvalView(await loadOperation(ctx.store, key));
  }
  const job = execute(ctx, key, claim.resume);
  inflight.set(key, job);
  try {
    return approvalView(await job);
  } finally {
    inflight.delete(key);
  }
}

const approvalView = op => ({ operationKey: op.operationKey, state: op.state, approval: op.approval, attempts: op.attempts ?? 0 });

async function execute(ctx, key, resume) {
  const op = await loadOperation(ctx.store, key);
  let result;
  try {
    // 이어서 집행하는 경우는 이미 집행됐을 수 있으니 상태부터 확인합니다.
    const alreadyApplied = resume ? await ctx.executor.status(key).then(s => s === 'applied' || s === 'released', () => null) : false;
    if (alreadyApplied === null) result = { outcome: 'hold', sent: 0 };
    else if (alreadyApplied) result = { outcome: 'done', sent: 0 };
    else {
      result = await runWithRetry(
        ctx,
        () => ctx.executor.apply({ operationKey: key, target: op.target, action: op.action }),
        async () => (await ctx.executor.status(key)) !== 'unknown',
      );
    }
  } catch (error) {
    await ctx.store.transaction(async tx => { // 예상 못 한 오류: 집행 중 표시만 풀고 다시 던집니다.
      const cur = await tx.get('operations', key);
      if (cur) await tx.put('operations', key, { ...cur, executing: null });
    });
    throw error;
  }
  const state = { done: 'succeeded', give_up: 'failed', hold: 'pending' }[result.outcome];
  return ctx.store.transaction(async tx => {
    const cur = await loadOperation(tx, key);
    const next = { ...cur, state, attempts: (cur.attempts ?? 0) + result.sent, executing: null, executedAt: state === 'succeeded' ? isoAt(ctx.clock()) : cur.executedAt };
    await tx.put('operations', key, next);
    await appendAudit(tx, ctx, `response.${state === 'pending' ? 'hold' : state}`, { operationKey: key, attempts: next.attempts });
    return next;
  });
}

/** operator 만. 승인 전 작업만 거절할 수 있습니다(이미 승인됐으면 409). */
export async function rejectResponse(ctx, key) {
  requireOperator(ctx);
  checkKey(key);
  return ctx.store.transaction(async tx => {
    const op = await loadOperation(tx, key);
    if (op.approval === 'approved') throw conflict('operation_approved', '이미 승인된 제안은 거절할 수 없습니다.');
    if (op.approval === 'expired') throw conflict('approval_expired', '승인 기한이 지난 제안입니다.');
    if (op.approval === 'waiting') {
      const next = { ...op, approval: 'rejected', state: 'rejected' };
      await tx.put('operations', key, next);
      await appendAudit(tx, ctx, 'response.reject', { operationKey: key });
      return approvalView(next);
    }
    return approvalView(op); // 이미 거절됨: 같은 결과
  });
}

/** operator 만. 집행된 차단을 풉니다. 풀렸는지 집행기에서 확인한 뒤에만 '해제됨'으로 기록합니다. */
export async function releaseResponse(ctx, key) {
  requireOperator(ctx);
  checkKey(key);
  const op = await loadOperation(ctx.store, key);
  if (op.state === 'released') return { operationKey: key, state: 'released' };
  if (op.state !== 'succeeded') throw conflict('not_executed', '집행된 작업만 해제할 수 있습니다.');
  const { outcome } = await runWithRetry(
    ctx,
    () => ctx.executor.release({ operationKey: key, target: op.target }),
    async () => (await ctx.executor.status(key)) === 'released',
  );
  let confirmed = false;
  if (outcome === 'done') {
    try { confirmed = (await ctx.executor.status(key)) === 'released'; } catch { confirmed = false; }
  }
  if (!confirmed) throw new ProductError(503, 'release_unconfirmed', '차단이 풀렸는지 확인하지 못해 해제로 기록하지 않았습니다. 다시 시도하세요.');
  await ctx.store.transaction(async tx => {
    const cur = await loadOperation(tx, key);
    if (cur.state === 'released') return;
    await tx.put('operations', key, { ...cur, state: 'released', releasedAt: isoAt(ctx.clock()) });
    await appendAudit(tx, ctx, 'response.release', { operationKey: key });
  });
  return { operationKey: key, state: 'released' };
}

/** operator 만. → { operationKey, state, approval, attempts, executedAt, releasedAt } */
export async function getResponse(ctx, key) {
  requireOperator(ctx);
  checkKey(key);
  return view(await loadOperation(ctx.store, key));
}


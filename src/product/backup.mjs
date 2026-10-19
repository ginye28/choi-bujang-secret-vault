// D4 복구: 정책과 사건을 정해진 형식으로 백업하고, 전체를 검사한 뒤에만 복원합니다.
// 감사 기록(audit)은 백업에 담지도, 복원으로 지우지도 않습니다.
import { conflict, ProductError, unprocessable } from '../platform/errors.mjs';
import { BACKUP_ALLOWED_ITEMS, BACKUP_LIMITS, ContractError, buildBackup, canonicalJson, utf8Length, verifyBackup } from '../../vendor/defense-product-contracts/index.mjs';
import { appendAudit, badInput, isPlainObject, isoAt, requireOperator } from './shared.mjs';
import { activeVersion, checkSnapshot, currentRevision, installPolicy } from './policy.mjs';
import { detectIncidents, loadEventRows, storeValidated, validateEvents } from './events.mjs';

const POLICY = 'policy.json';
const EVENTS = 'selected-events.json';

function requestedItems(body) {
  if (body.items === undefined) return null; // 있는 것을 모두
  if (!Array.isArray(body.items) || body.items.length === 0) throw badInput('items_invalid', 'items');
  const names = [...new Set(body.items)];
  if (names.some(name => !BACKUP_ALLOWED_ITEMS.includes(name))) throw badInput('items_invalid', 'items');
  return names;
}

// 이 앱이 가진 사건 가운데 백업 한도(개수·크기)에 들어가는 최근 사건들. 한도를 넘으면 오래된 것부터 뺍니다.
function selectEvents(rows) {
  const sorted = [...rows.values()].sort((a, b) => (a.ms - b.ms) || (a.id < b.id ? -1 : 1));
  let picked = sorted.slice(-BACKUP_LIMITS.maxEvents);
  while (picked.length > 0 && utf8Length(canonicalJson(picked.map(r => r.event))) > BACKUP_LIMITS.maxItemBytes) {
    picked = picked.slice(Math.ceil(picked.length / 10));
  }
  return picked.map(r => r.event);
}

/** operator 만. body { items?: ['policy.json','selected-events.json'] } → aleph.product.backup.v1 문서 */
export async function createBackup(ctx, body) {
  requireOperator(ctx);
  if (!isPlainObject(body)) throw badInput('body_invalid', 'object required');
  const names = requestedItems(body);
  const version = await activeVersion(ctx.store);
  const items = {};
  if ((names === null || names.includes(POLICY)) && version) items[POLICY] = version.snapshot;
  else if (names?.includes(POLICY)) throw conflict('policy_missing', '활성 정책이 없어 policy.json 을 만들 수 없습니다.');
  if (names === null || names.includes(EVENTS)) items[EVENTS] = selectEvents(await loadEventRows(ctx.store));
  if (Object.keys(items).length === 0) throw conflict('nothing_to_backup', '백업할 자료가 없습니다.');
  let backup;
  try {
    backup = buildBackup({ projectId: ctx.projectId, items, createdAt: isoAt(ctx.clock()) });
  } catch (error) {
    if (error instanceof ContractError) throw unprocessable(error.code, error.detail);
    throw error;
  }
  await ctx.store.transaction(tx => appendAudit(tx, ctx, 'backup.create', { items: Object.keys(items) }));
  return backup;
}

/** operator 만. body { backup } → { revision, restored: [...] }
 *  전체 검사에 실패하면 422(공개 계약 오류 코드)이고 아무것도 바꾸지 않습니다. 반영은 한 트랜잭션입니다. */
export async function restoreBackup(ctx, body) {
  requireOperator(ctx);
  if (!isPlainObject(body)) throw badInput('body_invalid', 'object required');
  const checked = verifyBackup(body.backup, { projectId: ctx.projectId });
  if (!checked.ok) throw new ProductError(422, checked.code, checked.detail);
  // 계약 검사를 통과해도, 정책은 이 앱의 규칙 어휘로 한 번 더, 사건은 이 앱의 사건 규칙으로 한 번 더 검사합니다.
  if (checked.items[POLICY]) checkSnapshot(checked.items[POLICY], ctx.projectId);
  const events = checked.items[EVENTS] ? validateEvents(checked.items[EVENTS]) : null;

  return ctx.store.transaction(async tx => {
    const restored = [];
    if (events) {
      const rows = await loadEventRows(tx);
      const { conflicts, touched } = await storeValidated(tx, ctx, events, rows);
      if (conflicts.length) throw unprocessable('restore_conflict', `같은 id 의 사건이 다른 내용으로 있습니다: ${conflicts[0]}`);
      if (touched.size) await detectIncidents(tx, touched, rows);
      restored.push(EVENTS);
    }
    let revision;
    if (checked.items[POLICY]) {
      ({ revision } = await installPolicy(tx, ctx, checked.items[POLICY], 'restore'));
      restored.unshift(POLICY);
    } else {
      revision = await currentRevision(tx);
    }
    await appendAudit(tx, ctx, 'backup.restore', { restored, revision });
    return { revision, restored };
  });
}

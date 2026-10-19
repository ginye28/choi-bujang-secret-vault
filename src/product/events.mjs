// D2 사건: 중복과 충돌을 가려 저장하고, 시각 순으로 찾아보고, 몰린 읽기를 사건 묶음으로 만듭니다.
//
// 저장 모양
//   events/<사건 id>      { id, ms, digest, event, runId }   event 는 받은 그대로(요청 본문의 사건 객체)
//   incidents/<묶음 id>   { id, rule, subject, eventIds, firstAt, lastAt, policyRevision }
import { createHash } from 'node:crypto';
import { notFound } from '../platform/errors.mjs';
import { BACKUP_FORBIDDEN_KEYS, canonicalDigest, canonicalJson, utf8Length } from '../../vendor/defense-product-contracts/index.mjs';
import { CONFIG } from './config.mjs';
import { appendAudit, badInput, cleanString, isPlainObject, requireOperator } from './shared.mjs';
import { currentRevision } from './policy.mjs';

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,9})?(Z|[+-](\d{2}):(\d{2}))$/u;

/** ISO 8601 시각 문자열을 밀리초로. 달력에 없는 날짜·범위 밖 값은 null. */
export function parseAt(text) {
  const m = typeof text === 'string' ? ISO.exec(text) : null;
  if (!m) return null;
  const [year, month, day, hour, minute, second] = m.slice(1, 7).map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  if (hour > 23 || minute > 59 || second > 59) return null;
  if (m[9] !== undefined && (Number(m[9]) > 23 || Number(m[10]) > 59)) return null;
  const ms = Date.parse(text);
  return Number.isFinite(ms) ? ms : null;
}

const forbiddenKey = key => BACKUP_FORBIDDEN_KEYS.includes(key.toLowerCase().replace(/[\s_-]/gu, ''));
function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (!isPlainObject(value)) return false;
  return Object.entries(value).some(([key, inner]) => forbiddenKey(key) || hasForbiddenKey(inner));
}

// 사건 하나를 검사합니다. 하나라도 틀리면 묶음 전체를 받지 않습니다.
// 인증값·감사 이름으로 보이는 키는 받지 않습니다(나중에 백업에 담을 수 없는 사건이 쌓이지 않게).
function validateEvent(event, index) {
  const bad = detail => badInput('event_invalid', `events[${index}] ${detail}`);
  if (!isPlainObject(event)) throw bad('object required');
  if (!cleanString(event.id, 128)) throw bad('id');
  const ms = parseAt(event.at);
  if (ms === null) throw bad('at');
  if (!cleanString(event.kind, 64)) throw bad('kind');
  if (!cleanString(event.subject, 256)) throw bad('subject');
  if (hasForbiddenKey(event)) throw bad('forbidden key');
  let digest;
  try {
    if (utf8Length(canonicalJson(event)) > CONFIG.limits.eventBytes) throw new Error('too large');
    digest = canonicalDigest(event);
  } catch {
    throw bad('value');
  }
  return { id: event.id, ms, digest, event };
}

const byTime = (a, b) => (a.ms - b.ms) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export const incidentIdFor = subject => `inc-${createHash('sha256').update(`${CONFIG.burst.rule}|${subject}`).digest('hex').slice(0, 24)}`;

/** 트랜잭션 안에서 사건 묶음을 만들거나 고칩니다. rows 는 { id → 저장된 사건 행 } 전체 지도입니다.
 *  같은 subject 에는 묶음이 하나뿐이라 묶음 id 를 subject 에서 정합니다(동시에 넣어도 둘로 갈라지지 않음). */
export async function detectIncidents(tx, subjects, rows) {
  const { kind, windowMs, minEvents, rule } = CONFIG.burst;
  const reads = new Map();
  for (const row of rows.values()) {
    if (row.event.kind !== kind || !subjects.has(row.event.subject)) continue;
    if (!reads.has(row.event.subject)) reads.set(row.event.subject, []);
    reads.get(row.event.subject).push(row);
  }
  for (const [subject, list] of reads) {
    list.sort(byTime);
    const members = new Set();
    let start = 0;
    let marked = -1;
    for (let end = 0; end < list.length; end += 1) {
      while (list[end].ms - list[start].ms >= windowMs) start += 1;
      if (end - start + 1 >= minEvents) {
        for (let k = Math.max(start, marked + 1); k <= end; k += 1) members.add(k);
        marked = end;
      }
    }
    if (members.size === 0) continue;
    const picked = [...members].sort((a, b) => a - b).map(k => list[k]);
    const id = incidentIdFor(subject);
    const existing = await tx.get('incidents', id);
    const next = {
      id, rule, subject,
      eventIds: picked.map(r => r.id),
      firstAt: picked[0].event.at,
      lastAt: picked[picked.length - 1].event.at,
      policyRevision: existing?.policyRevision ?? await currentRevision(tx),
    };
    if (!existing || canonicalJson(existing) !== canonicalJson(next)) await tx.put('incidents', id, next);
  }
}

export async function loadEventRows(reader) {
  return new Map((await reader.list('events')).map(({ id, value }) => [id, value]));
}

/** 이미 검사를 마친 사건들을 트랜잭션 안에서 저장합니다(ingestEvents 와 restoreBackup 이 함께 씁니다). */
export async function storeValidated(tx, ctx, validated, rows) {
  let accepted = 0;
  let duplicates = 0;
  const conflicts = new Set();
  const touched = new Set();
  for (const v of validated) {
    const current = rows.get(v.id);
    if (!current) {
      const row = { id: v.id, ms: v.ms, digest: v.digest, event: v.event, runId: ctx.runId ?? null };
      await tx.put('events', v.id, row);
      rows.set(v.id, row);
      touched.add(v.event.subject);
      accepted += 1;
    } else if (current.digest === v.digest) {
      duplicates += 1;
    } else {
      conflicts.add(v.id);
    }
  }
  return { accepted, duplicates, conflicts: [...conflicts], touched };
}

export function validateEvents(events) {
  return events.map(validateEvent);
}

/** operator 만. body { events: [...] } → { accepted, duplicates, conflicts } */
export async function ingestEvents(ctx, body) {
  requireOperator(ctx);
  if (!isPlainObject(body) || !Array.isArray(body.events)) throw badInput('event_invalid', 'events array required');
  if (body.events.length > CONFIG.limits.eventBatch) throw badInput('event_batch_too_large', String(CONFIG.limits.eventBatch));
  const validated = validateEvents(body.events);
  return ctx.store.transaction(async tx => {
    const rows = await loadEventRows(tx);
    const { accepted, duplicates, conflicts, touched } = await storeValidated(tx, ctx, validated, rows);
    if (touched.size) await detectIncidents(tx, touched, rows);
    if (validated.length) await appendAudit(tx, ctx, 'events.ingest', { accepted, duplicates, conflicts: conflicts.length });
    return { accepted, duplicates, conflicts };
  });
}

// ── 조회 ─────────────────────────────────────────────────────────────────────

const encodeCursor = row => Buffer.from(JSON.stringify([row.ms, row.id])).toString('base64url');
function decodeCursor(text) {
  try {
    const value = JSON.parse(Buffer.from(String(text), 'base64url').toString('utf8'));
    if (Array.isArray(value) && value.length === 2 && Number.isFinite(value[0]) && typeof value[1] === 'string') return { ms: value[0], id: value[1] };
  } catch { /* 아래에서 거부 */ }
  throw badInput('cursor_invalid', 'cursor');
}

/** operator 만. query { from?, to?, kind?, subject?, limit?, cursor? } → { items, nextCursor } 시각 순, 같으면 id 순 */
export async function queryEvents(ctx, query) {
  requireOperator(ctx);
  const q = isPlainObject(query) ? query : {};
  const bound = (value, name) => {
    if (value === undefined || value === '') return null;
    const ms = parseAt(value);
    if (ms === null) throw badInput('query_invalid', name);
    return ms;
  };
  const from = bound(q.from, 'from');
  const to = bound(q.to, 'to');
  let limit = CONFIG.limits.queryLimitMax;
  if (q.limit !== undefined) {
    if (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > CONFIG.limits.queryLimitMax) throw badInput('query_invalid', 'limit');
    limit = q.limit;
  }
  const after = q.cursor === undefined || q.cursor === '' ? null : decodeCursor(q.cursor);
  const rows = (await ctx.store.list('events')).map(r => r.value)
    .filter(r => (from === null || r.ms >= from) && (to === null || r.ms <= to)
      && (q.kind === undefined || r.event.kind === q.kind) && (q.subject === undefined || r.event.subject === q.subject))
    .sort(byTime)
    .filter(r => after === null || byTime(r, after) > 0);
  const page = rows.slice(0, limit);
  return { items: page.map(r => r.event), nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1]) : null };
}

/** operator 만. → { items: [{ id, rule, subject, eventIds, firstAt, lastAt, policyRevision }] } */
export async function listIncidents(ctx) {
  requireOperator(ctx);
  const items = (await ctx.store.list('incidents')).map(r => r.value)
    .sort((a, b) => (parseAt(a.firstAt) - parseAt(b.firstAt)) || (a.id < b.id ? -1 : 1));
  return { items };
}

/** operator 만. 없으면 404 */
export async function getIncident(ctx, id) {
  requireOperator(ctx);
  const incident = await ctx.store.get('incidents', String(id));
  if (!incident) throw notFound('incident_not_found', String(id));
  return incident;
}

// 여러 기능이 함께 쓰는 작은 도구들. 업무 규칙은 각 기능 파일에 있습니다.
import { randomUUID } from 'node:crypto';
import { ProductError, forbidden } from '../platform/errors.mjs';

export const isPlainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

/** 관리 작업자(operator)만 통과시킵니다. 역할은 서버 DB 의 역할 표에서 온 ctx.actor 만 믿습니다. */
export function requireOperator(ctx) {
  if (ctx.actor?.role !== 'operator') throw forbidden('operator_required', '관리 작업자만 할 수 있습니다.');
}

export const isoAt = ms => new Date(ms).toISOString();

/** 감사 기록 한 줄을 덧붙입니다. 'audit' 모음은 지우거나 덮어쓰지 않습니다. 토큰·비밀번호는 넣지 않습니다. */
export async function appendAudit(tx, ctx, action, detail = {}) {
  const at = ctx.clock();
  await tx.put('audit', `${String(Math.max(0, Math.trunc(at))).padStart(15, '0')}-${randomUUID()}`, {
    at: isoAt(at), userId: ctx.actor.userId, role: ctx.actor.role, action, detail, runId: ctx.runId ?? null,
  });
}

export const controlChars = /[\u0000-\u001F\u007F]/u;

/** 사건·자원 이름 같은 문자열 필드: 비어 있지 않고, 길이 제한 안이며, 제어 문자가 없어야 합니다. */
export function cleanString(value, maxLength) {
  return typeof value === 'string' && value.length >= 1 && value.length <= maxLength && !controlChars.test(value);
}

export function badInput(code, detail) {
  return new ProductError(400, code, detail);
}

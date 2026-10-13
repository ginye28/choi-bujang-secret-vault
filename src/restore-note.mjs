import { isNoteResourceId } from './resource-ids.mjs';
import { listBackups, pickBackup, sha256Hex } from './note-backup.mjs';

const ID_KEYS = ['id', 'noteId', 'memoId'];
const HASH_KEYS = ['contentSha256', 'contentHash', 'sha256', 'hash'];
const OWNER_KEYS = ['owner', 'ownerId', 'owner_id'];

function firstString(body, keys) {
  for (const key of keys) {
    if (typeof body[key] === 'string' && body[key].trim() !== '') return body[key].trim();
  }
  return undefined;
}

// 비공개 사본에서 메모 한 건만 되돌립니다. 반환은 { status, json } 이며 HTTP 응답은 호출 쪽이 만듭니다.
// 검증된 로그인 사용자(identity.userId)가 소유한 사본만 읽으므로 다른 사용자의 메모는 되돌리지 않고,
// 다른 메모와 사본(감사 기록)은 바꾸지 않습니다.
export async function restoreNote({ supabase, identity, body }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, json: { error: 'INVALID_BODY' } };
  }
  const id = firstString(body, ID_KEYS);
  if (!isNoteResourceId(id)) return { status: 400, json: { error: 'INVALID_ID' } };
  const claimedOwner = firstString(body, OWNER_KEYS);
  if (claimedOwner !== undefined && claimedOwner !== identity.userId) {
    return { status: 403, json: { error: 'FORBIDDEN', reason: 'OWNER_MISMATCH' } };
  }

  const owner = identity.userId;
  let copies;
  try {
    copies = await listBackups(supabase, { id: id.toLowerCase(), owner });
  } catch {
    return { status: 500, json: { error: 'BACKUP_SERVICE_UNAVAILABLE' } };
  }
  if (copies.length === 0) return { status: 404, json: { error: 'BACKUP_NOT_FOUND' } };
  const expectedHash = firstString(body, HASH_KEYS);
  const copy = pickBackup(copies, expectedHash);
  if (!copy) return { status: 409, json: { error: 'HASH_MISMATCH' } };

  try {
    const { data: current, error: readError } = await supabase
      .from('training_notes')
      .select('id, owner_id')
      .eq('id', copy.id)
      .maybeSingle();
    if (readError) return { status: 500, json: { error: 'NOTES_SERVICE_UNAVAILABLE' } };
    if (current && current.owner_id !== owner) {
      return { status: 409, json: { error: 'OWNER_MISMATCH' } };
    }
    if (current) {
      const { error } = await supabase
        .from('training_notes')
        .update({ title: copy.title, content: copy.content })
        .eq('id', copy.id)
        .eq('owner_id', owner);
      if (error) return { status: 500, json: { error: 'NOTES_SERVICE_UNAVAILABLE' } };
    } else {
      const { error } = await supabase
        .from('training_notes')
        .insert({ id: copy.id, owner_id: owner, title: copy.title, content: copy.content });
      if (error) return { status: 500, json: { error: 'NOTES_SERVICE_UNAVAILABLE' } };
    }
  } catch {
    return { status: 500, json: { error: 'NOTES_SERVICE_UNAVAILABLE' } };
  }
  return {
    status: 200,
    json: { id: copy.id, restored: true, contentSha256: sha256Hex(copy.content), source: 'private_backup' },
  };
}

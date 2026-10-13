import { isNoteResourceId } from './resource-ids.mjs';
import { contentHashes, listBackups, pickBackup, sha256Hex } from './note-backup.mjs';

const ID_KEYS = ['id', 'noteId', 'memoId', 'note_id'];
const HASH_KEYS = ['contentSha256', 'contentHash', 'content_hash', 'contentSHA256', 'sha256', 'hash'];
const OWNER_KEYS = ['owner', 'ownerId', 'owner_id', 'userId'];
const TITLE_KEYS = ['title'];
const CONTENT_KEYS = ['content', 'body', 'text'];
const COPY_KEYS = ['copy', 'backup', 'snapshot', 'note'];

function firstString(source, keys) {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    if (typeof source[key] === 'string' && source[key].trim() !== '') return source[key].trim();
  }
  return undefined;
}

function firstRaw(source, keys) {
  if (!source || typeof source !== 'object') return undefined;
  for (const key of keys) {
    if (typeof source[key] === 'string') return source[key];
  }
  return undefined;
}

// 요청이 말하는 대상과 사본 주장을 모읍니다. 사본 주장은 본문 최상위 또는 copy/backup/snapshot/note
// 객체 안에 들어올 수 있습니다. 어디에 있든 하나라도 우리 사본과 다르면 복원하지 않습니다.
function collectClaims(body) {
  const nested = COPY_KEYS.map((key) => body[key])
    .filter((value) => value && typeof value === 'object' && !Array.isArray(value));
  const sources = [body, ...nested];
  const unique = (keys, reader = firstString) => [...new Set(sources.map((source) => reader(source, keys))
    .filter((value) => value !== undefined))];
  return {
    ids: unique(ID_KEYS),
    owners: unique(OWNER_KEYS),
    hashes: unique(HASH_KEYS),
    titles: unique(TITLE_KEYS, firstRaw),
    contents: unique(CONTENT_KEYS, firstRaw),
  };
}

function normalizeHash(value) {
  return value.trim().toLowerCase().replace(/^sha-?256[:=]/u, '');
}

function refuse(status, error, reason) {
  return { status, json: { error, ...(reason ? { reason } : {}) } };
}

// 비공개 사본에서 메모 한 건만 되돌립니다. 반환은 { status, json } 이며 HTTP 응답은 호출 쪽이 만듭니다.
// 로그인한 사용자(identity.userId)가 소유한 사본만 읽고, 사본을 다시 읽어 내용 해시를 검증합니다.
// 요청에 적힌 ID·소유자·내용·해시가 사본과 하나라도 다르면 멈추고 아무것도 바꾸지 않습니다.
// body.dryRun === true 이면 복원할 버전과 바뀔 항목만 보여 줍니다.
export async function restoreNote({ supabase, identity, body }) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return refuse(400, 'INVALID_BODY');
  }
  const claims = collectClaims(body);
  const id = claims.ids[0];
  if (!isNoteResourceId(id) || claims.ids.some((value) => value.toLowerCase() !== id.toLowerCase())) {
    return refuse(400, 'INVALID_ID');
  }
  const owner = identity.userId;
  if (claims.owners.some((value) => value !== owner)) {
    return refuse(403, 'FORBIDDEN', 'OWNER_MISMATCH');
  }

  let copies;
  try {
    copies = await listBackups(supabase, { id: id.toLowerCase(), owner });
  } catch {
    return refuse(500, 'BACKUP_SERVICE_UNAVAILABLE');
  }
  if (copies.length === 0) return refuse(404, 'BACKUP_NOT_FOUND');

  // 침해 전에 만든 가장 오래된 검증 사본만 복원 대상으로 삼습니다. 이후에 생긴 버전은 쓰지 않습니다.
  const copy = pickBackup(copies.slice(0, 1), undefined);
  const copyHashes = contentHashes(copy);

  for (const hash of claims.hashes) {
    const wanted = normalizeHash(hash);
    if (!/^[0-9a-f]{8,64}$/u.test(wanted) || !copyHashes.some((value) => value.startsWith(wanted))) {
      return refuse(409, 'BACKUP_VERIFICATION_FAILED', 'HASH_MISMATCH');
    }
  }
  for (const content of claims.contents) {
    // 요청에 사본 내용이 실려 왔다면 우리 사본과 글자 그대로 같아야 하고, 함께 온 해시와도 맞아야 합니다.
    if (content !== copy.content) {
      return refuse(409, 'BACKUP_VERIFICATION_FAILED', 'CONTENT_MISMATCH');
    }
  }
  if (claims.titles.some((title) => title !== copy.title)) {
    return refuse(409, 'BACKUP_VERIFICATION_FAILED', 'TITLE_MISMATCH');
  }

  let current;
  try {
    const { data, error } = await supabase
      .from('training_notes')
      .select('id, owner_id, title, content')
      .eq('id', copy.id)
      .maybeSingle();
    if (error) return refuse(500, 'NOTES_SERVICE_UNAVAILABLE');
    current = data;
  } catch {
    return refuse(500, 'NOTES_SERVICE_UNAVAILABLE');
  }
  if (current && current.owner_id !== owner) return refuse(409, 'OWNER_MISMATCH');

  const changes = !current ? ['recreated']
    : [current.title !== copy.title ? 'title' : null, current.content !== copy.content ? 'content' : null]
      .filter(Boolean);
  const version = { contentSha256: sha256Hex(copy.content), source: 'private_backup' };

  if (body.dryRun === true) {
    return { status: 200, json: { id: copy.id, restored: false, dryRun: true, version, changes } };
  }
  if (changes.length === 0) {
    return { status: 200, json: { id: copy.id, restored: true, unchanged: true, version, changes } };
  }

  try {
    if (current) {
      const { error } = await supabase
        .from('training_notes')
        .update({ title: copy.title, content: copy.content })
        .eq('id', copy.id)
        .eq('owner_id', owner);
      if (error) return refuse(500, 'NOTES_SERVICE_UNAVAILABLE');
    } else {
      const { error } = await supabase
        .from('training_notes')
        .insert({ id: copy.id, owner_id: owner, title: copy.title, content: copy.content });
      if (error) return refuse(500, 'NOTES_SERVICE_UNAVAILABLE');
    }
  } catch {
    return refuse(500, 'NOTES_SERVICE_UNAVAILABLE');
  }
  return { status: 200, json: { id: copy.id, restored: true, version, changes } };
}

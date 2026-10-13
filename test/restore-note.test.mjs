import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import {
  BACKUP_PREFIX, backupCurrentNote, buildBackupRow, readBackupRow, recordBackup, sha256Hex,
} from '../src/note-backup.mjs';
import { restoreNote } from '../src/restore-note.mjs';

// training_notes 한 테이블만 흉내 내는 메모리 DB 입니다(시험용).
function fakeSupabase() {
  const rows = [];
  let tick = 0;
  const matches = (row, filters) => filters.every(({ op, col, val }) => {
    if (op === 'eq') return row[col] === val;
    const like = typeof row[col] === 'string' && row[col].startsWith(val.replace(/%$/u, ''));
    return op === 'like' ? like : !like;
  });
  function builder(table, action, payload) {
    const filters = [];
    let order = null;
    const api = {
      select() { return api; },
      eq(col, val) { filters.push({ op: 'eq', col, val }); return api; },
      like(col, val) { filters.push({ op: 'like', col, val }); return api; },
      not(col, _op, val) { filters.push({ op: 'notlike', col, val }); return api; },
      order(col, opts) { order = { col, asc: opts?.ascending !== false }; return api; },
      async maybeSingle() {
        const found = rows.filter((row) => matches(row, filters));
        return { data: found[0] ? { ...found[0] } : null, error: null };
      },
      then(resolve) {
        if (action === 'insert') {
          rows.push({ id: randomUUID(), created_at: tick += 1, ...payload });
          return resolve({ data: null, error: null });
        }
        if (action === 'update') {
          rows.filter((row) => matches(row, filters)).forEach((row) => Object.assign(row, payload));
          return resolve({ data: null, error: null });
        }
        let found = rows.filter((row) => matches(row, filters)).map((row) => ({ ...row }));
        if (order) found.sort((a, b) => (a[order.col] - b[order.col]) * (order.asc ? 1 : -1));
        return resolve({ data: found, error: null });
      },
    };
    return api;
  }
  return {
    rows,
    from(table) {
      assert.equal(table, 'training_notes');
      return {
        select: () => builder(table, 'select'),
        insert: (payload) => builder(table, 'insert', payload),
        update: (payload) => builder(table, 'update', payload),
      };
    },
  };
}

const A = { userId: 'a'.repeat(8) + '-0000-4000-8000-' + 'a'.repeat(12) };
const B = { userId: 'b'.repeat(8) + '-0000-4000-8000-' + 'b'.repeat(12) };

function seedNote(db, owner, title, content) {
  const id = randomUUID();
  db.rows.push({ id, owner_id: owner.userId, title, content, created_at: 0 });
  return id;
}

test('변조된 메모는 침해 전 사본의 제목·내용으로 되돌아오고 다른 메모는 그대로다', async () => {
  const db = fakeSupabase();
  const id = seedNote(db, B, '원본 제목', '원본 내용');
  const other = seedNote(db, B, '다른 메모', '그대로');
  await backupCurrentNote(db, { id, owner: B.userId });

  const row = db.rows.find((item) => item.id === id);
  row.title = '변조 제목';
  row.content = '변조 내용';
  await recordBackup(db, { id, owner: B.userId, title: row.title, content: row.content });

  const out = await restoreNote({ supabase: db, identity: B, body: { id } });
  assert.equal(out.status, 200);
  assert.equal(out.json.contentSha256, sha256Hex('원본 내용'));
  assert.deepEqual([row.title, row.content], ['원본 제목', '원본 내용']);
  assert.equal(db.rows.find((item) => item.id === other).content, '그대로');
});

test('삭제된 메모도 같은 ID와 소유자로 다시 만든다', async () => {
  const db = fakeSupabase();
  const id = seedNote(db, B, '제목', '내용');
  await backupCurrentNote(db, { id, owner: B.userId });
  db.rows.splice(db.rows.findIndex((item) => item.id === id), 1);

  const out = await restoreNote({ supabase: db, identity: B, body: { id } });
  assert.equal(out.status, 200);
  const restored = db.rows.find((item) => item.id === id);
  assert.deepEqual([restored.owner_id, restored.title, restored.content], [B.userId, '제목', '내용']);
});

test('다른 사용자·없는 사본·틀린 해시·잘못된 요청은 되돌리지 않는다', async () => {
  const db = fakeSupabase();
  const id = seedNote(db, B, '제목', '내용');
  await backupCurrentNote(db, { id, owner: B.userId });
  db.rows.find((item) => item.id === id).content = '변조';

  const stranger = await restoreNote({ supabase: db, identity: A, body: { id } });
  assert.equal(stranger.status, 404);
  assert.equal(db.rows.find((item) => item.id === id).content, '변조');

  const claimed = await restoreNote({ supabase: db, identity: A, body: { id, owner: B.userId } });
  assert.equal(claimed.status, 403);

  const wrongHash = await restoreNote({ supabase: db, identity: B, body: { id, contentSha256: 'f'.repeat(64) } });
  assert.equal(wrongHash.status, 409);

  assert.equal((await restoreNote({ supabase: db, identity: B, body: { id: 'not-a-uuid' } })).status, 400);
  assert.equal((await restoreNote({ supabase: db, identity: B, body: null })).status, 400);

  const goodHash = await restoreNote({ supabase: db, identity: B, body: { id, contentSha256: sha256Hex('내용') } });
  assert.equal(goodHash.status, 200);
  assert.equal(db.rows.find((item) => item.id === id).content, '내용');
});

test('내용이 바뀐 사본은 검증에 실패해 복원에 쓰지 않는다', async () => {
  const row = { ...buildBackupRow({ id: randomUUID(), owner: B.userId, title: 't', content: '원문' }) };
  assert.ok(row.title.startsWith(BACKUP_PREFIX));
  assert.ok(readBackupRow(row));
  const copy = JSON.parse(row.content);
  copy.content = '바꾼 내용';
  assert.equal(readBackupRow({ ...row, content: JSON.stringify(copy) }), null);

  const db = fakeSupabase();
  const id = randomUUID();
  const bad = buildBackupRow({ id, owner: B.userId, title: 't', content: '원문' });
  const tampered = JSON.parse(bad.content);
  tampered.content = '바꾼 내용';
  db.rows.push({ id: randomUUID(), created_at: 1, ...bad, content: JSON.stringify(tampered) });
  const out = await restoreNote({ supabase: db, identity: B, body: { id } });
  assert.equal(out.status, 404);
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasStoredInstructorPermission } from '../src/instructor-access.mjs';

const userId = '61e6b8a1-514f-4aa6-bb29-ec97d4c46759';

function supabaseReturning(user) {
  const lookedUp = [];
  return {
    lookedUp,
    auth: {
      admin: {
        async getUserById(id) {
          lookedUp.push(id);
          return { data: { user }, error: null };
        },
      },
    },
  };
}

test('강사 자료 권한은 검증 사용자와 저장된 app_metadata가 함께 맞을 때만 허용한다', async () => {
  const supabase = supabaseReturning({ id: userId, app_metadata: { role: 'instructor' } });
  assert.equal(await hasStoredInstructorPermission(supabase, { kind: 'student', userId }), true);
  assert.deepEqual(supabase.lookedUp, [userId]);
});

test('요청/검증 객체의 role, user_metadata, 다른 저장 사용자로는 권한을 만들 수 없다', async () => {
  const userMetadataOnly = supabaseReturning({ id: userId, user_metadata: { role: 'instructor' } });
  assert.equal(await hasStoredInstructorPermission(userMetadataOnly, {
    kind: 'student', userId, role: 'instructor', body: { role: 'instructor' },
  }), false);

  const mismatchedStoredUser = supabaseReturning({
    id: '2a7cecb0-ea0a-4f83-90fc-931255de0357',
    app_metadata: { role: 'instructor' },
  });
  assert.equal(await hasStoredInstructorPermission(mismatchedStoredUser, { kind: 'student', userId }), false);
});

test('비학생 검증 신원은 저장 권한 조회 전에 거부한다', async () => {
  const supabase = { auth: { admin: { getUserById: async () => { throw new Error('must not be called'); } } } };
  assert.equal(await hasStoredInstructorPermission(supabase, { kind: 'judge', userId }), false);
});

test('저장 권한 조회 실패는 허용으로 바꾸지 않고 호출자에게 전달한다', async () => {
  const supabase = {
    auth: { admin: { getUserById: async () => ({ data: null, error: new Error('lookup failed') }) } },
  };
  await assert.rejects(hasStoredInstructorPermission(supabase, { kind: 'student', userId }), /lookup failed/u);
});

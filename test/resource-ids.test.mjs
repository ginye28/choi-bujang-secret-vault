import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  announcementDatabaseId,
  announcementResourceId,
  createAnnouncementResourceId,
  isAnnouncementResourceId,
  isNoteResourceId,
} from '../src/resource-ids.mjs';

test('메모와 강사 공지는 서로 겹치지 않는 자원 ID 형식을 사용한다', () => {
  const noteId = '61e6b8a1-514f-4aa6-bb29-ec97d4c46759';
  const announcementId = `announcement_${noteId}`;

  assert.equal(isNoteResourceId(noteId), true);
  assert.equal(isAnnouncementResourceId(noteId), false);
  assert.equal(isAnnouncementResourceId(announcementId), true);
  assert.equal(isNoteResourceId(announcementId), false);
  assert.equal(isAnnouncementResourceId('announcement_not-a-uuid'), false);
});

test('공지 API 자원 ID와 저장소 UUID를 일관되게 변환한다', () => {
  const databaseId = '61e6b8a1-514f-4aa6-bb29-ec97d4c46759';
  const resourceId = createAnnouncementResourceId(databaseId);

  assert.equal(resourceId, `announcement_${databaseId}`);
  assert.equal(announcementResourceId(databaseId), resourceId);
  assert.equal(announcementDatabaseId(resourceId), databaseId);
  assert.throws(() => createAnnouncementResourceId('not-a-uuid'), TypeError);
  assert.throws(() => announcementDatabaseId(databaseId), TypeError);
});

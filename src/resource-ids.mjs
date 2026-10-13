const NOTE_UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

// 기존 메모 ID 형식(UUID)은 바꾸지 않습니다. 공지에는 별도 접두사를 사용합니다.
export const NOTE_RESOURCE_ID = new RegExp(`^${NOTE_UUID}$`, 'iu');
export const ANNOUNCEMENT_RESOURCE_ID = new RegExp(`^announcement_${NOTE_UUID}$`, 'iu');

export function isNoteResourceId(value) {
  return typeof value === 'string' && NOTE_RESOURCE_ID.test(value);
}

export function isAnnouncementResourceId(value) {
  return typeof value === 'string' && ANNOUNCEMENT_RESOURCE_ID.test(value);
}

export function createAnnouncementResourceId(uuid) {
  if (!isNoteResourceId(uuid)) throw new TypeError('invalid_uuid');
  return `announcement_${uuid.toLowerCase()}`;
}

export function announcementDatabaseId(resourceId) {
  if (!isAnnouncementResourceId(resourceId)) throw new TypeError('invalid_announcement_id');
  return resourceId.slice('announcement_'.length).toLowerCase();
}

export function announcementResourceId(databaseId) {
  if (!isNoteResourceId(databaseId)) throw new TypeError('invalid_uuid');
  return createAnnouncementResourceId(databaseId);
}

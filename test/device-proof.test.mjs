import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  APP_MARKER, bodyDigest, checkDeviceProof, decideNewDevice, isDeviceId, issueTicket, newDeviceId,
  requestTarget,
} from '../src/device-proof.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SECRET = 'test-only-server-secret';
const OWNER = 'a1b2c3d4-0000-4000-8000-000000000001';
const student = { kind: 'student', userId: OWNER };
const judge = { kind: 'judge', userId: OWNER, identity: 'b' };

function device(status = 'approved', owner = OWNER) {
  return { v: 2, deviceId: newDeviceId(), owner, status };
}

const loaderFor = (record) => async (id) => (id === record.deviceId ? record : null);

function signed(record, { method = 'PUT', url = '/api/notes/abc', body, now = Date.now(), headers = {} } = {}) {
  const { ticket } = issueTicket({
    secret: SECRET, userId: OWNER, deviceId: record.deviceId, method, target: url,
    bodySha256: bodyDigest(body), now,
  });
  return {
    method, url, body, query: {},
    headers: { 'x-aleph-app': APP_MARKER, 'x-aleph-device': record.deviceId, 'x-aleph-ticket': ticket, ...headers },
  };
}

const check = (request, record, identity = student, extra = {}) =>
  checkDeviceProof({ request, identity, loadDevice: loaderFor(record), secret: SECRET, ...extra });

test('승인된 기기의 서버 서명(티켓)이 붙은 요청은 통과하고 본문 키 순서와 상관없다', async () => {
  const record = device();
  const body = { title: 't', body: 'b' };
  const request = signed(record, { body });
  const out = await check(request, record);
  assert.equal(out.ok, true);
  assert.equal((await check({ ...request, body: { body: 'b', title: 't' } }, record)).ok, true);
});

test('서명 없는 설치형 앱·학생 요청, 서명 뒤 경로·본문·방식 변경은 거부된다', async () => {
  const record = device();
  const request = signed(record, { body: { title: 't', body: 'b' } });

  const unsignedApp = await check({ method: 'GET', url: '/api/notes', headers: { 'x-aleph-app': APP_MARKER } }, record);
  assert.deepEqual([unsignedApp.ok, unsignedApp.reason], [false, 'SIGNATURE_MISSING']);

  // 설치 표시를 떼어 내도 학생 로그인 요청은 서명 없이 통과하지 못한다.
  const noMarker = await check({ method: 'GET', url: '/api/notes', headers: {} }, record);
  assert.deepEqual([noMarker.ok, noMarker.reason], [false, 'SIGNATURE_MISSING']);

  const path = await check({ ...request, url: '/api/notes/other' }, record);
  assert.deepEqual([path.ok, path.reason], [false, 'SIGNATURE_INVALID']);
  const content = await check({ ...request, body: { title: 't', body: '바뀐 본문' } }, record);
  assert.deepEqual([content.ok, content.reason], [false, 'SIGNATURE_INVALID']);
  assert.equal((await check({ ...request, method: 'DELETE' }, record)).ok, false);
  assert.equal((await check({ ...request, body: undefined }, record)).ok, false);

  const forged = { ...request, headers: { ...request.headers, 'x-aleph-ticket': `${Math.floor(Date.now() / 1000)}.AAAA` } };
  assert.equal((await check(forged, record)).reason, 'SIGNATURE_INVALID');
});

test('승인 전·다른 사용자의 기기·오래된 서명·다른 사용자 서명은 거부된다', async () => {
  const pending = device('pending');
  assert.equal((await check(signed(pending), pending)).reason, 'DEVICE_NOT_APPROVED');

  const stranger = device('approved', 'ffffffff-0000-4000-8000-000000000009');
  assert.equal((await check(signed(stranger), stranger)).reason, 'DEVICE_UNKNOWN');

  const record = device();
  const old = signed(record, { now: Date.now() - 10 * 60 * 1000 });
  assert.equal((await check(old, record)).reason, 'SIGNATURE_EXPIRED');

  const request = signed(record);
  assert.equal((await check(request, record, { kind: 'student', userId: 'ffffffff-0000-4000-8000-000000000009' })).ok, false);
  assert.equal((await check(request, record, student, { secret: 'other-secret' })).reason, 'SIGNATURE_INVALID');
});

test('심판이 발급한 시험 신원은 기존 규칙 그대로이고, 설치 표시가 붙으면 서명을 요구한다', async () => {
  const record = device();
  const plain = await check({ method: 'GET', url: '/api/notes', headers: {} }, record, judge);
  assert.deepEqual(plain, { required: false, ok: true });
  const marked = await check({ method: 'GET', url: '/api/notes', headers: { 'x-aleph-app': APP_MARKER } }, record, judge);
  assert.equal(marked.ok, false);
});

test('재작성된 주소는 같은 경로로 맞추고, 새 기기 승인은 서버 규칙으로만 정한다', () => {
  assert.equal(requestTarget({ url: '/api/notes?id=abc', query: { id: 'abc' } }), '/api/notes/abc');
  assert.equal(requestTarget({ url: '/api/notes/abc', query: { id: 'abc' } }), '/api/notes/abc');
  assert.equal(requestTarget({ url: '/api/notes', query: {} }), '/api/notes');
  assert.ok(isDeviceId(newDeviceId()));

  assert.deepEqual(decideNewDevice({ approvedCount: 0, loginAgeSeconds: 99999 }), { status: 'approved', reason: 'first_device' });
  assert.deepEqual(decideNewDevice({ approvedCount: 2, loginAgeSeconds: 30 }), { status: 'approved', reason: 'recent_login' });
  assert.deepEqual(decideNewDevice({ approvedCount: 2, loginAgeSeconds: 99999 }), { status: 'pending', reason: 'needs_approval' });
  assert.equal(decideNewDevice({ approvedCount: 2, loginAgeSeconds: Number.NaN }).status, 'pending');
});

test('화면 묶음에는 기기 서명 정보를 만들거나 저장하는 코드가 없다', async () => {
  const page = await readFile(join(root, 'public', 'index.html'), 'utf8');
  for (const word of ['generateKey', 'exportKey', 'importKey', 'privateKey', 'localStorage', 'indexedDB', 'jwk']) {
    assert.equal(page.includes(word), false, word);
  }
  // 브라우저 저장소에는 로그인 상태 외에 기기 정보를 넣지 않는다.
  const stores = [...page.matchAll(/sessionStorage\.setItem\(([A-Z_]+)/gu)].map((match) => match[1]);
  assert.deepEqual([...new Set(stores)].sort(), ['EMAIL_SLOT', 'TOKEN_SLOT']);
});

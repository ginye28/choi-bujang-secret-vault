import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import test from 'node:test';
import {
  APP_MARKER, bodyDigest, checkDeviceProof, decideNewDevice, deviceIdFromJwk, requestTarget,
  signingString,
} from '../src/device-proof.mjs';

const OWNER = 'a1b2c3d4-0000-4000-8000-000000000001';
const identity = { userId: OWNER };

async function makeDevice(status = 'approved', owner = OWNER) {
  const pair = await webcrypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const clean = { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y };
  const deviceId = deviceIdFromJwk(clean);
  return { pair, deviceId, record: { v: 1, deviceId, owner, jwk: clean, status } };
}

async function signed(device, { method = 'PUT', url = '/api/notes/abc', body, now = Date.now(), overrides = {} } = {}) {
  const seconds = Math.floor(now / 1000);
  const message = signingString({
    method, target: url, bodySha256: bodyDigest(body), timestamp: seconds, deviceId: device.deviceId,
  });
  const raw = await webcrypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, device.pair.privateKey,
    Buffer.from(message, 'utf8'));
  return {
    method, url, body, query: {},
    headers: {
      'x-aleph-app': APP_MARKER, 'x-aleph-device': device.deviceId, 'x-aleph-ts': String(seconds),
      'x-aleph-sig': Buffer.from(raw).toString('base64url'), ...overrides,
    },
  };
}

const loaderFor = (device) => async (id) => (id === device.deviceId ? device.record : null);

test('표시가 없는 요청은 기존 규칙 그대로이고, 승인된 기기의 서명 요청은 통과한다', async () => {
  const device = await makeDevice();
  const plain = await checkDeviceProof({ request: { method: 'GET', url: '/api/notes', headers: {} },
    identity, loadDevice: loaderFor(device) });
  assert.deepEqual(plain, { required: false, ok: true });

  const body = { title: 't', body: 'b' };
  const request = await signed(device, { body });
  const out = await checkDeviceProof({ request, identity, loadDevice: loaderFor(device) });
  assert.equal(out.ok, true);
  // 같은 본문의 키 순서가 달라도 같은 서명으로 확인된다.
  const reordered = { ...request, body: { body: 'b', title: 't' } };
  assert.equal((await checkDeviceProof({ request: reordered, identity, loadDevice: loaderFor(device) })).ok, true);
});

test('서명 없는 설치형 앱 요청, 서명 뒤 경로·본문·방식 변경은 거부된다', async () => {
  const device = await makeDevice();
  const body = { title: 't', body: 'b' };
  const request = await signed(device, { body });
  const run = (changed) => checkDeviceProof({ request: changed, identity, loadDevice: loaderFor(device) });

  const unsigned = await run({ method: 'GET', url: '/api/notes', headers: { 'x-aleph-app': APP_MARKER } });
  assert.deepEqual([unsigned.ok, unsigned.reason], [false, 'SIGNATURE_MISSING']);

  const path = await run({ ...request, url: '/api/notes/other' });
  assert.deepEqual([path.ok, path.reason], [false, 'SIGNATURE_INVALID']);

  const content = await run({ ...request, body: { title: 't', body: '바뀐 본문' } });
  assert.deepEqual([content.ok, content.reason], [false, 'SIGNATURE_INVALID']);

  const method = await run({ ...request, method: 'DELETE' });
  assert.equal(method.ok, false);

  const noBody = await run({ ...request, body: undefined });
  assert.equal(noBody.ok, false);
});

test('승인되지 않았거나 다른 사용자의 기기, 오래된 서명은 거부된다', async () => {
  const pending = await makeDevice('pending');
  const req = await signed(pending, {});
  assert.equal((await checkDeviceProof({ request: req, identity, loadDevice: loaderFor(pending) })).reason, 'DEVICE_NOT_APPROVED');

  const stranger = await makeDevice('approved', 'ffffffff-0000-4000-8000-000000000009');
  const req2 = await signed(stranger, {});
  assert.equal((await checkDeviceProof({ request: req2, identity, loadDevice: loaderFor(stranger) })).reason, 'DEVICE_UNKNOWN');

  const device = await makeDevice();
  const old = await signed(device, { now: Date.now() - 10 * 60 * 1000 });
  assert.equal((await checkDeviceProof({ request: old, identity, loadDevice: loaderFor(device) })).reason, 'SIGNATURE_EXPIRED');

  const forged = await signed(device, {});
  forged.headers['x-aleph-device'] = pending.deviceId;
  assert.equal((await checkDeviceProof({ request: forged, identity, loadDevice: loaderFor(device) })).ok, false);
});

test('재작성된 주소는 같은 경로로 맞추고, 새 기기 승인은 서버 규칙으로만 정한다', () => {
  assert.equal(requestTarget({ url: '/api/notes?id=abc', query: { id: 'abc' } }), '/api/notes/abc');
  assert.equal(requestTarget({ url: '/api/notes/abc', query: { id: 'abc' } }), '/api/notes/abc');
  assert.equal(requestTarget({ url: '/api/notes', query: {} }), '/api/notes');

  assert.deepEqual(decideNewDevice({ approvedCount: 0, loginAgeSeconds: 9999 }), { status: 'approved', reason: 'first_device' });
  assert.deepEqual(decideNewDevice({ approvedCount: 2, loginAgeSeconds: 30 }), { status: 'approved', reason: 'recent_login' });
  assert.deepEqual(decideNewDevice({ approvedCount: 2, loginAgeSeconds: 5000 }), { status: 'pending', reason: 'needs_approval' });
  assert.equal(decideNewDevice({ approvedCount: 2, loginAgeSeconds: Number.NaN }).status, 'pending');
});

// 마지막 총공세 2·3일차 내 PC 상태 측정 도구 시험(가짜 PowerShell): 단위·잰 시각, 못 읽으면 확인 불가, SDP 따로, IP 안 넣기.
import test from 'node:test';
import assert from 'node:assert/strict';
import { collectPcStatus, formatPcStatus } from '../../on-client/student/pc-status.mjs';

const fixedTime = new Date('2026-10-26T11:10:00.000Z');
const fixedNow = () => new Date(fixedTime);
const successfulRun = async (command) => {
  if (command.startsWith('Get-NetFirewallProfile')) {
    return '[{"Name":"Domain","Enabled":1},{"Name":"Public","Enabled":0}]';
  }
  return '3';
};

test('수집 성공: 방화벽, Windows 기록, CPU·메모리·디스크 단위 확인', async () => {
  const status = await collectPcStatus({ run: successfulRun, now: fixedNow });

  assert.equal(status.firewall.status, 'ok');
  assert.deepEqual(status.firewall.value, [
    { name: 'Domain', enabled: true },
    { name: 'Public', enabled: false },
  ]);
  assert.equal(status.windowsEvents.status, 'ok');
  assert.deepEqual(status.windowsEvents.value, { System: 3, Application: 3 });
  for (const key of ['cpu', 'memory', 'disk']) {
    assert.equal(status[key].status, 'ok');
    assert.equal(typeof status[key].unit, 'string');
    assert.notEqual(status[key].unit, '');
  }
  assert.equal(status.cpu.unit, '%');
  assert.equal(status.memory.unit, 'GB');
  assert.equal(status.disk.unit, 'GB');
});

test('PowerShell 실패 시 방화벽·Windows 기록은 0으로 대체하지 않고 사유를 표시', async () => {
  const status = await collectPcStatus({
    run: async () => { throw new Error('실패'); },
    now: fixedNow,
  });

  for (const key of ['firewall', 'windowsEvents']) {
    assert.equal(status[key].status, 'unavailable');
    assert.equal(typeof status[key].reason, 'string');
    assert.ok(status[key].reason.length > 0);
    assert.notEqual(status[key].value, 0);
  }
});

test('SDP 설정 유무를 연결 상태와 구분', async () => {
  const disconnected = await collectPcStatus({ run: successfulRun, now: fixedNow });
  const configured = await collectPcStatus({ run: successfulRun, now: fixedNow, sdpConfig: { host: 'configured' } });

  assert.equal(disconnected.sdp.label, 'SDP 미연결');
  assert.equal(configured.sdp.label, '확인 불가');
});

test('표시 문구와 네트워크 개인정보 제한 확인', async () => {
  const status = await collectPcStatus({ run: successfulRun, now: fixedNow });
  const text = formatPcStatus(status);

  assert.match(text, /실제로 잰 값/);
  assert.match(text, /침해나 공격 탐지 결과가 아닙니다/);
  assert.match(text, /SDP/);
  assert.doesNotMatch(JSON.stringify(status.network), /\b\d{1,3}(?:\.\d{1,3}){3}\b/);
});

test('측정 시각은 주입한 now() 값을 사용', async () => {
  const status = await collectPcStatus({ run: successfulRun, now: fixedNow });
  const expected = fixedTime.toISOString();

  for (const key of ['cpu', 'memory', 'disk', 'network', 'firewall', 'windowsEvents']) {
    assert.equal(status[key].measuredAt, expected);
  }
});

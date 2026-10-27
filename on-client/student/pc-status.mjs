import { execFile } from 'node:child_process';
import { readFileSync, statfsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

const GB = 1024 ** 3;
const WINDOWS_EVENT_NOTE = '건수는 침해나 공격 탐지 결과가 아닙니다.';

export function runPowerShell(command) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { timeout: 15000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function measured( status, value, unit, measuredAt, source, reason) {
  const result = { status, value, unit, measuredAt, source };
  if (reason) result.reason = reason;
  return result;
}

function unavailable(unit, measuredAt, source, reason, extra = {}) {
  return { ...measured('unavailable', null, unit, measuredAt, source, reason), ...extra };
}

function oneDecimal(value) {
  return Number(value.toFixed(1));
}

function sumCpuTimes(cpus) {
  if (!Array.isArray(cpus) || cpus.length === 0) {
    throw new Error('CPU 표본을 읽을 수 없음');
  }
  return cpus.reduce((total, cpu) => {
    if (!cpu?.times || !Number.isFinite(cpu.times.idle)) {
      throw new Error('CPU 표본 형식이 올바르지 않음');
    }
    const cpuTotal = Object.values(cpu.times).reduce((sum, value) => sum + value, 0);
    if (!Number.isFinite(cpuTotal)) throw new Error('CPU 표본 형식이 올바르지 않음');
    return {
      idle: total.idle + cpu.times.idle,
      total: total.total + cpuTotal,
    };
  }, { idle: 0, total: 0 });
}

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function collectCpu(now) {
  const source = 'node:os cpus 1초 표본';
  try {
    const first = sumCpuTimes(os.cpus());
    await delay(1000);
    const second = sumCpuTimes(os.cpus());
    const elapsed = second.total - first.total;
    const idle = second.idle - first.idle;
    if (elapsed <= 0 || idle < 0 || idle > elapsed) {
      throw new Error('CPU 표본 차이를 계산할 수 없음');
    }
    const usage = oneDecimal(((elapsed - idle) / elapsed) * 100);
    return measured('ok', usage, '%', now().toISOString(), source);
  } catch {
    return unavailable('%', now().toISOString(), source, 'CPU 사용률을 읽을 수 없음');
  }
}

function collectMemory(now) {
  const source = 'node:os totalmem/freemem';
  try {
    const total = os.totalmem();
    const free = os.freemem();
    if (!Number.isFinite(total) || !Number.isFinite(free) || total <= 0 || free < 0 || free > total) {
      throw new Error('메모리 값을 계산할 수 없음');
    }
    const value = {
      usedGB: oneDecimal((total - free) / GB),
      totalGB: oneDecimal(total / GB),
      usedPercent: oneDecimal(((total - free) / total) * 100),
    };
    return measured('ok', value, 'GB', now().toISOString(), source);
  } catch {
    return unavailable('GB', now().toISOString(), source, '메모리 정보를 읽을 수 없음');
  }
}

function collectDisk(now) {
  const source = 'node:fs statfsSync';
  try {
    const systemDrive = process.env.SystemDrive || 'C:';
    const root = systemDrive.endsWith('\\') ? systemDrive : `${systemDrive}\\`;
    const stats = statfsSync(root);
    const totalBytes = stats.bsize * stats.blocks;
    const freeBytes = stats.bsize * stats.bfree;
    if (!Number.isFinite(totalBytes) || !Number.isFinite(freeBytes) || totalBytes <= 0 || freeBytes < 0 || freeBytes > totalBytes) {
      throw new Error('디스크 값을 계산할 수 없음');
    }
    return measured('ok', {
      freeGB: oneDecimal(freeBytes / GB),
      totalGB: oneDecimal(totalBytes / GB),
    }, 'GB', now().toISOString(), source);
  } catch {
    return unavailable('GB', now().toISOString(), source, '시스템 드라이브 정보를 읽을 수 없음');
  }
}

function collectNetwork(now) {
  const source = 'node:os networkInterfaces';
  try {
    const interfaces = os.networkInterfaces();
    const names = Object.entries(interfaces)
      .filter(([, addresses]) => Array.isArray(addresses) && addresses.some((address) =>
        address.internal !== true && (address.family === 'IPv4' || address.family === 4)))
      .map(([name]) => name);
    return measured('ok', { names, count: names.length }, '인터페이스', now().toISOString(), source);
  } catch {
    return unavailable('인터페이스', now().toISOString(), source, '네트워크 인터페이스 정보를 읽을 수 없음');
  }
}

function normalizeFirewallProfiles(stdout) {
  const parsed = JSON.parse(stdout);
  const profiles = Array.isArray(parsed) ? parsed : [parsed];
  return profiles.map((profile) => {
    if (!profile || typeof profile.Name !== 'string') {
      throw new Error('방화벽 프로필 형식이 올바르지 않음');
    }
    let enabled;
    if (profile.Enabled === true || profile.Enabled === 1) enabled = true;
    else if (profile.Enabled === false || profile.Enabled === 0) enabled = false;
    else throw new Error('방화벽 상태 형식이 올바르지 않음');
    return { name: profile.Name, enabled };
  });
}

async function collectFirewall(run, now) {
  const source = 'PowerShell Get-NetFirewallProfile';
  const unit = '프로필';
  try {
    const stdout = await run('Get-NetFirewallProfile | Select-Object Name,Enabled | ConvertTo-Json -Compress');
    const value = normalizeFirewallProfiles(stdout);
    return measured('ok', value, unit, now().toISOString(), source);
  } catch {
    return unavailable(unit, now().toISOString(), source, '방화벽 정보를 읽지 못함(권한 또는 명령 실패 가능)');
  }
}

function parseCount(stdout) {
  const text = String(stdout).trim();
  if (!/^\d+$/.test(text)) throw new Error('이벤트 건수 형식이 올바르지 않음');
  const count = Number(text);
  if (!Number.isSafeInteger(count)) throw new Error('이벤트 건수 범위를 벗어남');
  return count;
}

async function collectWindowsEvents(run, now) {
  const source = 'PowerShell Get-WinEvent 최근 24시간, Level 2·3';
  const unit = '건';
  const extra = { note: WINDOWS_EVENT_NOTE };
  try {
    const value = {};
    for (const logName of ['System', 'Application']) {
      const command = `(Get-WinEvent -FilterHashtable @{LogName='${logName}';Level=2,3;StartTime=(Get-Date).AddHours(-24)} -ErrorAction SilentlyContinue | Measure-Object).Count`;
      value[logName] = parseCount(await run(command));
    }
    return { ...measured('ok', value, unit, now().toISOString(), source), ...extra };
  } catch {
    return unavailable(unit, now().toISOString(), source, 'Windows 기록 건수를 읽지 못함(권한 또는 명령 실패 가능)', extra);
  }
}

export async function collectPcStatus({ run = runPowerShell, now = () => new Date(), sdpConfig = null } = {}) {
  const [cpu, memory, disk, network] = await Promise.all([
    collectCpu(now),
    Promise.resolve(collectMemory(now)),
    Promise.resolve(collectDisk(now)),
    Promise.resolve(collectNetwork(now)),
  ]);
  const firewall = await collectFirewall(run, now);
  const windowsEvents = await collectWindowsEvents(run, now);
  const sdp = sdpConfig == null
    ? { status: 'not_connected', label: 'SDP 미연결', reason: 'SDP 호스트 설정이 지정되지 않음' }
    : { status: 'unknown', label: '확인 불가', reason: '이 도구는 SDP 연결을 확인하지 않음' };

  return { cpu, memory, disk, network, firewall, windowsEvents, sdp };
}

function formatValue(name, item) {
  if (!item || item.status !== 'ok') {
    return `${name}: 확인 불가: ${item?.reason || '정보를 읽을 수 없음'}`;
  }
  let valueText;
  if (name === 'CPU') {
    valueText = `${item.value} ${item.unit}`;
  } else if (name === '메모리') {
    valueText = `사용 ${item.value.usedGB} GB / 전체 ${item.value.totalGB} GB (${item.value.usedPercent}%)`;
  } else if (name === '디스크') {
    valueText = `여유 ${item.value.freeGB} GB / 전체 ${item.value.totalGB} GB`;
  } else if (name === '네트워크') {
    valueText = `IPv4 인터페이스 ${item.value.count}개 (${item.value.names.join(', ') || '없음'})`;
  } else if (name === '방화벽') {
    valueText = item.value.map((profile) => `${profile.name}: ${profile.enabled ? '사용' : '사용 안 함'}`).join(', ') || '프로필 없음';
  } else if (name === 'Windows 기록') {
    valueText = `System ${item.value.System}건, Application ${item.value.Application}건`;
  } else {
    valueText = String(item.value);
  }
  const note = item.note ? ` · ${item.note}` : '';
  return `${name}: ${valueText} · ${item.measuredAt} · 출처: ${item.source}${note}`;
}

export function formatPcStatus(status) {
  const lines = [
    '케셰브 내 PC 상태 — 이 PC에서 실제로 잰 값(예시 값 아님)',
    formatValue('CPU', status.cpu),
    formatValue('메모리', status.memory),
    formatValue('디스크', status.disk),
    formatValue('네트워크', status.network),
    formatValue('방화벽', status.firewall),
    formatValue('Windows 기록', status.windowsEvents),
  ];
  const sdp = status.sdp || { label: '확인 불가', reason: 'SDP 상태 정보가 없음' };
  lines.push(`SDP: ${sdp.label}${sdp.reason ? ` · ${sdp.reason}` : ''}`);
  return lines.join('\n');
}

function parseCliArgs(args) {
  let outputPath = null;
  let sdpConfigPath = null;
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    const value = args[index + 1];
    if ((option === '--out' || option === '--sdp-config') && (!value || value.startsWith('--'))) {
      throw new Error('옵션 형식이 올바르지 않습니다');
    }
    if (option === '--out') {
      outputPath = value;
      index += 1;
    } else if (option === '--sdp-config') {
      sdpConfigPath = value;
      index += 1;
    } else {
      throw new Error('지원하지 않는 옵션입니다');
    }
  }
  return { outputPath, sdpConfigPath };
}

async function runCli() {
  try {
    const { outputPath, sdpConfigPath } = parseCliArgs(process.argv.slice(2));
    let sdpConfig = null;
    if (sdpConfigPath) {
      sdpConfig = JSON.parse(readFileSync(sdpConfigPath, 'utf8'));
    }
    const status = await collectPcStatus({ sdpConfig });
    console.log(formatPcStatus(status));
    if (outputPath) {
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
    }
  } catch {
    console.error('PC 상태 수집 또는 출력에 실패했습니다. 옵션과 읽기 권한을 확인해 주세요.');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runCli();
}

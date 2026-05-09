import { platform } from 'os';
import { spawn, type ChildProcess } from 'child_process';

export type ShellType = 'powershell' | 'cmd' | 'bash' | 'zsh';

export interface PlatformInfo {
  platform: 'win32' | 'linux' | 'darwin' | 'freebsd' | 'netbsd' | 'openbsd';
  isWindows: boolean;
  isLinux: boolean;
  isMac: boolean;
  shell: ShellType;
  shellArg: string;
  pathDelimiter: string;
  lineEnding: string;
}

let _platformInfo: PlatformInfo | null = null;

export function getPlatform(): PlatformInfo {
  if (_platformInfo) return _platformInfo;

  const rawPlatform = platform();
  const p = rawPlatform as PlatformInfo['platform'];
  const isWindows = p === 'win32';
  const isLinux = p === 'linux';
  const isMac = p === 'darwin';

  let shell: ShellType;
  let shellArg: string;

  if (isWindows) {
    shell = 'powershell';
    shellArg = '-Command';
  } else {
    shell = 'bash';
    shellArg = '-c';
  }

  const info: PlatformInfo = {
    platform: p,
    isWindows,
    isLinux,
    isMac,
    shell,
    shellArg,
    pathDelimiter: isWindows ? ';' : ':',
    lineEnding: isWindows ? '\r\n' : '\n',
  };

  _platformInfo = info;
  return info;
}

export async function commandExists(cmd: string): Promise<boolean> {
  if (!cmd || cmd.trim() === '') return false;
  const { isWindows } = getPlatform();
  const testCmd = isWindows ? `where ${cmd}` : `which ${cmd}`;

  try {
    const result = await execAsync(testCmd);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

export async function execAsync(cmd: string, timeoutMs = 30000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const { isWindows, shellArg } = getPlatform();
    const shell = isWindows ? 'powershell' : '/bin/sh';
    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    const proc: ChildProcess = spawn(shell, [shellArg, cmd], { stdio: ['pipe', 'pipe', 'pipe'] });

    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    const stdout: string[] = [];
    const stderr: string[] = [];

    proc.stdout?.on('data', (d: Buffer) => stdout.push(d.toString()));
    proc.stderr?.on('data', (d: Buffer) => stderr.push(d.toString()));
    proc.on('close', (code: number | null) => {
      clearTimeout(timeout);
      resolve({ stdout: stdout.join(''), stderr: stderr.join(''), exitCode: code ?? -1 });
    });
  });
}

export function getShell(): string {
  return getPlatform().isWindows ? 'powershell' : '/bin/sh';
}

export function getShellArg(): string {
  return getPlatform().shellArg;
}
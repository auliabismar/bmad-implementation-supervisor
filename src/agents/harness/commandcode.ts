import { spawn, type ChildProcess } from 'child_process';
import { commandExists } from '../../utils/platform';
import type { AgentConfig, AgentResult, AgentHarness } from './interface';

const EXIT_CODE_UNAVAILABLE = -1;
const EXIT_CODE_TIMEOUT = 124;
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;

const ERROR_PATTERN_ENTRIES: Array<[string, RegExp]> = [
  ['rateLimit', /rate limit|429|too many requests/i],
  ['authFailed', /authentication failed|invalid api key|unauthorized/i],
  ['notFound', /model not found|not found/i],
  ['permissionDenied', /permission denied|access denied/i],
];

export class RetryableError extends Error {
  constructor(message: string, public readonly retryAfterMs?: number) {
    super(message);
    this.name = 'RetryableError';
  }
}

export function buildCommandCodeCommand(config: AgentConfig): string[] {
  const args = [
    '-p', config.prompt,
    '--yolo',
    '--skip-onboarding',
  ];

  if (config.args) {
    args.push(...config.args);
  }

  return args;
}

function detectError(stderr: string): Error | null {
  for (const [name, pattern] of ERROR_PATTERN_ENTRIES) {
    if (pattern.test(stderr)) {
      if (name === 'rateLimit') {
        return new RetryableError(`Rate limited by CommandCode: ${stderr.trim()}`);
      }
      return new Error(`${name}: ${stderr.trim()}`);
    }
  }
  if (stderr.trim().length > 0) {
    return new Error(`Unknown error: ${stderr.trim()}`);
  }
  return null;
}

function extractArtifactsFromText(text: string): string[] {
  const artifacts: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /^created file:\s*(.+)/i,
    /^file created:\s*(.+)/i,
    /^writing\s+(.+?)\.*$/i,
    /^modified:\s*(.+)/i,
    /^updated:\s*(.+)/i,
  ];

  for (const line of text.split(/\r?\n/)) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        let path = match[1].trim().replace(/\r$/, '');
        path = path.replace(/\\/g, '/');
        if (path && !seen.has(path)) {
          seen.add(path);
          artifacts.push(path);
        }
      }
    }
  }

  return artifacts;
}

export class CommandCodeHarness implements AgentHarness {
  readonly type = 'commandcode' as const;

  async invoke(config: AgentConfig): Promise<AgentResult> {
    const startTime = Date.now();

    if (!this.validateConfig(config)) {
      return {
        status: 'failed',
        exitCode: EXIT_CODE_UNAVAILABLE,
        stdout: '',
        stderr: 'Invalid config: prompt, workdir, and timeoutMs (>0) are required',
        durationMs: Date.now() - startTime,
        artifacts: [],
      };
    }

    const cmdExists = await commandExists('cmd');
    if (!cmdExists) {
      return {
        status: 'failed',
        exitCode: EXIT_CODE_UNAVAILABLE,
        stdout: '',
        stderr: 'CommandCode CLI not found. Please install cmd CLI.',
        durationMs: Date.now() - startTime,
        artifacts: [],
      };
    }

    const args = buildCommandCodeCommand(config);
    const envEntries = Object.entries(config.env ?? {}).filter(
      ([, v]) => typeof v === 'string'
    );
    const env = { ...process.env, ...Object.fromEntries(envEntries) };

    try {
      const fs = await import('fs/promises');
      await fs.access(config.workdir);
    } catch {
      return {
        status: 'failed',
        exitCode: EXIT_CODE_UNAVAILABLE,
        stdout: '',
        stderr: `Working directory does not exist: ${config.workdir}`,
        durationMs: Date.now() - startTime,
        artifacts: [],
      };
    }

    let proc: ChildProcess;
    try {
      proc = spawn('cmd', args, {
        cwd: config.workdir,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        env,
      });
    } catch (err) {
      return {
        status: 'failed',
        exitCode: EXIT_CODE_UNAVAILABLE,
        stdout: '',
        stderr: `Failed to spawn cmd: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startTime,
        artifacts: [],
      };
    }

    proc.stdin?.end();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let settled = false;
    let stdoutTruncated = false;
    let stderrTruncated = false;

    return new Promise((resolve) => {
      const timeoutMs = Math.min(config.timeoutMs, 2147483647);
      let sigkillTimeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill('SIGTERM');
        sigkillTimeoutId = setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, 1000);
        resolve({
          status: 'timeout',
          exitCode: EXIT_CODE_TIMEOUT,
          stdout: stdoutChunks.join(''),
          stderr: `Operation timed out after ${timeoutMs}ms`,
          durationMs: Date.now() - startTime,
          artifacts: [],
        });
      }, timeoutMs);

      proc.stdout?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stdoutChunks.join('').length + chunk.length <= MAX_OUTPUT_SIZE) {
          stdoutChunks.push(chunk);
        } else {
          stdoutTruncated = true;
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stderrChunks.join('').length + chunk.length <= MAX_OUTPUT_SIZE) {
          stderrChunks.push(chunk);
        } else {
          stderrTruncated = true;
        }
      });

      proc.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve({
          status: 'failed',
          exitCode: EXIT_CODE_UNAVAILABLE,
          stdout: stdoutChunks.join(''),
          stderr: `Process error: ${err.message}`,
          durationMs: Date.now() - startTime,
          artifacts: [],
        });
      });

      proc.on('close', (code: number | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (sigkillTimeoutId) clearTimeout(sigkillTimeoutId);
        const exitCode = code ?? EXIT_CODE_UNAVAILABLE;
        const stdout = stdoutChunks.join('');
        let stderr = stderrChunks.join('');

        if (stdoutTruncated) {
          stderr += '\n[stdout truncated]';
        }
        if (stderrTruncated) {
          stderr += '\n[stderr truncated]';
        }

        const detectedError = detectError(stderr);
        if (detectedError) {
          resolve({
            status: detectedError instanceof RetryableError ? 'retryable' : 'failed',
            exitCode,
            stdout,
            stderr: detectedError.message,
            durationMs: Date.now() - startTime,
            artifacts: [],
            retryAfterMs: detectedError instanceof RetryableError ? detectedError.retryAfterMs : undefined,
          });
          return;
        }

        const parsed = this.parseOutput(stdout);
        resolve({
          status: exitCode === 0 ? 'completed' : 'failed',
          exitCode,
          stdout: parsed.stdout,
          stderr,
          durationMs: Date.now() - startTime,
          artifacts: parsed.artifacts,
        });
      });
    });
  }

  validateConfig(config: AgentConfig): boolean {
    return !!(
      config.prompt &&
      config.workdir &&
      config.timeoutMs > 0 &&
      Number.isFinite(config.timeoutMs) &&
      config.timeoutMs !== Infinity
    );
  }

  parseOutput(stdout: string): AgentResult {
    const artifacts = extractArtifactsFromText(stdout);

    return {
      status: 'completed',
      exitCode: 0,
      stdout,
      stderr: '',
      durationMs: 0,
      artifacts,
    };
  }
}

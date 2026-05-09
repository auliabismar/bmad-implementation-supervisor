import { spawn, type ChildProcess } from 'child_process';
import { commandExists } from '../../utils/platform';
import type { AgentConfig, AgentResult, AgentHarness } from './interface';

const EXIT_CODE_UNAVAILABLE = -1;
const EXIT_CODE_TIMEOUT = 124;
const MAX_OUTPUT_SIZE = 10 * 1024 * 1024;
const MAX_SAFE_TIMEOUT_MS = 2147483647;
const RATE_LIMIT_RETRY_PATTERN = /retry after (\d+)\s*second/i;

const ERROR_PATTERN_ENTRIES: Array<[string, RegExp]> = [
  ['rateLimit', /rate limit|429|too many requests|quota exceeded|insufficient credits/i],
  ['authFailed', /authentication failed|invalid api key|unauthorized|invalid token/i],
  ['notFound', /model not found|not found|unknown model/i],
  ['permissionDenied', /permission denied|access denied/i],
];

export class RetryableError extends Error {
  constructor(message: string, public readonly retryAfterMs?: number) {
    super(message);
    this.name = 'RetryableError';
  }
}

export function buildOpenCodeCommand(config: AgentConfig): string[] {
  const args = [
    'run',
    '-m', config.model,
    '--json',
    '--dangerously-skip-permissions',
  ];

  if (config.args && Array.isArray(config.args)) {
    args.push(...config.args);
  }

  args.push(config.prompt);
  return args;
}

function detectError(stderr: string | null | undefined): Error | null {
  if (!stderr) return null;
  for (const [name, pattern] of ERROR_PATTERN_ENTRIES) {
    if (pattern.test(stderr)) {
      if (name === 'rateLimit') {
        const retryMatch = stderr.match(RATE_LIMIT_RETRY_PATTERN);
        const retryAfterMs = retryMatch ? parseInt(retryMatch[1], 10) * 1000 : undefined;
        return new RetryableError(`Rate limited by OpenCode: ${stderr.trim()}`, retryAfterMs);
      }
      return new Error(`${name}: ${stderr.trim()}`);
    }
  }
  return null;
}

function extractArtifactsFromText(text: string | null | undefined): string[] {
  if (!text) return [];
  const artifacts: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /^created file:\s*(.+)/i,
    /^modified file:\s*(.+)/i,
    /^writing\s+(.+)/i,
    /^created:\s*(.+)/i,
    /^wrote:\s*(.+)/i,
  ];

  for (const line of text.split(/\r?\n/)) {
    for (const pattern of patterns) {
      const match = line.match(pattern);
      if (match && match[1]) {
        const path = match[1].trim().replace(/\r$/, '');
        if (path && !seen.has(path)) {
          seen.add(path);
          artifacts.push(path);
        }
      }
    }
  }

  return artifacts;
}

export class OpenCodeHarness implements AgentHarness {
  readonly type = 'opencode' as const;

  async invoke(config: AgentConfig): Promise<AgentResult> {
    const startTime = Date.now();

    if (!this.validateConfig(config)) {
      return {
        status: 'failed',
        exitCode: EXIT_CODE_UNAVAILABLE,
        stdout: '',
        stderr: 'Invalid config: model, prompt, workdir, and timeoutMs (>0) are required',
        durationMs: Date.now() - startTime,
        artifacts: [],
      };
    }

    const opencodeExists = await commandExists('opencode');
    if (!opencodeExists) {
      return {
        status: 'failed',
        exitCode: EXIT_CODE_UNAVAILABLE,
        stdout: '',
        stderr: 'OpenCode CLI not found. Please install opencode CLI.',
        durationMs: Date.now() - startTime,
        artifacts: [],
      };
    }

    const args = buildOpenCodeCommand(config);
    let env: Record<string, string>;
    if (config.env && typeof config.env === 'object') {
      const validatedEnv: Record<string, string> = {};
      for (const [key, value] of Object.entries(config.env)) {
        if (typeof value === 'string') {
          validatedEnv[key] = value;
        }
      }
      env = { ...process.env, ...validatedEnv };
    } else {
      env = { ...process.env };
    }

    let proc: ChildProcess;
    try {
      proc = spawn('opencode', args, {
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
        stderr: `Failed to spawn opencode: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startTime,
        artifacts: [],
      };
    }

    proc.stdin?.end();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let stdoutLen = 0;
    let stderrLen = 0;
    let settled = false;
    let resolved = false;

    const abortController = new AbortController();
    const timeoutMs = Math.min(config.timeoutMs, MAX_SAFE_TIMEOUT_MS);
    if (timeoutMs !== config.timeoutMs) {
      console.warn(`Timeout capped from ${config.timeoutMs}ms to ${MAX_SAFE_TIMEOUT_MS}ms`);
    }

    const cleanup = (): void => {
      abortController.abort();
    };

    return new Promise((resolve) => {
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        proc.kill('SIGTERM');
        setTimeout(() => {
          if (!proc.killed) proc.kill('SIGKILL');
        }, 1000);
        resolve({
          status: 'timeout',
          exitCode: EXIT_CODE_TIMEOUT,
          stdout: stdoutChunks.join(''),
          stderr: `Operation timed out after ${config.timeoutMs}ms`,
          durationMs: Date.now() - startTime,
          artifacts: [],
        });
      }, timeoutMs);

      proc.stdout?.on('data', (data: Buffer) => {
        if (settled) return;
        const chunk = data.toString();
        if (stdoutLen + chunk.length <= MAX_OUTPUT_SIZE) {
          stdoutChunks.push(chunk);
          stdoutLen += chunk.length;
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        if (settled) return;
        const chunk = data.toString();
        if (stderrLen + chunk.length <= MAX_OUTPUT_SIZE) {
          stderrChunks.push(chunk);
          stderrLen += chunk.length;
        }
      });

      proc.on('exit', (code: number | null, signal: string | null) => {
        if (signal && !settled) {
          cleanup();
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
        const exitCode = code ?? EXIT_CODE_UNAVAILABLE;
        const stdout = stdoutChunks.join('');
        const stderr = stderrChunks.join('');

        const detectedError = detectError(stderr);
        if (detectedError) {
          resolve({
            status: detectedError instanceof RetryableError ? 'retryable' : 'failed',
            exitCode,
            stdout,
            stderr: detectedError.message,
            durationMs: Date.now() - startTime,
            artifacts: this.parseOutput(stdout).artifacts,
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

  validateConfig(config: AgentConfig | null | undefined): boolean {
    if (!config) return false;
    const modelFormat = /^[^\/]+\/[^\/]+$/;
    return !!(
      config.model &&
      typeof config.model === 'string' &&
      modelFormat.test(config.model) &&
      config.prompt &&
      config.workdir &&
      config.timeoutMs > 0 &&
      Number.isFinite(config.timeoutMs) &&
      config.timeoutMs !== Infinity
    );
  }

  parseOutput(stdout: string | null | undefined): AgentResult {
    if (stdout == null) {
      return { status: 'completed', exitCode: 0, stdout: '', stderr: '', durationMs: 0, artifacts: [] };
    }

    const artifacts: string[] = [];
    const seen = new Set<string>();

    const extractArtifacts = (artifactsArr: unknown): void => {
      if (Array.isArray(artifactsArr)) {
        for (const path of artifactsArr) {
          if (typeof path === 'string' && !seen.has(path)) {
            seen.add(path);
            artifacts.push(path);
          }
        }
      }
    };

    try {
      const obj = JSON.parse(stdout);

      if (obj.status) {
        extractArtifacts(obj.artifacts);

        const output = String(obj.stdout ?? obj.output ?? obj.message ?? '');
        const errorOutput = String(obj.stderr ?? '');

        return {
          status: obj.status === 'completed' ? 'completed' : 'failed',
          exitCode: obj.status === 'completed' ? 0 : 1,
          stdout: output,
          stderr: errorOutput,
          durationMs: 0,
          artifacts,
        };
      }

      extractArtifacts(obj.artifacts);

      return {
        status: 'completed',
        exitCode: 0,
        stdout: JSON.stringify(obj),
        stderr: '',
        durationMs: 0,
        artifacts,
      };
    } catch {
      const textArtifacts = extractArtifactsFromText(stdout);
      for (const path of textArtifacts) {
        if (!seen.has(path)) {
          seen.add(path);
          artifacts.push(path);
        }
      }

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
}
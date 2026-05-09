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
  ['timeout', /timed out|timeout/i],
];

export class RetryableError extends Error {
  constructor(message: string, public readonly retryAfterMs?: number) {
    super(message);
    this.name = 'RetryableError';
  }
}

const ERROR_PATTERNS = {
  rateLimit: /rate limit|429|too many requests/i,
  authFailed: /authentication failed|invalid api key|unauthorized/i,
  notFound: /model not found|not found/i,
  timeout: /timed out|timeout/i,
};

export function buildCodexCommand(config: AgentConfig): string[] {
  const args = [
    'exec',
    '-m', config.model,
    '--sandbox', 'workspace-write',
    '--ask-for-approval', 'never',
  ];

  if (config.args) {
    args.push(...config.args);
  }

  args.push(config.prompt);
  return args;
}

function detectError(stderr: string): Error | null {
  for (const [name, pattern] of ERROR_PATTERN_ENTRIES) {
    if (pattern.test(stderr)) {
      if (name === 'rateLimit') {
        return new RetryableError(`Rate limited by Codex: ${stderr.trim()}`);
      }
      return new Error(`${name}: ${stderr.trim()}`);
    }
  }
  return null;
}

function extractArtifactsFromText(text: string): string[] {
  const artifacts: string[] = [];
  const seen = new Set<string>();
  const patterns = [
    /^created file:\s*(.+)/i,
    /^modified file:\s*(.+)/i,
    /^writing\s+(.+)/i,
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

export class CodexHarness implements AgentHarness {
  readonly type = 'codex' as const;

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

    const codexExists = await commandExists('codex');
    if (!codexExists) {
      return {
        status: 'failed',
        exitCode: EXIT_CODE_UNAVAILABLE,
        stdout: '',
        stderr: 'Codex CLI not found. Please install codex CLI.',
        durationMs: Date.now() - startTime,
        artifacts: [],
      };
    }

    const args = buildCodexCommand(config);
    const env = { ...process.env, ...config.env };

    let proc: ChildProcess;
    try {
      proc = spawn('codex', args, {
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
        stderr: `Failed to spawn codex: ${err instanceof Error ? err.message : String(err)}`,
        durationMs: Date.now() - startTime,
        artifacts: [],
      };
    }

    proc.stdin?.end();

    const stdoutChunks: string[] = [];
    const stderrChunks: string[] = [];
    let settled = false;

    return new Promise((resolve) => {
      const timeoutMs = Math.min(config.timeoutMs, 2147483647);
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
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
        const chunk = data.toString();
        if (stdoutChunks.join('').length + chunk.length <= MAX_OUTPUT_SIZE) {
          stdoutChunks.push(chunk);
        }
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        if (stderrChunks.join('').length + chunk.length <= MAX_OUTPUT_SIZE) {
          stderrChunks.push(chunk);
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

  validateConfig(config: AgentConfig): boolean {
    return !!(
      config.model &&
      config.prompt &&
      config.workdir &&
      config.timeoutMs > 0 &&
      Number.isFinite(config.timeoutMs) &&
      config.timeoutMs !== Infinity
    );
  }

  parseOutput(stdout: string): AgentResult {
    const lines = stdout.split('\n').filter(Boolean);
    const artifacts: string[] = [];
    const seen = new Set<string>();
    const messages: string[] = [];

    for (const line of lines) {
      try {
        const obj = JSON.parse(line);

        if (obj.type === 'text' && obj.content) {
          messages.push(obj.content);
        } else if (obj.type === 'artifact' && obj.path) {
          if (!seen.has(obj.path)) {
            seen.add(obj.path);
            artifacts.push(obj.path);
          }
        } else if (obj.type === 'message' && obj.content) {
          messages.push(obj.content);
        }
      } catch {
        messages.push(line);
      }
    }

    const textArtifacts = extractArtifactsFromText(messages.join('\n'));
    for (const path of textArtifacts) {
      if (!seen.has(path)) {
        seen.add(path);
        artifacts.push(path);
      }
    }

    return {
      status: 'completed',
      exitCode: 0,
      stdout: messages.join('\n'),
      stderr: '',
      durationMs: 0,
      artifacts,
    };
  }
}
import { getConfig, type SupervisorConfig } from '../config';
import type { AgentConfig, AgentResult, HarnessType, AgentHarness } from './harness/interface';
import { CodexHarness } from './harness/codex';
import { OpenCodeHarness } from './harness/opencode';
import { CommandCodeHarness } from './harness/commandcode';
import { classifyError, classifyFromStatus, ErrorType, FallbackExhaustedError } from '../errors/classifier';

export type WorkflowType = 'create_story' | 'dev_story' | 'code_review';

export interface InvokerOptions {
  harness?: HarnessType;
  model?: string;
  timeoutMs?: number;
  workdir?: string;
  prompt?: string;
  skill?: string;
  args?: string[] | null;
}

export class AgentInvoker {
  private harnesses: Map<HarnessType, AgentHarness>;
  private config: SupervisorConfig;

  private static readonly EXPECTED_POOL_ORDER: HarnessType[] = ['codex', 'opencode', 'commandcode'];

  constructor(config?: SupervisorConfig, skipPoolValidation = false) {
    this.config = config ?? getConfig();
    this.harnesses = new Map<HarnessType, AgentHarness>();
    this.harnesses.set('codex', new CodexHarness());
    this.harnesses.set('opencode', new OpenCodeHarness());
    this.harnesses.set('commandcode', new CommandCodeHarness());
    if (!skipPoolValidation) {
      this.validatePoolOrder();
    }
  }

  private validatePoolOrder(): void {
    const workflows: WorkflowType[] = ['create_story', 'dev_story', 'code_review'];
    for (const workflow of workflows) {
      const pool = this.config.model_pool[workflow];
      if (!pool || pool.length === 0) continue;

      for (let i = 0; i < pool.length; i++) {
        const expected = AgentInvoker.EXPECTED_POOL_ORDER[i];
        if (!expected) break;
        const actual = pool[i].harness;
        if (actual !== expected) {
          throw new Error(
            `model_pool[${workflow}][${i}] harness must be '${expected}' but got '${actual}'. ` +
            `Fallback chain order is enforced: codex → opencode → commandcode.`
          );
        }
      }
    }
  }

  async invoke(
    workflow: WorkflowType,
    options: InvokerOptions = {}
  ): Promise<AgentResult> {
    let defaultConfig: { harness: HarnessType; model: string; timeout_ms: number };
    try {
      defaultConfig = this.getWorkflowConfig(workflow);
    } catch (error) {
      return this.createErrorResult(
        error instanceof Error ? error.message : String(error)
      );
    }

    const timeoutMs = options.timeoutMs ?? defaultConfig.timeout_ms;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      return this.createErrorResult(`Invalid timeoutMs: ${timeoutMs}`);
    }

    const config: AgentConfig = {
      harness: options.harness ?? defaultConfig.harness,
      model: options.model ?? defaultConfig.model,
      timeoutMs,
      workdir: options.workdir ?? process.cwd(),
      prompt: options.prompt ?? '',
      skill: options.skill,
      args: options.args ?? undefined,
    };

    if (!config.model) {
      return this.createErrorResult('model is required');
    }

    const harness = this.harnesses.get(config.harness);
    if (!harness) {
      return this.createErrorResult(`Unknown harness: ${config.harness}`);
    }

    if (!harness.validateConfig(config)) {
      return this.createErrorResult(`Invalid config for ${config.harness}`);
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(new Error(`Timeout after ${config.timeoutMs}ms`));
      }, config.timeoutMs);
    });

    try {
      const result = await Promise.race([harness.invoke(config), timeoutPromise]);
      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.message.includes('Timeout')) {
        return {
          status: 'timeout',
          exitCode: -1,
          stdout: '',
          stderr: error.message,
          durationMs: config.timeoutMs,
          artifacts: [],
        };
      }
      return this.createErrorResult(
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  private getWorkflowConfig(workflow: WorkflowType) {
    const workflows = this.config.workflows as Record<WorkflowType, {
      harness: HarnessType;
      model: string;
      timeout_ms: number;
    }>;
    const config = workflows[workflow];
    if (!config) {
      throw new Error(`Unknown workflow: ${workflow}`);
    }
    return config;
  }

  private createErrorResult(message: string): AgentResult {
    return {
      status: 'failed',
      exitCode: -1,
      stdout: '',
      stderr: message,
      durationMs: 0,
      artifacts: [],
    };
  }

  /**
   * Invoke a workflow with automatic fallback through the model pool.
   * 
   * Tries each model/harness combination from model_pool[workflow] in order until
   * one completes successfully or the pool is exhausted. Respects max_retries_per_story
   * as a limit on total attempts (initial + fallbacks). Logs each attempt for observability.
   * 
   * - RETRYABLE errors (rate limit, timeout): move to next pool entry
   * - RECOVERABLE errors (model not found, CLI missing): move to next pool entry
   * - FATAL errors (auth failure, permission denied): return immediately with failure
   * 
   * Throws FallbackExhaustedError if all pool entries fail without success.
   * 
   * @param workflow - The workflow type
   * @param options - Optional overrides
   * @returns AgentResult from successful or fatal attempt
   * @throws FallbackExhaustedError when all fallbacks exhausted
   */
  async invokeWithFallback(
    workflow: WorkflowType,
    options: InvokerOptions = {}
  ): Promise<AgentResult> {
    const modelPool = this.config.model_pool[workflow];
    if (!modelPool || modelPool.length === 0) {
      console.warn(`[Fallback] workflow=${workflow}: model_pool empty or missing, falling back to single-model mode`);
      return this.invoke(workflow, options);
    }

    const maxAttempts = this.config.health.max_retries_per_story;
    let attempts = 0;
    let lastError: Error | null = null;

    for (const entry of modelPool) {
      if (attempts >= maxAttempts) {
        console.log(`[Fallback] workflow=${workflow} max attempts (${maxAttempts}) reached, stopping fallback chain`);
        break;
      }

      attempts++;
      const entryConfig: InvokerOptions = {
        harness: entry.harness,
        model: entry.model,
        timeoutMs: options.timeoutMs,
        workdir: options.workdir,
        prompt: options.prompt,
        skill: options.skill,
        args: options.args,
      };

      if (!this.harnesses.has(entry.harness)) {
        lastError = new Error(`Harness '${entry.harness}' not found. Available: ${[...this.harnesses.keys()].join(', ')}`);
        console.log(`[Fallback] workflow=${workflow} attempt=${attempts} skipped: ${lastError.message}`);
        continue;
      }

      console.log(`[Fallback] workflow=${workflow} attempt=${attempts}/${maxAttempts} harness=${entry.harness} model=${entry.model}`);

      try {
        const result = await this.invoke(workflow, entryConfig);
        if (result.status === 'completed') {
          return result;
        }

        // Failure - classify
        const errorType = classifyFromStatus(result.status, result.stderr ?? undefined);
        const error = new Error(result.stderr || `Workflow failed with status: ${result.status}`);
        lastError = error;

        console.log(`[Fallback] workflow=${workflow} attempt=${attempts} failed: status=${result.status} errorType=${errorType} reason="${result.stderr?.substring(0, 100) || 'unknown'}"`);

        if (errorType === ErrorType.FATAL) {
          console.log(`[Fallback] workflow=${workflow} FATAL error, aborting fallback chain`);
          return result;
        }

        // Non-fatal: continue to next pool entry if any (loop will continue)
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.log(`[Fallback] workflow=${workflow} attempt=${attempts} threw exception: ${lastError.message}`);
        // Continue to next entry
      }
    }

    // Exhausted pool or max attempts
    if (lastError) {
      throw new FallbackExhaustedError(attempts, lastError);
    }
    throw new FallbackExhaustedError(attempts, new Error('Unknown fallback failure'));
  }
}

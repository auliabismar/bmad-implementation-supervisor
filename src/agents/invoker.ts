import { getConfig, type SupervisorConfig } from '../config';
import type { AgentConfig, AgentResult, HarnessType, AgentHarness } from './harness/interface';
import { CodexHarness } from './harness/codex';
import { OpenCodeHarness } from './harness/opencode';
import { CommandCodeHarness } from './harness/commandcode';

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

  constructor(config?: SupervisorConfig) {
    this.config = config ?? getConfig();
    this.harnesses = new Map<HarnessType, AgentHarness>();
    this.harnesses.set('codex', new CodexHarness());
    this.harnesses.set('opencode', new OpenCodeHarness());
    this.harnesses.set('commandcode', new CommandCodeHarness());
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
}

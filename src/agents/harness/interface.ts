export type HarnessType = 'codex' | 'opencode' | 'commandcode';

export type AgentStatus = 'completed' | 'failed' | 'timeout' | 'needs_input';

export interface AgentConfig {
  harness: HarnessType;
  model: string;
  prompt: string;
  timeoutMs: number;
  workdir: string;
  skill?: string;
  args?: string[];
}

export interface AgentResult {
  status: AgentStatus;
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  artifacts: string[];
}

export interface AgentHarness {
  readonly type: HarnessType;

  invoke(config: AgentConfig): Promise<AgentResult>;

  validateConfig(config: AgentConfig): boolean;

  parseOutput(stdout: string): AgentResult;
}
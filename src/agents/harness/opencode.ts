import type { AgentConfig, AgentResult, AgentHarness } from './interface';

export class OpenCodeHarness implements AgentHarness {
  readonly type = 'opencode' as const;

  async invoke(_config: AgentConfig): Promise<AgentResult> {
    throw new Error('OpenCode harness not implemented - see E2-3');
  }

  validateConfig(_config: AgentConfig): boolean {
    return true;
  }

  parseOutput(_stdout: string): AgentResult {
    throw new Error('OpenCode harness not implemented - see E2-3');
  }
}
import type { AgentConfig, AgentResult, AgentHarness } from './interface';

export class CodexHarness implements AgentHarness {
  readonly type = 'codex' as const;

  async invoke(_config: AgentConfig): Promise<AgentResult> {
    throw new Error('Codex harness not implemented - see E2-2');
  }

  validateConfig(_config: AgentConfig): boolean {
    return true;
  }

  parseOutput(_stdout: string): AgentResult {
    throw new Error('Codex harness not implemented - see E2-2');
  }
}
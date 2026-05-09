import type { AgentConfig, AgentResult, AgentHarness } from './interface';

export class CommandCodeHarness implements AgentHarness {
  readonly type = 'commandcode' as const;

  async invoke(_config: AgentConfig): Promise<AgentResult> {
    throw new Error('CommandCode harness not implemented - see E2-4');
  }

  validateConfig(_config: AgentConfig): boolean {
    return true;
  }

  parseOutput(_stdout: string): AgentResult {
    throw new Error('CommandCode harness not implemented - see E2-4');
  }
}
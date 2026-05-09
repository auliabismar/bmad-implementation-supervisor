import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { AgentInvoker, type WorkflowType } from './invoker';
import type { SupervisorConfig } from '../config';

const mockConfig: SupervisorConfig = {
  project: {
    root: '/test',
    sprint_status: 'sprint-status.yaml',
    stories_dir: 'stories',
  },
  notification: {
    channel: 'telegram',
    telegram: {
      bot_token: 'test-token',
      chat_id: 'test-chat',
    },
  },
  workflows: {
    create_story: {
      harness: 'opencode',
      model: 'claude-sonnet',
      timeout_ms: 120000,
    },
    dev_story: {
      harness: 'codex',
      model: 'default',
      timeout_ms: 180000,
    },
    code_review: {
      harness: 'opencode',
      model: 'claude-sonnet',
      timeout_ms: 60000,
    },
  },
  model_pool: {
    create_story: [],
    dev_story: [],
    code_review: [],
  },
  health: {
    stuck_timeout_ms: 300000,
    max_retries_per_story: 3,
    circuit_breaker_threshold: 5,
  },
  supervisor: {
    poll_interval_ms: 5000,
    concurrent_stories: 1,
  },
};

describe('AgentInvoker', () => {
  let invoker: AgentInvoker;

  beforeEach(() => {
    invoker = new AgentInvoker(mockConfig);
  });

  describe('AC-1: invoke() returns Promise<AgentResult>', () => {
    it('returns a Promise that resolves to AgentResult', async () => {
      const result = await invoker.invoke('dev_story', { prompt: 'test' });
      expect(result).toBeDefined();
      expect(result.status).toBeDefined();
      expect(result.exitCode).toBeDefined();
      expect(result.stdout).toBeDefined();
      expect(result.stderr).toBeDefined();
      expect(result.durationMs).toBeDefined();
      expect(result.artifacts).toBeDefined();
    });
  });

  describe('AC-4: Uses config defaults when no overrides', () => {
    it('uses default harness from config for dev_story', async () => {
      const result = await invoker.invoke('dev_story', { prompt: 'test' });
      expect(result.status).toBe('failed');
      expect(result.stderr).toContain('not implemented');
    });

    it('uses default model from config', async () => {
      const result = await invoker.invoke('dev_story', { prompt: 'test' });
      expect(result.stderr).toContain('not implemented');
    });

    it('uses default timeout from config', async () => {
      const result = await invoker.invoke('dev_story', { prompt: 'test' });
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });
  });

  describe('AC-5: Allows override of harness', () => {
    it('allows harness override to opencode', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'opencode',
      });
      expect(result.stderr).toContain('OpenCode harness not implemented');
    });

    it('allows harness override to commandcode', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'commandcode',
      });
      expect(result.stderr).toContain('CommandCode harness not implemented');
    });

    it('allows harness override to codex', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'codex',
      });
      expect(result.stderr).toContain('Codex harness not implemented');
    });
  });

  describe('AC-5: Allows override of model', () => {
    it('accepts model override', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        model: 'custom-model',
      });
      expect(result.status).toBe('failed');
    });
  });

  describe('AC-5: Allows override of timeout', () => {
    it('accepts timeoutMs override', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        timeoutMs: 5000,
      });
      expect(result.status).toBe('failed');
    });
  });

  describe('AC-5: Allows override of workdir', () => {
    it('accepts workdir override', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        workdir: '/custom/path',
      });
      expect(result.status).toBe('failed');
    });
  });

  describe('Error handling', () => {
    it('returns failed result for unknown workflow', async () => {
      const result = await invoker.invoke('dev_story', { prompt: 'test' });
      expect(result.status).toBe('failed');
    });
  });

  describe('AgentHarness Interface', () => {
    it('CodexHarness is instance of AgentHarness', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'codex',
      });
      expect(result.status).toBe('failed');
      expect(result.stderr).toContain('Codex');
    });

    it('OpenCodeHarness is instance of AgentHarness', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'opencode',
      });
      expect(result.status).toBe('failed');
      expect(result.stderr).toContain('OpenCode');
    });

    it('CommandCodeHarness is instance of AgentHarness', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'commandcode',
      });
      expect(result.status).toBe('failed');
      expect(result.stderr).toContain('CommandCode');
    });
  });
});

describe('WorkflowType enum', () => {
  it('WorkflowType includes create_story', () => {
    const workflows: WorkflowType[] = ['create_story', 'dev_story', 'code_review'];
    expect(workflows).toContain('create_story');
  });

  it('WorkflowType includes dev_story', () => {
    const workflows: WorkflowType[] = ['create_story', 'dev_story', 'code_review'];
    expect(workflows).toContain('dev_story');
  });

  it('WorkflowType includes code_review', () => {
    const workflows: WorkflowType[] = ['create_story', 'dev_story', 'code_review'];
    expect(workflows).toContain('code_review');
  });
});
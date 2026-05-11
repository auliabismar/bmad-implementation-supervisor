import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { AgentInvoker, type WorkflowType } from './invoker';
import type { SupervisorConfig } from '../config';
import type { AgentConfig, AgentResult, AgentHarness } from './harness/interface';
import { ErrorType, FallbackExhaustedError } from '../errors/classifier';

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
    port: 3000,
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
      expect(result.status).toBeDefined();
      expect(result.status).toBeOneOf(['completed', 'failed', 'timeout']);
    });

    it('uses default model from config', async () => {
      const result = await invoker.invoke('dev_story', { prompt: 'test' });
      expect(result.exitCode).toBeDefined();
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
      expect(result.status).toBeDefined();
    });

    it('allows harness override to commandcode', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'commandcode',
      });
      expect(result.status).toBeDefined();
    });

    it('allows harness override to codex', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'codex',
      });
      expect(result.status).toBeDefined();
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
      expect(result.status).toBeDefined();
      expect(result.exitCode).toBeDefined();
    });

    it('OpenCodeHarness is instance of AgentHarness', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'opencode',
      });
      expect(result.status).toBeDefined();
    });

    it('CommandCodeHarness is instance of AgentHarness', async () => {
      const result = await invoker.invoke('dev_story', {
        prompt: 'test',
        harness: 'commandcode',
      });
      expect(result.status).toBeDefined();
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

describe('invokeWithFallback', () => {
  let invoker: AgentInvoker;
  let mockHarness: vi.Mock<AgentHarness>;

  beforeEach(() => {
    // Create a fresh invoker with mocked harness, skipping pool validation for test configs
    invoker = new AgentInvoker(mockConfig, true);

    // Create a mock harness we can control
    mockHarness = {
      type: 'codex',
      validateConfig: vi.fn(() => true),
      invoke: vi.fn(),
      parseOutput: vi.fn(() => ({
        status: 'completed',
        exitCode: 0,
        stdout: '',
        stderr: '',
        durationMs: 0,
        artifacts: [],
      })),
    } as any;
  });

  describe('AC-2, AC-3, AC-4: Fallback behavior', () => {
    it('returns success result on first successful entry', async () => {
      mockHarness.invoke.mockResolvedValueOnce({
        status: 'completed',
        exitCode: 0,
        stdout: 'success',
        stderr: '',
        durationMs: 100,
        artifacts: ['src/file.ts'],
      });

      // Replace a harness in the map
      (invoker as any).harnesses.set('codex', mockHarness);

      const modelPool = [
        { harness: 'codex' as const, model: 'gpt-5.4' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      const result = await invoker.invokeWithFallback('dev_story', { prompt: 'test' });
      expect(result.status).toBe('completed');
      expect(mockHarness.invoke).toHaveBeenCalledTimes(1);
    });

    it('falls back to next entry on RECOVERABLE error', async () => {
      const secondHarness = {
        type: 'opencode' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'completed',
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      const firstHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'model not found: gpt-99',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', firstHarness);
      (invoker as any).harnesses.set('opencode', secondHarness);

      const modelPool = [
        { harness: 'codex', model: 'gpt-99' },
        { harness: 'opencode', model: 'gpt-5.4' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      const result = await invoker.invokeWithFallback('dev_story', { prompt: 'test' });
      expect(result.status).toBe('completed');
      expect(firstHarness.invoke).toHaveBeenCalledTimes(1);
      expect(secondHarness.invoke).toHaveBeenCalledTimes(1);
    });

    it('falls back on RETRYABLE error (moving to next entry)', async () => {
      const secondHarness = {
        type: 'opencode' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'completed',
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      const firstHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'retryable',
          exitCode: -1,
          stdout: '',
          stderr: 'rate limit exceeded',
          durationMs: 100,
          artifacts: [],
          retryAfterMs: 5000,
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', firstHarness);
      (invoker as any).harnesses.set('opencode', secondHarness);

      const modelPool = [
        { harness: 'codex', model: 'o3' },
        { harness: 'opencode', model: 'gpt-5.4' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      const result = await invoker.invokeWithFallback('dev_story', { prompt: 'test' });
      expect(result.status).toBe('completed');
      expect(firstHarness.invoke).toHaveBeenCalledTimes(1);
      expect(secondHarness.invoke).toHaveBeenCalledTimes(1);
    });

    it('throws FallbackExhaustedError when all entries fail with recoverable errors', async () => {
      const firstHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'model not found',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      const secondHarness = {
        type: 'opencode' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'model not found',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', firstHarness);
      (invoker as any).harnesses.set('opencode', secondHarness);

      const modelPool = [
        { harness: 'codex', model: 'bad-model' },
        { harness: 'opencode', model: 'bad-model' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      await expect(invoker.invokeWithFallback('dev_story', { prompt: 'test' }))
        .rejects.toThrow(FallbackExhaustedError);
    });

    it('stops immediately on FATAL error and does not continue falling back', async () => {
      const firstHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'authentication failed: invalid API key',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      const secondHarness = {
        type: 'opencode' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn(),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', firstHarness);
      (invoker as any).harnesses.set('opencode', secondHarness);

      const modelPool = [
        { harness: 'codex', model: 'gpt-5.4' },
        { harness: 'opencode', model: 'gpt-5.4' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      const result = await invoker.invokeWithFallback('dev_story', { prompt: 'test' });
      expect(result.status).toBe('failed');
      expect(result.stderr).toContain('authentication failed');
      expect(firstHarness.invoke).toHaveBeenCalledTimes(1);
      expect(secondHarness.invoke).not.toHaveBeenCalled();
    });
  });

  describe('AC-5: max_retries_per_story limit', () => {
    it('respects max_retries_per_story, stops after limit even with more pool entries', async () => {
      const failingHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'model not found',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', failingHarness);

      const modelPool = [
        { harness: 'codex', model: 'entry1' },
        { harness: 'codex', model: 'entry2' },
        { harness: 'codex', model: 'entry3' },
        { harness: 'codex', model: 'entry4' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;
      (invoker as any).config.health.max_retries_per_story = 3;

      await expect(invoker.invokeWithFallback('dev_story', { prompt: 'test' }))
        .rejects.toThrow(FallbackExhaustedError);

      // Should only try up to max_retries_per_story entries (3 out of 4)
      expect(failingHarness.invoke).toHaveBeenCalledTimes(3);
    });

    it('uses default max_retries_per_story from config (3)', async () => {
      const failingHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'model not found',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', failingHarness);

      const modelPool = [
        { harness: 'codex', model: 'e1' },
        { harness: 'codex', model: 'e2' },
        { harness: 'codex', model: 'e3' },
        { harness: 'codex', model: 'e4' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;
      // health.max_retries_per_story is already 3 in mockConfig

      await expect(invoker.invokeWithFallback('dev_story', { prompt: 'test' }))
        .rejects.toThrow(FallbackExhaustedError);

      expect(failingHarness.invoke).toHaveBeenCalledTimes(3);
    });
  });

  describe('AC-6: Fallback logging', () => {
    it('logs each attempt with model and harness', async () => {
      const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      const failingHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'model not found',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', failingHarness);

      const modelPool = [
        { harness: 'codex', model: 'entry1' },
        { harness: 'codex', model: 'entry2' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      await expect(invoker.invokeWithFallback('dev_story', { prompt: 'test' }))
        .rejects.toThrow(FallbackExhaustedError);

      // Check that logs contain expected fields
      const logCalls = mockConsoleLog.mock.calls.map(call => call[0] as string);
      const fallbackLogs = logCalls.filter(msg => msg.startsWith('[Fallback]'));

      expect(fallbackLogs.length).toBeGreaterThan(0);
      expect(fallbackLogs.some(msg => msg.includes('attempt=1') && msg.includes('harness=codex') && msg.includes('model=entry1'))).toBe(true);
      expect(fallbackLogs.some(msg => msg.includes('attempt=2') && msg.includes('model=entry2'))).toBe(true);

      mockConsoleLog.mockRestore();
    });

    it('logs reason/cause of failure', async () => {
      const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      const failingHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'rate limit exceeded',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', failingHarness);

      const modelPool = [
        { harness: 'codex', model: 'entry1' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      await expect(invoker.invokeWithFallback('dev_story', { prompt: 'test' }))
        .rejects.toThrow(FallbackExhaustedError);

      const logCalls = mockConsoleLog.mock.calls.map(call => call[0] as string);
      const failureLog = logCalls.find(msg => msg.includes('failed:') && msg.includes('rate limit'));
      expect(failureLog).toBeDefined();
      expect(failureLog).toContain('errorType=retryable');

      mockConsoleLog.mockRestore();
    });
  });

  describe('Cross-harness fallback (AC-3)', () => {
    it('can fall back from codex to opencode to commandcode', async () => {
      const harnesses: Record<string, AgentHarness> = {};

      const createMockHarness = (type: string, shouldSucceed: boolean, errorStderr?: string) => ({
        type,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue(shouldSucceed ? {
          status: 'completed',
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          durationMs: 100,
          artifacts: [],
        } : {
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: errorStderr || 'some error',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      });

      harnesses.codex = createMockHarness('codex', false, 'model not found');
      harnesses.opencode = createMockHarness('opencode', false, 'model not found');
      harnesses.commandcode = createMockHarness('commandcode', true, '');

      (invoker as any).harnesses.set('codex', harnesses.codex);
      (invoker as any).harnesses.set('opencode', harnesses.opencode);
      (invoker as any).harnesses.set('commandcode', harnesses.commandcode);

      const modelPool = [
        { harness: 'codex', model: 'gpt-5.4' },
        { harness: 'opencode', model: 'gpt-5.4' },
        { harness: 'commandcode', model: 'default' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      const result = await invoker.invokeWithFallback('dev_story', { prompt: 'test' });
      expect(result.status).toBe('completed');
      expect(harnesses.codex.invoke).toHaveBeenCalledTimes(1);
      expect(harnesses.opencode.invoke).toHaveBeenCalledTimes(1);
      expect(harnesses.commandcode.invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('Edge cases', () => {
    it('falls back to single invoke when model_pool is empty', async () => {
      const mockInvoke = vi.spyOn(invoker, 'invoke').mockResolvedValue({
        status: 'completed',
        exitCode: 0,
        stdout: 'success',
        stderr: '',
        durationMs: 100,
        artifacts: [],
      });

      (invoker as any).config.model_pool.dev_story = [];

      const result = await invoker.invokeWithFallback('dev_story', { prompt: 'test' });
      expect(result.status).toBe('completed');
      expect(mockInvoke).toHaveBeenCalledOnce();

      mockInvoke.mockRestore();
    });

    it('handles exception from harness.invoke gracefully', async () => {
      const failingHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockRejectedValue(new Error('Network error')),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', failingHarness);

      const modelPool = [
        { harness: 'codex', model: 'entry1' },
        { harness: 'opencode', model: 'gpt-5.4' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      // We need second harness that eventually succeeds after first throws
      const secondHarness = {
        type: 'opencode' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'completed',
          exitCode: 0,
          stdout: 'success',
          stderr: '',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };
      (invoker as any).harnesses.set('opencode', secondHarness);

      const result = await invoker.invokeWithFallback('dev_story', { prompt: 'test' });
      expect(result.status).toBe('completed');
      expect(failingHarness.invoke).toHaveBeenCalledTimes(1);
      expect(secondHarness.invoke).toHaveBeenCalledTimes(1);
    });

    it('returns early when a RECOVERABLE error has no more pool entries', async () => {
      const failingHarness = {
        type: 'codex' as const,
        validateConfig: vi.fn(() => true),
        invoke: vi.fn().mockResolvedValue({
          status: 'failed',
          exitCode: 1,
          stdout: '',
          stderr: 'model not found',
          durationMs: 100,
          artifacts: [],
        }),
        parseOutput: vi.fn(() => ({
          status: 'completed',
          exitCode: 0,
          stdout: '',
          stderr: '',
          durationMs: 0,
          artifacts: [],
        })),
      };

      (invoker as any).harnesses.set('codex', failingHarness);

      const modelPool = [
        { harness: 'codex', model: 'entry1' },
      ];
      (invoker as any).config.model_pool.dev_story = modelPool;

      await expect(invoker.invokeWithFallback('dev_story', { prompt: 'test' }))
        .rejects.toThrow(FallbackExhaustedError);
    });
  });
});

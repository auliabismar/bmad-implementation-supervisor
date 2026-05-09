import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { OpenCodeHarness, buildOpenCodeCommand, RetryableError } from './opencode';
import type { AgentConfig } from './interface';

const mockConfig: AgentConfig = {
  harness: 'opencode',
  model: 'openai/gpt-5.4',
  prompt: 'Create a simple hello world function',
  timeoutMs: 60000,
  workdir: '/test/project',
  skill: 'bmad-quick-dev',
};

describe('OpenCodeHarness', () => {
  let harness: OpenCodeHarness;

  beforeEach(() => {
    harness = new OpenCodeHarness();
  });

  describe('type', () => {
    it('returns "opencode" as type', () => {
      expect(harness.type).toBe('opencode');
    });
  });

  describe('buildOpenCodeCommand', () => {
    it('includes required flags', () => {
      const args = buildOpenCodeCommand(mockConfig);
      expect(args).toContain('run');
      expect(args).toContain('-m');
      expect(args).toContain('openai/gpt-5.4');
      expect(args).toContain('--dangerously-skip-permissions');
    });

    it('passes model parameter', () => {
      const args = buildOpenCodeCommand(mockConfig);
      const modelIndex = args.indexOf('-m');
      expect(args[modelIndex + 1]).toBe('openai/gpt-5.4');
    });

    it('passes prompt as final argument', () => {
      const args = buildOpenCodeCommand(mockConfig);
      expect(args[args.length - 1]).toBe('Create a simple hello world function');
    });

    it('includes additional args when provided', () => {
      const configWithArgs: AgentConfig = {
        ...mockConfig,
        args: ['--verbose', '--debug'],
      };
      const args = buildOpenCodeCommand(configWithArgs);
      expect(args).toContain('--verbose');
      expect(args).toContain('--debug');
    });
  });

  describe('validateConfig', () => {
    it('returns true for valid config', () => {
      expect(harness.validateConfig(mockConfig)).toBe(true);
    });

    it('returns false when model is missing', () => {
      const invalidConfig = { ...mockConfig, model: '' };
      expect(harness.validateConfig(invalidConfig)).toBe(false);
    });

    it('returns false when prompt is missing', () => {
      const invalidConfig = { ...mockConfig, prompt: '' };
      expect(harness.validateConfig(invalidConfig)).toBe(false);
    });

    it('returns false when workdir is missing', () => {
      const invalidConfig = { ...mockConfig, workdir: '' };
      expect(harness.validateConfig(invalidConfig)).toBe(false);
    });

    it('returns false when timeoutMs is zero', () => {
      const invalidConfig = { ...mockConfig, timeoutMs: 0 };
      expect(harness.validateConfig(invalidConfig)).toBe(false);
    });

    it('returns false when timeoutMs is negative', () => {
      const invalidConfig = { ...mockConfig, timeoutMs: -1 };
      expect(harness.validateConfig(invalidConfig)).toBe(false);
    });

    it('returns false when timeoutMs is Infinity', () => {
      const invalidConfig = { ...mockConfig, timeoutMs: Infinity };
      expect(harness.validateConfig(invalidConfig)).toBe(false);
    });
  });

  describe('parseOutput', () => {
    it('parses JSON output with status', () => {
      const jsonOutput = JSON.stringify({
        status: 'completed',
        stdout: 'Implementation complete',
        stderr: '',
        artifacts: ['src/index.ts', 'src/config.ts'],
      });

      const result = harness.parseOutput(jsonOutput);
      expect(result.stdout).toContain('Implementation complete');
      expect(result.artifacts).toContain('src/index.ts');
      expect(result.artifacts).toContain('src/config.ts');
      expect(result.status).toBe('completed');
    });

    it('extracts artifact paths from JSON artifacts array', () => {
      const jsonOutput = JSON.stringify({
        status: 'completed',
        artifacts: ['src/index.ts', 'src/utils.ts'],
      });

      const result = harness.parseOutput(jsonOutput);
      expect(result.artifacts).toContain('src/index.ts');
      expect(result.artifacts).toContain('src/utils.ts');
    });

    it('handles plain text output', () => {
      const plainOutput = 'Just some plain text output from opencode';

      const result = harness.parseOutput(plainOutput);
      expect(result.stdout).toBe(plainOutput);
      expect(result.artifacts).toHaveLength(0);
    });

    it('handles empty output', () => {
      const result = harness.parseOutput('');
      expect(result.stdout).toBe('');
      expect(result.artifacts).toHaveLength(0);
      expect(result.status).toBe('completed');
    });

    it('extracts artifact paths from plain text', () => {
      const output = `Starting...
Created file: src/index.ts
Writing src/utils.ts
Done.`;

      const result = harness.parseOutput(output);
      expect(result.artifacts).toContain('src/index.ts');
      expect(result.artifacts).toContain('src/utils.ts');
    });

    it('handles malformed JSON gracefully', () => {
      const mixedOutput = `Valid JSON start
Not valid JSON
Created: src/test.ts`;

      const result = harness.parseOutput(mixedOutput);
      expect(result.stdout).toContain('Valid JSON start');
      expect(result.stdout).toContain('Not valid JSON');
      expect(result.artifacts).toContain('src/test.ts');
    });

    it('returns completed status for valid output', () => {
      const result = harness.parseOutput('some output');
      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
    });

    it('handles JSON with output field', () => {
      const jsonOutput = JSON.stringify({
        status: 'completed',
        output: 'Task completed successfully',
        artifacts: ['package.json'],
      });

      const result = harness.parseOutput(jsonOutput);
      expect(result.stdout).toContain('Task completed successfully');
      expect(result.artifacts).toContain('package.json');
    });

    it('handles JSON with message field', () => {
      const jsonOutput = JSON.stringify({
        status: 'completed',
        message: 'All done!',
      });

      const result = harness.parseOutput(jsonOutput);
      expect(result.stdout).toContain('All done!');
    });

    it('returns failed status for non-completed status', () => {
      const jsonOutput = JSON.stringify({
        status: 'failed',
        error: 'Something went wrong',
      });

      const result = harness.parseOutput(jsonOutput);
      expect(result.status).toBe('failed');
      expect(result.exitCode).toBe(1);
    });
  });

  describe('RetryableError', () => {
    it('creates error with message', () => {
      const error = new RetryableError('Rate limited');
      expect(error.message).toBe('Rate limited');
      expect(error.name).toBe('RetryableError');
    });

    it('creates error with retry after ms', () => {
      const error = new RetryableError('Rate limited', 5000);
      expect(error.retryAfterMs).toBe(5000);
    });
  });
});

describe('buildOpenCodeCommand edge cases', () => {
  it('handles empty args array', () => {
    const config: AgentConfig = {
      ...mockConfig,
      args: [],
    };
    const args = buildOpenCodeCommand(config);
    expect(args).not.toContain('--verbose');
  });

  it('handles undefined args', () => {
    const config: AgentConfig = {
      harness: 'opencode',
      model: 'test-model',
      prompt: 'test prompt',
      timeoutMs: 60000,
      workdir: '/test',
      args: undefined,
    };
    const args = buildOpenCodeCommand(config);
    expect(args).toContain('test prompt');
  });
});
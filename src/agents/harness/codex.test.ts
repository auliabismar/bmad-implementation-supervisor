import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { CodexHarness, buildCodexCommand, RetryableError } from './codex';
import type { AgentConfig } from './interface';

const mockConfig: AgentConfig = {
  harness: 'codex',
  model: 'claude-sonnet-4-20250514',
  prompt: 'Create a simple hello world function',
  timeoutMs: 60000,
  workdir: '/test/project',
  skill: 'bmad-quick-dev',
};

describe('CodexHarness', () => {
  let harness: CodexHarness;

  beforeEach(() => {
    harness = new CodexHarness();
  });

  describe('type', () => {
    it('returns "codex" as type', () => {
      expect(harness.type).toBe('codex');
    });
  });

  describe('buildCodexCommand', () => {
    it('includes required flags', () => {
      const args = buildCodexCommand(mockConfig);
      expect(args).toContain('exec');
      expect(args).toContain('-m');
      expect(args).toContain('claude-sonnet-4-20250514');
      expect(args).toContain('--sandbox');
      expect(args).toContain('workspace-write');
      expect(args).toContain('--ask-for-approval');
      expect(args).toContain('never');
    });

    it('passes model parameter', () => {
      const args = buildCodexCommand(mockConfig);
      const modelIndex = args.indexOf('-m');
      expect(args[modelIndex + 1]).toBe('claude-sonnet-4-20250514');
    });

    it('passes prompt as final argument', () => {
      const args = buildCodexCommand(mockConfig);
      expect(args[args.length - 1]).toBe('Create a simple hello world function');
    });

    it('includes additional args when provided', () => {
      const configWithArgs: AgentConfig = {
        ...mockConfig,
        args: ['--verbose', '--debug'],
      };
      const args = buildCodexCommand(configWithArgs);
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
  });

  describe('parseOutput', () => {
    it('parses JSONL text messages', () => {
      const jsonlOutput = `{"type": "text", "content": "Starting implementation..."}
{"type": "text", "content": "Creating file: src/index.ts"}
{"type": "text", "content": "Done."}`;

      const result = harness.parseOutput(jsonlOutput);
      expect(result.stdout).toContain('Starting implementation');
      expect(result.stdout).toContain('Creating file: src/index.ts');
      expect(result.stdout).toContain('Done');
    });

    it('extracts artifact paths from JSON', () => {
      const jsonlOutput = `{"type": "text", "content": "Working..."}
{"type": "artifact", "path": "src/index.ts", "action": "create"}
{"type": "artifact", "path": "src/utils.ts", "action": "modify"}`;

      const result = harness.parseOutput(jsonlOutput);
      expect(result.artifacts).toContain('src/index.ts');
      expect(result.artifacts).toContain('src/utils.ts');
    });

    it('handles plain text output', () => {
      const plainOutput = 'Just some plain text output from codex';

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
      const mixedOutput = `{"type": "text", "content": "Valid JSON"}
Not valid JSON
{"type": "artifact", "path": "src/test.ts"}`;

      const result = harness.parseOutput(mixedOutput);
      expect(result.stdout).toContain('Valid JSON');
      expect(result.stdout).toContain('Not valid JSON');
      expect(result.artifacts).toContain('src/test.ts');
    });

    it('returns completed status for valid output', () => {
      const result = harness.parseOutput('some output');
      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
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

describe('buildCodexCommand edge cases', () => {
  it('handles empty args array', () => {
    const config: AgentConfig = {
      ...mockConfig,
      args: [],
    };
    const args = buildCodexCommand(config);
    expect(args).not.toContain('--verbose');
  });

  it('handles undefined args', () => {
    const config: AgentConfig = {
      harness: 'codex',
      model: 'test-model',
      prompt: 'test prompt',
      timeoutMs: 60000,
      workdir: '/test',
      args: undefined,
    };
    const args = buildCodexCommand(config);
    expect(args).toContain('test prompt');
  });
});
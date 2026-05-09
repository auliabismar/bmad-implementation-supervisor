import { describe, it, expect, beforeEach } from 'bun:test';
import { CommandCodeHarness, buildCommandCodeCommand } from './commandcode';
import type { AgentConfig } from './interface';

const mockConfig: AgentConfig = {
  harness: 'commandcode',
  model: 'gpt-5.4',
  prompt: 'Create a simple hello world function',
  timeoutMs: 60000,
  workdir: '/test/project',
  skill: 'bmad-quick-dev',
};

describe('CommandCodeHarness', () => {
  let harness: CommandCodeHarness;

  beforeEach(() => {
    harness = new CommandCodeHarness();
  });

  describe('type', () => {
    it('returns "commandcode" as type', () => {
      expect(harness.type).toBe('commandcode');
    });
  });

  describe('buildCommandCodeCommand', () => {
    it('includes required flags', () => {
      const args = buildCommandCodeCommand(mockConfig);
      expect(args).toContain('-p');
      expect(args).toContain('--yolo');
      expect(args).toContain('--skip-onboarding');
    });

    it('passes prompt parameter', () => {
      const args = buildCommandCodeCommand(mockConfig);
      const promptIndex = args.indexOf('-p');
      expect(args[promptIndex + 1]).toBe('Create a simple hello world function');
    });

    it('includes additional args when provided', () => {
      const configWithArgs: AgentConfig = {
        ...mockConfig,
        args: ['--verbose', '--debug'],
      };
      const args = buildCommandCodeCommand(configWithArgs);
      expect(args).toContain('--verbose');
      expect(args).toContain('--debug');
    });
  });

  describe('validateConfig', () => {
    it('returns true for valid config', () => {
      expect(harness.validateConfig(mockConfig)).toBe(true);
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
    it('extracts artifacts from "Created file:" pattern', () => {
      const output = 'Starting implementation...\nCreated file: src/index.ts\nDone.';

      const result = harness.parseOutput(output);
      expect(result.artifacts).toContain('src/index.ts');
    });

    it('extracts artifacts from "File created:" pattern', () => {
      const output = 'Starting...\nFile created: src/config.ts\nDone.';

      const result = harness.parseOutput(output);
      expect(result.artifacts).toContain('src/config.ts');
    });

    it('extracts artifacts from "Writing..." pattern', () => {
      const output = 'Writing src/utils.ts...';

      const result = harness.parseOutput(output);
      expect(result.artifacts).toContain('src/utils.ts');
    });

    it('extracts artifacts from "Modified:" pattern', () => {
      const output = 'Modified: src/main.ts';

      const result = harness.parseOutput(output);
      expect(result.artifacts).toContain('src/main.ts');
    });

    it('handles empty output', () => {
      const result = harness.parseOutput('');
      expect(result.stdout).toBe('');
      expect(result.artifacts).toHaveLength(0);
      expect(result.status).toBe('completed');
    });

    it('deduplicates artifacts', () => {
      const output = 'Created file: src/index.ts\nFile created: src/index.ts\nCreated file: src/index.ts';

      const result = harness.parseOutput(output);
      expect(result.artifacts).toHaveLength(1);
      expect(result.artifacts).toContain('src/index.ts');
    });

    it('handles output with no artifacts', () => {
      const output = 'Just some plain text output\nNo file patterns here';

      const result = harness.parseOutput(output);
      expect(result.artifacts).toHaveLength(0);
      expect(result.stdout).toBe(output);
    });

    it('extracts multiple different artifacts', () => {
      const output = `Starting...
Created file: src/index.ts
File created: src/config.ts
Writing src/utils.ts...
Modified: src/main.ts
Done.`;

      const result = harness.parseOutput(output);
      expect(result.artifacts).toContain('src/index.ts');
      expect(result.artifacts).toContain('src/config.ts');
      expect(result.artifacts).toContain('src/utils.ts');
      expect(result.artifacts).toContain('src/main.ts');
      expect(result.artifacts).toHaveLength(4);
    });

    it('returns completed status', () => {
      const result = harness.parseOutput('some output');
      expect(result.status).toBe('completed');
      expect(result.exitCode).toBe(0);
    });

    it('preserves stdout content', () => {
      const output = 'Hello world\nCreated file: src/test.ts';

      const result = harness.parseOutput(output);
      expect(result.stdout).toBe(output);
    });

    it('extracts artifacts case-insensitively', () => {
      const output = 'CREATED FILE: src/test.ts\nfile created: src/test2.ts';

      const result = harness.parseOutput(output);
      expect(result.artifacts).toContain('src/test.ts');
      expect(result.artifacts).toContain('src/test2.ts');
    });
  });
});

describe('buildCommandCodeCommand edge cases', () => {
  it('handles empty args array', () => {
    const config: AgentConfig = {
      ...mockConfig,
      args: [],
    };
    const args = buildCommandCodeCommand(config);
    expect(args).not.toContain('--verbose');
  });

  it('handles undefined args', () => {
    const config: AgentConfig = {
      harness: 'commandcode',
      model: 'test-model',
      prompt: 'test prompt',
      timeoutMs: 60000,
      workdir: '/test',
      args: undefined,
    };
    const args = buildCommandCodeCommand(config);
    expect(args).toContain('-p');
    expect(args).toContain('test prompt');
  });

  it('handles special characters in prompt', () => {
    const config: AgentConfig = {
      ...mockConfig,
      prompt: 'Create "hello world" function',
    };
    const args = buildCommandCodeCommand(config);
    expect(args).toContain('Create "hello world" function');
  });
});

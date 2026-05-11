import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { autoCommit, escapeForShell, type CommitResult } from './ops.js';

const mockExecAsync = vi.fn();
const mockGetPlatform = vi.fn().mockReturnValue({ isWindows: false });

vi.mock('../utils/platform.js', () => ({
  execAsync: (...args: unknown[]) => mockExecAsync(...args),
  getPlatform: (...args: unknown[]) => mockGetPlatform(...args),
}));

describe('ops.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlatform.mockReturnValue({ isWindows: false });
  });

  describe('autoCommit', () => {
    it('should fail if storyKey is empty', async () => {
      const result = await autoCommit('', 'create-story', 'ready-for-dev');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('required');
      }
    });

    it('should fail if workflow is empty', async () => {
      const result = await autoCommit('1-1-test', '', 'ready-for-dev');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('required');
      }
    });

    it('should fail if status is empty', async () => {
      const result = await autoCommit('1-1-test', 'dev-story', '');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('required');
      }
    });

    it('should fail if storyKey is whitespace only', async () => {
      const result = await autoCommit('   ', 'create-story', 'ready-for-dev');
      expect(result.success).toBe(false);
    });

    it('should fail if workflow is invalid', async () => {
      const result = await autoCommit('1-1-test', 'invalid-workflow', 'ready-for-dev');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid workflow');
        expect(result.error).toContain('invalid-workflow');
      }
    });

    it('should accept all three valid workflows', async () => {
      for (const wf of ['create-story', 'dev-story', 'code-review']) {
        mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });
        const result = await autoCommit('1-1-test', wf, 'done');
        expect(result.success).toBe(true);
        vi.clearAllMocks();
      }
    });

    it('should return success with no changes message when nothing to commit', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await autoCommit('1-2-config-loading', 'create-story', 'ready-for-dev');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toBe('No changes to commit');
      }
    });

    it('should stage and commit changes', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: ' M file.txt', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: `[main 1234567] [1-2-config-loading] create-story: ready-for-dev`,
          stderr: '',
          exitCode: 0,
        });

      const result = await autoCommit('1-2-config-loading', 'create-story', 'ready-for-dev');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toBe('[1-2-config-loading] create-story: ready-for-dev');
      }
    });

    it('should pass correctly escaped commit message to execAsync', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: ' M file.txt', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '[main abc] msg', stderr: '', exitCode: 0 });

      await autoCommit('1-2-config', 'create-story', 'ready-for-dev');

      expect(mockExecAsync).toHaveBeenCalledTimes(3);
      const commitCall = mockExecAsync.mock.calls[2]![0] as string;
      expect(commitCall).toBe('git commit -m "[1-2-config] create-story: ready-for-dev"');
    });

    it('should fail if git status check fails', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: 'fatal: not a repo', exitCode: 1 });

      const result = await autoCommit('1-2-config-loading', 'dev-story', 'review');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to check git status');
        expect(result.error).toContain('fatal: not a repo');
      }
    });

    it('should fail if git add fails', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: ' M file.txt', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'add error', exitCode: 1 });

      const result = await autoCommit('1-2-config-loading', 'create-story', 'ready-for-dev');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to stage changes');
        expect(result.error).toContain('add error');
      }
    });

    it('should fail if git commit fails', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: ' M file.txt', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: 'commit error', exitCode: 1 });

      const result = await autoCommit('1-2-config-loading', 'dev-story', 'review');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to commit changes');
        expect(result.error).toContain('commit error');
      }
    });

    it('should generate correct message format', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: ' M file.txt', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: `[main 1234567] [5-2-auto-commit] code-review: changes-requested`,
          stderr: '',
          exitCode: 0,
        });

      const result = await autoCommit('5-2-auto-commit', 'code-review', 'changes-requested');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toBe('[5-2-auto-commit] code-review: changes-requested');
      }
    });

    it('should use story key in commit message', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: ' M file.txt', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({
          stdout: `[main 1234567] [1-1-project-setup] create-story: ready-for-dev`,
          stderr: '',
          exitCode: 0,
        });

      const result = await autoCommit('1-1-project-setup', 'create-story', 'ready-for-dev');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toContain('[1-1-project-setup]');
      }
    });

    it('should sanitize newlines in inputs', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: ' M file.txt', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '[main abc] msg', stderr: '', exitCode: 0 });

      const result = await autoCommit('1-1-test\ninjected', 'create-story', 'done\r\ntrailer');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).not.toContain('\n');
        expect(result.message).not.toContain('\r');
      }
    });

    it('should handle execAsync rejection (e.g. timeout)', async () => {
      mockExecAsync.mockRejectedValueOnce(new Error('Command timed out after 30000ms'));

      const result = await autoCommit('1-1-test', 'create-story', 'ready-for-dev');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('timed out');
      }
    });

    it('should handle non-Error rejection', async () => {
      mockExecAsync.mockRejectedValueOnce('spawn ENOENT');

      const result = await autoCommit('1-1-test', 'dev-story', 'done');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe('spawn ENOENT');
      }
    });
  });

  describe('escapeForShell', () => {
    describe('Unix escaping', () => {
      beforeEach(() => {
        mockGetPlatform.mockReturnValue({ isWindows: false });
      });

      it('should escape backslash-quote sequences correctly', () => {
        // Input: a literal backslash followed by a quote: \"
        // Correct order (backslash first, then quote): \\\"
        // Wrong order would produce: \\\\" (double-escaped backslash, bare quote)
        const input = 'a' + '\\' + '"' + 'b'; // a\"b
        const result = escapeForShell(input);
        const expected = 'a' + '\\\\' + '\\"' + 'b'; // a\\\"b
        expect(result).toBe(expected);
      });

      it('should escape double quotes', () => {
        const result = escapeForShell('has "quotes"');
        expect(result).toBe('has \\"quotes\\"');
      });

      it('should escape dollar signs', () => {
        const result = escapeForShell('$(whoami)');
        expect(result).toBe('\\$(whoami)');
      });

      it('should escape backticks', () => {
        const result = escapeForShell('`id`');
        expect(result).toBe('\\`id\\`');
      });

      it('should leave safe strings unchanged', () => {
        const result = escapeForShell('[1-2-config] create-story: done');
        expect(result).toBe('[1-2-config] create-story: done');
      });
    });

    describe('Windows escaping', () => {
      beforeEach(() => {
        mockGetPlatform.mockReturnValue({ isWindows: true });
      });

      it('should escape backticks before quotes', () => {
        const result = escapeForShell('say `"hello`"');
        // Backticks escaped first, then quotes
        expect(result).not.toContain('"""');
      });

      it('should escape double quotes', () => {
        const result = escapeForShell('has "quotes"');
        expect(result).toBe('has `"quotes`"');
      });

      it('should escape dollar signs', () => {
        const result = escapeForShell('$env:SECRET');
        expect(result).toBe('`$env:SECRET');
      });

      it('should leave safe strings unchanged', () => {
        const result = escapeForShell('[1-2-config] create-story: done');
        expect(result).toBe('[1-2-config] create-story: done');
      });
    });
  });
});
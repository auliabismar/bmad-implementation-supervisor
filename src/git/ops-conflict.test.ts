import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { detectConflicts, type ConflictResult } from './ops.js';

const mockExecAsync = vi.fn();
const mockGetPlatform = vi.fn().mockReturnValue({ isWindows: false });

vi.mock('../utils/platform.js', () => ({
  execAsync: (...args: unknown[]) => mockExecAsync(...args),
  getPlatform: (...args: unknown[]) => mockGetPlatform(...args),
}));

const ok = (stdout = '') => ({ stdout, stderr: '', exitCode: 0 });
const fail = (stderr = '', stdout = '') => ({ stdout, stderr, exitCode: 1 });

function expectNoConflicts(result: ConflictResult): asserts result is Extract<ConflictResult, { hasConflicts: false }> {
  expect(result.hasConflicts).toBe(false);
  if (result.hasConflicts) {
    throw new Error('Expected no conflicts');
  }
}

function expectConflicts(result: ConflictResult): asserts result is Extract<ConflictResult, { hasConflicts: true }> {
  expect(result.hasConflicts).toBe(true);
  if (!result.hasConflicts) {
    throw new Error('Expected conflicts');
  }
}

describe('detectConflicts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlatform.mockReturnValue({ isWindows: false });
  });

  describe('input validation', () => {
    it('returns no conflicts for empty or whitespace branch names', async () => {
      expect((await detectConflicts('')).hasConflicts).toBe(false);
      expect((await detectConflicts('   ')).hasConflicts).toBe(false);
      expect(mockExecAsync).not.toHaveBeenCalled();
    });

    it('rejects shell metacharacters and option-like branch names', async () => {
      expect((await detectConflicts('feat/$(whoami)')).hasConflicts).toBe(false);
      expect((await detectConflicts('-danger')).hasConflicts).toBe(false);
      expect(mockExecAsync).not.toHaveBeenCalled();
    });
  });

  describe('branch and working tree guards', () => {
    it('requires the current branch to match the target branch', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('main\n'));

      const result = await detectConflicts('feat/test');

      expectNoConflicts(result);
      expect(result.error).toContain('Must be on feature branch');
      expect(mockExecAsync).not.toHaveBeenCalledWith('git checkout main');
    });

    it('returns an error when the branch check fails', async () => {
      mockExecAsync.mockResolvedValueOnce(fail('fatal: not a git repo'));

      const result = await detectConflicts('feat/test');

      expectNoConflicts(result);
      expect(result.error).toContain('Must be on feature branch');
    });

    it('rejects a dirty working tree before checkout', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok(' M src/file.ts\n'));

      const result = await detectConflicts('feat/test');

      expectNoConflicts(result);
      expect(result.error).toContain('dirty');
      expect(mockExecAsync).not.toHaveBeenCalledWith('git checkout main');
    });

    it('returns an error when git status fails', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(fail('fatal: status failed'));

      const result = await detectConflicts('feat/test');

      expectNoConflicts(result);
      expect(result.error).toContain('Failed to check git status');
    });
  });

  describe('merge probe cleanup', () => {
    it('aborts and restores the feature branch when no conflicts are found', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());

      const result = await detectConflicts('feat/test');

      expectNoConflicts(result);
      expect(mockExecAsync).toHaveBeenCalledWith('git diff --check');
      expect(mockExecAsync).toHaveBeenCalledWith('git merge --abort');
      expect(mockExecAsync).toHaveBeenCalledWith('git checkout "feat/test"');
    });

    it('surfaces cleanup warnings when abort or restore fails', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail('no merge to abort'));
      mockExecAsync.mockResolvedValueOnce(fail('checkout failed'));

      const result = await detectConflicts('feat/test');

      expectNoConflicts(result);
      expect(result.warnings).toHaveLength(2);
      expect(result.warnings?.[0]).toContain('Failed to abort merge');
      expect(result.warnings?.[1]).toContain('Failed to restore branch');
    });

    it('restores the feature branch after an exception', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockRejectedValueOnce(new Error('Unexpected error'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());

      const result = await detectConflicts('feat/test');

      expectNoConflicts(result);
      expect(result.error).toContain('Unexpected error');
      expect(mockExecAsync).toHaveBeenCalledWith('git merge --abort');
      expect(mockExecAsync).toHaveBeenCalledWith('git checkout "feat/test"');
    });
  });

  describe('conflict detection', () => {
    it('extracts conflicting file paths from git unmerged output', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail('CONFLICT (content): Merge conflict in file.ts'));
      mockExecAsync.mockResolvedValueOnce(fail('file.ts:1: leftover conflict marker'));
      mockExecAsync.mockResolvedValueOnce(ok('file.ts\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());

      const result = await detectConflicts('feat/test', { storyKey: '5-4-conflict-detection' });

      expectConflicts(result);
      expect(result.files).toEqual([{ path: 'file.ts', oursLines: 0, theirsLines: 0 }]);
      expect(result.message).toContain('1 file(s)');
      expect(result.notification.event).toBe('NEEDS_INPUT');
      expect(result.notification.storyKey).toBe('5-4-conflict-detection');
    });

    it('falls back to a single unknown file entry when conflicts lack paths', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce({ stdout: '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> feat/test', stderr: '', exitCode: 1 });
      mockExecAsync.mockResolvedValueOnce(fail('leftover conflict marker'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());

      const result = await detectConflicts('feat/test');

      expectConflicts(result);
      expect(result.files).toEqual([{ path: 'multiple files', oursLines: 0, theirsLines: 0 }]);
      expect(result.message).toContain('1 file(s)');
    });

    it('returns an error for merge failures that are not conflicts', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail('fatal: unknown error'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());

      const result = await detectConflicts('feat/test');

      expectNoConflicts(result);
      expect(result.error).toContain('Failed to test merge');
    });
  });

  describe('command construction', () => {
    it('uses end-of-options marker for merge ref arguments', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/my-branch\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());

      await detectConflicts('feat/my-branch');

      expect(mockExecAsync).toHaveBeenCalledWith('git merge --no-commit --no-ff -- "feat/my-branch"');
    });
  });
});

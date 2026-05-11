import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { squashMerge, type SquashMergeResult } from './ops.js';

const mockExecAsync = vi.fn();
const mockGetPlatform = vi.fn().mockReturnValue({ isWindows: false });

vi.mock('../utils/platform.js', () => ({
  execAsync: (...args: unknown[]) => mockExecAsync(...args),
  getPlatform: (...args: unknown[]) => mockGetPlatform(...args),
}));

// Helper: mock a successful exec result
const ok = (stdout = '') => ({ stdout, stderr: '', exitCode: 0 });
const fail = (stderr = '', stdout = '') => ({ stdout, stderr, exitCode: 1 });

describe('squashMerge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPlatform.mockReturnValue({ isWindows: false });
  });

  // ── Input Validation ──────────────────────────────────────────────

  describe('input validation', () => {
    it('should reject empty storyKey', async () => {
      const result = await squashMerge('', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('required');
      }
    });

    it('should reject empty branchName', async () => {
      const result = await squashMerge('5-3-test', '');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('required');
      }
    });

    it('should reject whitespace-only storyKey', async () => {
      const result = await squashMerge('   ', 'feat/test');
      expect(result.success).toBe(false);
    });

    it('should reject whitespace-only branchName', async () => {
      const result = await squashMerge('5-3-test', '   ');
      expect(result.success).toBe(false);
    });

    it('should reject storyKey with shell metacharacters', async () => {
      const result = await squashMerge('$(whoami)', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid storyKey');
      }
    });

    it('should reject branchName with shell metacharacters', async () => {
      const result = await squashMerge('5-3-test', 'feat/x"; rm -rf / #');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid branchName');
      }
    });

    it('should reject branchName with $() subexpression', async () => {
      const result = await squashMerge('5-3-test', '$(malicious)');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid branchName');
      }
    });

    it('should reject storyKey exceeding max length', async () => {
      const longKey = 'a'.repeat(129);
      const result = await squashMerge(longKey, 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid storyKey');
      }
    });

    it('should accept valid storyKey with hyphens and dots', async () => {
      // Should pass validation and reach the branch check
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok()); // status --porcelain
      mockExecAsync.mockResolvedValueOnce(fail()); // merge-base (not ff)
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockResolvedValueOnce(ok()); // merge --squash
      mockExecAsync.mockResolvedValueOnce(ok()); // commit
      mockExecAsync.mockResolvedValueOnce(ok()); // push
      mockExecAsync.mockResolvedValueOnce(ok()); // branch -D
      mockExecAsync.mockResolvedValueOnce(ok()); // push --delete
      const result = await squashMerge('E5-3.1', 'feat/test');
      expect(result.success).toBe(true);
    });
  });

  // ── Approval Gate ─────────────────────────────────────────────────

  describe('approval gate', () => {
    it('should reject when approved is explicitly false', async () => {
      const result = await squashMerge('5-3-test', 'feat/test', { approved: false });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('approved');
      }
    });

    it('should proceed when approved is true', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // status --porcelain
      mockExecAsync.mockResolvedValueOnce(fail()); // merge-base (not ff)
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockResolvedValueOnce(ok()); // merge --squash
      mockExecAsync.mockResolvedValueOnce(ok()); // commit
      mockExecAsync.mockResolvedValueOnce(ok()); // push
      mockExecAsync.mockResolvedValueOnce(ok()); // branch -D
      mockExecAsync.mockResolvedValueOnce(ok()); // push --delete
      const result = await squashMerge('5-3-test', 'feat/test', { approved: true });
      expect(result.success).toBe(true);
    });

    it('should proceed when approved is undefined (default)', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // status --porcelain
      mockExecAsync.mockResolvedValueOnce(fail()); // merge-base (not ff)
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockResolvedValueOnce(ok()); // merge --squash
      mockExecAsync.mockResolvedValueOnce(ok()); // commit
      mockExecAsync.mockResolvedValueOnce(ok()); // push
      mockExecAsync.mockResolvedValueOnce(ok()); // branch -D
      mockExecAsync.mockResolvedValueOnce(ok()); // push --delete
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(true);
    });
  });

  // ── Branch Verification (Step 1) ─────────────────────────────────

  describe('branch verification', () => {
    it('should reject when not on expected feature branch', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('main\n'));
      const result = await squashMerge('5-3-test', 'feat/5-3-squash');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Must be on feature branch');
      }
    });

    it('should reject when git branch --show-current fails', async () => {
      mockExecAsync.mockResolvedValueOnce(fail('fatal: not a git repo'));
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Must be on feature branch');
      }
    });
  });

  // ── Dirty Working Tree Check ──────────────────────────────────────

  describe('dirty working tree', () => {
    it('should reject when working tree has uncommitted changes', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // on correct branch
      mockExecAsync.mockResolvedValueOnce(ok(' M src/file.ts\n')); // dirty
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('dirty');
      }
    });

    it('should reject when git status fails', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(fail('fatal'));
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to check git status');
      }
    });
  });

  // ── Fast-Forward Check (AC-5) ─────────────────────────────────────

  describe('fast-forward check', () => {
    it('should reject when fast-forward is possible (main is ancestor of branch)', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // status clean
      mockExecAsync.mockResolvedValueOnce(ok()); // merge-base exit 0 = is ancestor = ff possible
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Fast-forward');
      }
    });

    it('should proceed when fast-forward is NOT possible (diverged history)', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // status clean
      mockExecAsync.mockResolvedValueOnce(fail()); // merge-base exit 1 = not ancestor = ff not possible
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockResolvedValueOnce(ok()); // merge --squash
      mockExecAsync.mockResolvedValueOnce(ok()); // commit
      mockExecAsync.mockResolvedValueOnce(ok()); // push
      mockExecAsync.mockResolvedValueOnce(ok()); // branch -D
      mockExecAsync.mockResolvedValueOnce(ok()); // push --delete
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(true);
    });
  });

  // ── Checkout Main (Step 2) ────────────────────────────────────────

  describe('checkout main', () => {
    it('should fail and return error when checkout main fails', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // status clean
      mockExecAsync.mockResolvedValueOnce(fail()); // merge-base (not ff)
      mockExecAsync.mockResolvedValueOnce(fail('error: pathspec')); // checkout main fails
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to checkout main');
      }
    });
  });

  // ── Merge Conflicts (AC-4) ────────────────────────────────────────

  describe('conflict handling', () => {
    it('should detect conflicts from stderr and restore feature branch', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // status clean
      mockExecAsync.mockResolvedValueOnce(fail()); // merge-base (not ff)
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockResolvedValueOnce(fail('CONFLICT (content): Merge conflict in file.ts')); // merge --squash fails
      mockExecAsync.mockResolvedValueOnce(ok()); // git reset --hard HEAD
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout back to feature branch
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Merge conflict detected');
        expect(result.error).toContain('CONFLICT');
      }
      // Verify reset and checkout were called
      expect(mockExecAsync).toHaveBeenCalledWith('git reset --hard HEAD');
    });

    it('should detect conflicts from stdout when stderr is empty', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce({ stdout: 'CONFLICT (content): file.ts', stderr: '', exitCode: 1 }); // conflict in stdout
      mockExecAsync.mockResolvedValueOnce(ok()); // reset
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout feature
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Merge conflict');
      }
    });

    it('should report generic merge failure when no conflict markers found', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockResolvedValueOnce(fail('fatal: unknown error')); // merge fails without conflict
      mockExecAsync.mockResolvedValueOnce(ok()); // reset
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout feature
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to squash merge');
      }
    });
  });

  // ── Commit Failure Rollback ───────────────────────────────────────

  describe('commit failure rollback', () => {
    it('should reset and restore feature branch when commit fails', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // status clean
      mockExecAsync.mockResolvedValueOnce(fail()); // merge-base (not ff)
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockResolvedValueOnce(ok()); // merge --squash succeeds
      mockExecAsync.mockResolvedValueOnce(fail('commit error')); // commit fails
      mockExecAsync.mockResolvedValueOnce(ok()); // git reset --hard HEAD (rollback)
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout feature branch
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to commit squash merge');
      }
      expect(mockExecAsync).toHaveBeenCalledWith('git reset --hard HEAD');
    });
  });

  // ── Push Failure Rollback ─────────────────────────────────────────

  describe('push failure rollback', () => {
    it('should undo local commit and restore feature branch when push fails', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // status clean
      mockExecAsync.mockResolvedValueOnce(fail()); // merge-base (not ff)
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockResolvedValueOnce(ok()); // merge --squash
      mockExecAsync.mockResolvedValueOnce(ok()); // commit succeeds
      mockExecAsync.mockResolvedValueOnce(fail('rejected: non-fast-forward')); // push fails
      mockExecAsync.mockResolvedValueOnce(ok()); // git reset --hard HEAD~1 (undo commit)
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout feature branch
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to push main');
      }
      expect(mockExecAsync).toHaveBeenCalledWith('git reset --hard HEAD~1');
    });
  });

  // ── Branch Cleanup (AC-2) ─────────────────────────────────────────

  describe('branch cleanup', () => {
    it('should use -D (force) for local branch deletion', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok()); // push
      mockExecAsync.mockResolvedValueOnce(ok()); // branch -D
      mockExecAsync.mockResolvedValueOnce(ok()); // push --delete
      await squashMerge('5-3-test', 'feat/test');
      const branchDeleteCall = mockExecAsync.mock.calls[7]![0] as string;
      expect(branchDeleteCall).toContain('git branch -D');
    });

    it('should return success with warnings when local delete fails', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok()); // push
      mockExecAsync.mockResolvedValueOnce(fail('error: branch not found')); // branch -D fails
      mockExecAsync.mockResolvedValueOnce(ok()); // push --delete succeeds
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.warnings).toBeDefined();
        expect(result.warnings!.length).toBe(1);
        expect(result.warnings![0]).toContain('local branch');
      }
    });

    it('should return success with warnings when remote delete fails', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok()); // push
      mockExecAsync.mockResolvedValueOnce(ok()); // branch -D succeeds
      mockExecAsync.mockResolvedValueOnce(fail('permission denied')); // push --delete fails
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.warnings).toBeDefined();
        expect(result.warnings![0]).toContain('remote branch');
      }
    });

    it('should not include warnings when both deletes succeed', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok()); // push
      mockExecAsync.mockResolvedValueOnce(ok()); // branch -D
      mockExecAsync.mockResolvedValueOnce(ok()); // push --delete
      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.warnings).toBeUndefined();
      }
    });
  });

  // ── Happy Path (Full Flow) ────────────────────────────────────────

  describe('happy path', () => {
    it('should execute full squash merge flow in correct order', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/5-3-squash\n')); // 1: branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // 2: status --porcelain
      mockExecAsync.mockResolvedValueOnce(fail()); // 3: merge-base (not ff)
      mockExecAsync.mockResolvedValueOnce(ok()); // 4: checkout main
      mockExecAsync.mockResolvedValueOnce(ok()); // 5: merge --squash
      mockExecAsync.mockResolvedValueOnce(ok()); // 6: commit
      mockExecAsync.mockResolvedValueOnce(ok()); // 7: push
      mockExecAsync.mockResolvedValueOnce(ok()); // 8: branch -D
      mockExecAsync.mockResolvedValueOnce(ok()); // 9: push --delete

      const result = await squashMerge('5-3-squash-merge', 'feat/5-3-squash');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.message).toBe('5-3-squash-merge squash-merged to main');
      }

      // Verify call order
      expect(mockExecAsync).toHaveBeenCalledTimes(9);
      expect(mockExecAsync.mock.calls[0]![0]).toBe('git branch --show-current');
      expect(mockExecAsync.mock.calls[1]![0]).toBe('git status --porcelain');
      expect((mockExecAsync.mock.calls[2]![0] as string)).toContain('git merge-base --is-ancestor');
      expect(mockExecAsync.mock.calls[3]![0]).toBe('git checkout main');
      expect((mockExecAsync.mock.calls[4]![0] as string)).toContain('git merge --squash');
      expect((mockExecAsync.mock.calls[5]![0] as string)).toContain('git commit -m');
      expect(mockExecAsync.mock.calls[6]![0]).toBe('git push origin main');
      expect((mockExecAsync.mock.calls[7]![0] as string)).toContain('git branch -D');
      expect((mockExecAsync.mock.calls[8]![0] as string)).toContain('git push origin --delete');
    });

    it('should produce correct commit message format', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());

      await squashMerge('5-3-squash-merge', 'feat/test');

      const commitCall = mockExecAsync.mock.calls[5]![0] as string;
      expect(commitCall).toBe('git commit -m "[5-3-squash-merge] Merge story"');
    });
  });

  // ── Exception Handling & Rollback ─────────────────────────────────

  describe('exception handling', () => {
    it('should rollback committed state on unexpected Error throw', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n')); // branch check
      mockExecAsync.mockResolvedValueOnce(ok()); // status clean
      mockExecAsync.mockResolvedValueOnce(fail()); // merge-base (not ff)
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockResolvedValueOnce(ok()); // merge --squash
      mockExecAsync.mockResolvedValueOnce(ok()); // commit succeeds (committed = true)
      mockExecAsync.mockRejectedValueOnce(new Error('Network timeout')); // push throws
      // Rollback calls after catch:
      mockExecAsync.mockResolvedValueOnce(ok()); // reset --hard HEAD~1
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout feature

      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Network timeout');
      }
    });

    it('should handle non-Error throw gracefully', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockRejectedValueOnce('spawn ENOENT'); // checkout main throws string

      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('spawn ENOENT');
      }
    });

    it('should survive rollback failure without throwing', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/test\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockResolvedValueOnce(ok()); // checkout main
      mockExecAsync.mockRejectedValueOnce(new Error('merge crashed')); // merge throws
      // Rollback also fails:
      mockExecAsync.mockRejectedValueOnce(new Error('reset also failed'));

      const result = await squashMerge('5-3-test', 'feat/test');
      expect(result.success).toBe(false);
      // Should not throw, should return error
      if (!result.success) {
        expect(result.error).toContain('merge crashed');
      }
    });
  });

  // ── branchName escaping in commands ───────────────────────────────

  describe('branch name escaping', () => {
    it('should pass branchName through escapeForShell in all commands', async () => {
      mockExecAsync.mockResolvedValueOnce(ok('feat/my-branch\n'));
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(fail());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());
      mockExecAsync.mockResolvedValueOnce(ok());

      await squashMerge('5-3-test', 'feat/my-branch');

      // All commands using branchName should have it quoted
      const mergeBaseCall = mockExecAsync.mock.calls[2]![0] as string;
      const mergeCall = mockExecAsync.mock.calls[4]![0] as string;
      const branchDeleteCall = mockExecAsync.mock.calls[7]![0] as string;
      const remoteDeleteCall = mockExecAsync.mock.calls[8]![0] as string;
      expect(mergeBaseCall).toContain('"feat/my-branch"');
      expect(mergeCall).toContain('"feat/my-branch"');
      expect(branchDeleteCall).toContain('"feat/my-branch"');
      expect(remoteDeleteCall).toContain('"feat/my-branch"');
    });
  });
});

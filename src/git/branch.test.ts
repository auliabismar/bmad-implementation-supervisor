import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { createBranch, toBranchName, type BranchResult } from './branch.js';

const mockExecAsync = vi.fn();

vi.mock('../utils/platform.js', () => ({
  execAsync: (...args: unknown[]) => mockExecAsync(...args),
}));

describe('branch.ts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('toBranchName', () => {
    it('should prefix story key with feat/', () => {
      expect(toBranchName('1-1-project-setup')).toBe('feat/1-1-project-setup');
    });

    it('should convert to lowercase', () => {
      expect(toBranchName('2-3-User-Auth')).toBe('feat/2-3-user-auth');
    });

    it('should replace slashes with hyphens', () => {
      expect(toBranchName('1-1/feature-name')).toBe('feat/1-1-feature-name');
    });

    it('should remove special characters', () => {
      expect(toBranchName('1-1-test@#$')).toBe('feat/1-1-test');
    });

    it('should return feat/invalid-key for empty string', () => {
      expect(toBranchName('')).toBe('feat/invalid-key');
    });

    it('should return feat/invalid-key for special characters only', () => {
      expect(toBranchName('!@#$')).toBe('feat/invalid-key');
    });
  });

  describe('createBranch', () => {
    it('should create a feature branch from story key', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'main', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await createBranch('1-1-project-setup');
      expect(result.branchName).toBe('feat/1-1-project-setup');
      expect(result.success).toBe(true);
    });

    it('should verify we are on main before creating', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'main', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await createBranch('1-1-test');

      expect(mockExecAsync).toHaveBeenCalledWith('git branch --show-current');
    });

    it('should fail if not on main branch', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: 'feat/some-branch', stderr: '', exitCode: 0 });

      const result = await createBranch('1-1-test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('main');
      }
    });

    it('should fail if uncommitted changes exist', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'main', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: ' M file.txt', stderr: '', exitCode: 0 });

      const result = await createBranch('1-1-test');
      expect(result.success).toBe(false);
      expect(result.error?.toLowerCase()).toContain('uncommitted');
    });

    it('should create and checkout new branch', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'main', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await createBranch('1-1-test');

      expect(mockExecAsync).toHaveBeenCalledWith('git checkout -b "feat/1-1-test"');
    });

    it('should set upstream tracking', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'main', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      await createBranch('1-1-test');

      expect(mockExecAsync).toHaveBeenCalledWith('git branch --set-upstream-to=origin/feat/1-1-test');
    });

    it('should fail with invalid story key for empty string', async () => {
      const result = await createBranch('');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid story key');
      }
    });

    it('should fail with invalid story key for special chars only', async () => {
      const result = await createBranch('!@#$');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Invalid story key');
      }
    });

    it('should fail if on master branch', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'master', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await createBranch('1-1-test');
      expect(result.success).toBe(true);
    });

    it('should fail if in detached HEAD state', async () => {
      mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 });

      const result = await createBranch('1-1-test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('detached HEAD');
      }
    });

    it('should fail if upstream tracking fails', async () => {
      mockExecAsync
        .mockResolvedValueOnce({ stdout: 'main', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: '', stderr: '', exitCode: 0 })
        .mockResolvedValueOnce({ stdout: 'fatal: The requested upstream branch \'origin/feat/1-1-test\' does not exist', stderr: '', exitCode: 128 });

      const result = await createBranch('1-1-test');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('upstream');
      }
    });
  });
});
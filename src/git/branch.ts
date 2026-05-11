import { execAsync } from '../utils/platform.js';

export type BranchResult =
  | { success: true; branchName: string }
  | { success: false; error: string };

export function toBranchName(storyKey: string): string {
  const normalized = storyKey
    .toLowerCase()
    .replace(/[/\\]/g, '-')
    .replace(/[^a-z0-9-]/g, '');
  if (!normalized) {
    return 'feat/invalid-key';
  }
  return `feat/${normalized}`;
}

export async function createBranch(storyKey: string): Promise<BranchResult> {
  const branchName = toBranchName(storyKey);

  if (branchName === 'feat/invalid-key') {
    return {
      success: false,
      error: 'Invalid story key: cannot be empty or contain only special characters',
    };
  }

  try {
    const currentBranch = await execAsync('git branch --show-current');
    if (currentBranch.exitCode !== 0) {
      return {
        success: false,
        error: currentBranch.stderr || 'Failed to get current branch',
      };
    }

    const currentBranchName = currentBranch.stdout.trim();
    if (!currentBranchName) {
      return {
        success: false,
        error: 'Cannot create branch from detached HEAD state',
      };
    }

    if (!['main', 'master'].includes(currentBranchName)) {
      return {
        success: false,
        error: `Must be on main or master branch to create feature branches. Current: ${currentBranchName}`,
      };
    }

    const status = await execAsync('git status --porcelain');
    if (status.exitCode !== 0) {
      return {
        success: false,
        error: status.stderr || 'Failed to get git status',
      };
    }
    if (status.stdout.trim() !== '') {
      return {
        success: false,
        error: 'Uncommitted changes exist. Please commit or stash them before creating a branch.',
      };
    }

    const createResult = await execAsync(`git checkout -b "${branchName}"`);
    if (createResult.exitCode !== 0) {
      return {
        success: false,
        error: `Failed to create branch: ${createResult.stderr}`,
      };
    }

    const trackResult = await execAsync(`git branch --set-upstream-to=origin/${branchName}`);
    if (trackResult.exitCode !== 0) {
      return {
        success: false,
        error: `Failed to set upstream tracking: ${trackResult.stderr}`,
      };
    }

    return {
      success: true,
      branchName,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
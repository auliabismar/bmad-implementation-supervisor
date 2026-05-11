import { execAsync, getPlatform } from '../utils/platform.js';

export type CommitResult =
  | { success: true; message: string }
  | { success: false; error: string };

export type SquashMergeResult =
  | { success: true; message: string; warnings?: string[] }
  | { success: false; error: string };

export interface SquashMergeOptions {
  approved?: boolean;
}

const VALID_WORKFLOWS = ['create-story', 'dev-story', 'code-review'] as const;
export type WorkflowType = (typeof VALID_WORKFLOWS)[number];

export function escapeForShell(message: string): string {
  const { isWindows } = getPlatform();
  if (isWindows) {
    // Order matters: escape backticks first, then quotes, then $
    return message
      .replace(/`/g, '``')
      .replace(/"/g, '`"')
      .replace(/\$/g, '`$');
  }
  // Order matters: escape backslashes first, then quotes, then $ and backticks
  return message
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\$/g, '\\$')
    .replace(/`/g, '\\`');
}

function isNonEmptyString(value: string | undefined | null): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function sanitize(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export async function autoCommit(storyKey: string, workflow: string, status: string): Promise<CommitResult> {
  if (!isNonEmptyString(storyKey) || !isNonEmptyString(workflow) || !isNonEmptyString(status)) {
    return {
      success: false,
      error: 'storyKey, workflow, and status are required and cannot be empty',
    };
  }

  if (!VALID_WORKFLOWS.includes(workflow as WorkflowType)) {
    return {
      success: false,
      error: `Invalid workflow "${workflow}". Must be one of: ${VALID_WORKFLOWS.join(', ')}`,
    };
  }

  try {
    const statusCheck = await execAsync('git status --porcelain');
    if (statusCheck.exitCode !== 0) {
      return { success: false, error: `Failed to check git status: ${statusCheck.stderr}` };
    }

    if (statusCheck.stdout.trim() === '') {
      return { success: true, message: 'No changes to commit' };
    }

    const addResult = await execAsync('git add -A');
    if (addResult.exitCode !== 0) {
      return { success: false, error: `Failed to stage changes: ${addResult.stderr}` };
    }

    const commitMessage = `[${sanitize(storyKey)}] ${sanitize(workflow)}: ${sanitize(status)}`;
    const escapedMessage = escapeForShell(commitMessage);

    const commitResult = await execAsync(`git commit -m "${escapedMessage}"`);
    if (commitResult.exitCode !== 0) {
      return { success: false, error: `Failed to commit changes: ${commitResult.stderr}` };
    }

    return { success: true, message: commitMessage };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

const VALID_BRANCH_NAME = /^[a-zA-Z0-9._\-/]+$/;
const VALID_STORY_KEY = /^[\w\-.]+$/;
const MAX_STORY_KEY_LENGTH = 128;

export async function squashMerge(
  storyKey: string,
  branchName: string,
  options: SquashMergeOptions = {},
): Promise<SquashMergeResult> {
  if (!isNonEmptyString(storyKey) || !isNonEmptyString(branchName)) {
    return {
      success: false,
      error: 'storyKey and branchName are required and cannot be empty',
    };
  }

  if (!VALID_STORY_KEY.test(storyKey) || storyKey.length > MAX_STORY_KEY_LENGTH) {
    return {
      success: false,
      error: `Invalid storyKey "${storyKey}". Must match ${VALID_STORY_KEY} and be at most ${MAX_STORY_KEY_LENGTH} characters.`,
    };
  }

  if (!VALID_BRANCH_NAME.test(branchName)) {
    return {
      success: false,
      error: `Invalid branchName "${branchName}". Must match ${VALID_BRANCH_NAME}.`,
    };
  }

  if (options.approved === false) {
    return {
      success: false,
      error: 'Story has not been approved. Squash merge requires code-review approval.',
    };
  }

  let checkedOutMain = false;
  let committed = false;

  try {
    // Step 1 (spec order): Verify on feature branch
    const currentBranch = await execAsync('git branch --show-current');
    if (currentBranch.exitCode !== 0 || currentBranch.stdout.trim() !== branchName) {
      return {
        success: false,
        error: `Must be on feature branch "${branchName}" to squash merge`,
      };
    }

    // Check for dirty working tree before any destructive operations
    const statusCheck = await execAsync('git status --porcelain');
    if (statusCheck.exitCode !== 0) {
      return { success: false, error: `Failed to check git status: ${statusCheck.stderr}` };
    }
    if (statusCheck.stdout.trim() !== '') {
      return {
        success: false,
        error: 'Working tree is dirty. Commit or stash changes before squash merge.',
      };
    }

    // Step AC-5: Verify fast-forward not possible (compare main to feature branch)
    const escapedBranch = escapeForShell(branchName);
    const mergeBase = await execAsync(`git merge-base --is-ancestor main "${escapedBranch}"`);
    if (mergeBase.exitCode === 0) {
      return {
        success: false,
        error: 'Fast-forward merge is possible (main is an ancestor of the feature branch). Squash merge requires diverged history.',
      };
    }

    // Step 2: Checkout main
    const checkoutResult = await execAsync('git checkout main');
    if (checkoutResult.exitCode !== 0) {
      return {
        success: false,
        error: `Failed to checkout main: ${checkoutResult.stderr}`,
      };
    }
    checkedOutMain = true;

    // Step 3: Squash merge
    const mergeResult = await execAsync(`git merge --squash "${escapedBranch}"`);
    if (mergeResult.exitCode !== 0) {
      // Squash merges don't create MERGE_HEAD, so use git reset instead of git merge --abort
      await execAsync('git reset --hard HEAD');
      const mergeOutput = mergeResult.stderr + '\n' + mergeResult.stdout;
      const conflictMarkers = ['CONFLICT', '<<<<<<<', '=======', '>>>>>>>'];
      const hasConflicts = conflictMarkers.some(m => mergeOutput.includes(m));
      if (hasConflicts) {
        await execAsync(`git checkout "${escapedBranch}"`);
        checkedOutMain = false;
        return {
          success: false,
          error: `Merge conflict detected. Please resolve conflicts manually. Conflict info: ${mergeOutput.split('\n').find(l => l.includes('CONFLICT')) ?? mergeOutput}`,
        };
      }
      await execAsync(`git checkout "${escapedBranch}"`);
      checkedOutMain = false;
      return {
        success: false,
        error: `Failed to squash merge: ${mergeResult.stderr}`,
      };
    }

    // Step 4: Commit
    const mergeMessage = `[${sanitize(storyKey)}] Merge story`;
    const escapedMessage = escapeForShell(mergeMessage);

    const commitResult = await execAsync(`git commit -m "${escapedMessage}"`);
    if (commitResult.exitCode !== 0) {
      await execAsync('git reset --hard HEAD');
      await execAsync(`git checkout "${escapedBranch}"`);
      checkedOutMain = false;
      return {
        success: false,
        error: `Failed to commit squash merge: ${commitResult.stderr}`,
      };
    }
    committed = true;

    // Step 5: Push main
    const pushResult = await execAsync('git push origin main');
    if (pushResult.exitCode !== 0) {
      await execAsync('git reset --hard HEAD~1');
      await execAsync(`git checkout "${escapedBranch}"`);
      checkedOutMain = false;
      committed = false;
      return {
        success: false,
        error: `Failed to push main: ${pushResult.stderr}`,
      };
    }

    // Step 6 & 7: Branch cleanup (track warnings for partial failures)
    const warnings: string[] = [];

    const localDelete = await execAsync(`git branch -D "${escapedBranch}"`);
    if (localDelete.exitCode !== 0) {
      warnings.push(`Failed to delete local branch: ${localDelete.stderr}`);
    }

    const remoteDelete = await execAsync(`git push origin --delete "${escapedBranch}"`);
    if (remoteDelete.exitCode !== 0) {
      warnings.push(`Failed to delete remote branch: ${remoteDelete.stderr}`);
    }

    return {
      success: true,
      message: `${storyKey} squash-merged to main`,
      ...(warnings.length > 0 ? { warnings } : {}),
    };
  } catch (err) {
    // Attempt rollback on unexpected errors
    try {
      if (committed) {
        await execAsync('git reset --hard HEAD~1');
      } else if (checkedOutMain) {
        await execAsync('git reset --hard HEAD');
      }
      if (checkedOutMain) {
        const escapedBranch = escapeForShell(branchName);
        await execAsync(`git checkout "${escapedBranch}"`);
      }
    } catch {
      // Rollback failed — nothing more we can do
    }
    return {
      success: false,
      error: `Squash merge failed unexpectedly: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

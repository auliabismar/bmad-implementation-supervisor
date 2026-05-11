import { execAsync, getPlatform } from '../utils/platform.js';

export type CommitResult =
  | { success: true; message: string }
  | { success: false; error: string };

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
import { getAllCheckpoints, type CheckpointRecord } from './checkpoint';
import { loadSprintStatus, getSprintStatus, getStory, type StoryInfo } from './sprint-status';
import { type WorkflowType } from './state-machine';

export interface RecoveryContext {
  storyKey: string;
  lastCheckpoint: CheckpointRecord;
  workflow: WorkflowType;
  resumeFromStatus: string;
  attemptCount: number;
  storyInSprint: StoryInfo | null;
  hasConflict: boolean;
  conflictDetails: string | null;
}

export interface RecoveryResult {
  canRecover: boolean;
  shouldRecover: boolean;
  context: RecoveryContext | null;
  error: string | null;
}

export class RecoveryManager {
  private requireHumanConfirmation: boolean = true;

  async checkForPendingCheckpoint(): Promise<CheckpointRecord | null> {
    const checkpoints = await getAllCheckpoints();
    if (checkpoints.length === 0) {
      return null;
    }
    return checkpoints[0] ?? null;
  }

  async analyzeRecovery(
    checkpoint: CheckpointRecord
  ): Promise<RecoveryContext> {
    loadSprintStatus();
    const storyInSprint = getStory(checkpoint.story_key);

    let hasConflict = false;
    let conflictDetails: string | null = null;

    if (storyInSprint) {
      const checkpointStatus = checkpoint.status;
      const sprintStatus = storyInSprint.status;

      if (checkpointStatus !== sprintStatus) {
        hasConflict = true;
        conflictDetails = `Checkpoint shows status "${checkpointStatus}" but sprint-status.yaml shows "${sprintStatus}"`;
      }
    }

    const workflow = this.inferWorkflow(checkpoint.workflow);

    return {
      storyKey: checkpoint.story_key,
      lastCheckpoint: checkpoint,
      workflow,
      resumeFromStatus: checkpoint.status,
      attemptCount: checkpoint.attempt,
      storyInSprint,
      hasConflict,
      conflictDetails,
    };
  }

  private inferWorkflow(workflowStr: string | null | undefined): WorkflowType {
    if (!workflowStr) return 'dev-story';
    
    switch (workflowStr) {
      case 'dev-story': return 'dev-story';
      case 'code-review': return 'code-review';
      case 'create-story': return 'create-story';
      default: return 'dev-story';
    }
  }

  async proposeRecovery(context: RecoveryContext): Promise<RecoveryResult> {
    if (context.hasConflict) {
      return {
        canRecover: true,
        shouldRecover: false,
        context,
        error: context.conflictDetails,
      };
    }

    if (!context.storyInSprint) {
      return {
        canRecover: true,
        shouldRecover: false,
        context,
        error: `Story ${context.storyKey} not found in sprint-status.yaml`,
      };
    }

    if (context.storyInSprint.status === 'done') {
      return {
        canRecover: true,
        shouldRecover: false,
        context,
        error: `Story ${context.storyKey} is already marked as done in sprint-status.yaml`,
      };
    }

    if (this.requireHumanConfirmation) {
      return {
        canRecover: true,
        shouldRecover: false,
        context,
        error: null,
      };
    }

    return {
      canRecover: true,
      shouldRecover: true,
      context,
      error: null,
    };
  }

  async executeRecovery(context: RecoveryContext): Promise<{
    success: boolean;
    nextStatus: string;
    error?: string;
  }> {
    if (!context.storyInSprint) {
      return {
        success: false,
        nextStatus: '',
        error: `Cannot recover: story ${context.storyKey} not in sprint`,
      };
    }

    const currentStatus = context.storyInSprint.status;
    const checkpointStatus = context.lastCheckpoint.status;

    if (currentStatus === checkpointStatus) {
      return {
        success: true,
        nextStatus: checkpointStatus,
      };
    }

    const validNextStatus = this.getNextValidStatus(currentStatus);
    if (validNextStatus === checkpointStatus || currentStatus === 'ready-for-dev') {
      return {
        success: true,
        nextStatus: checkpointStatus,
      };
    }

    return {
      success: false,
      nextStatus: '',
      error: `Cannot jump from ${currentStatus} to ${checkpointStatus}`,
    };
  }

  private getNextValidStatus(current: string): string {
    switch (current) {
      case 'backlog': return 'ready-for-dev';
      case 'ready-for-dev': return 'in-progress';
      case 'in-progress': return 'review';
      case 'review': return 'done';
      default: return current;
    }
  }

  async startFresh(storyKey: string): Promise<void> {
    // No action needed - user chooses to ignore checkpoint
    // The supervisor will start fresh based on sprint-status.yaml
  }

  setHumanConfirmationRequired(required: boolean): void {
    this.requireHumanConfirmation = required;
  }

  isHumanConfirmationRequired(): boolean {
    return this.requireHumanConfirmation;
  }
}

export function createRecoveryManager(): RecoveryManager {
  return new RecoveryManager();
}
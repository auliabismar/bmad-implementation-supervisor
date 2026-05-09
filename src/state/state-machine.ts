import {
  type StoryStatus,
  type EpicStatus,
  type StoryInfo,
  type EpicInfo,
  type SprintStatus,
  StoryStatusEnum,
  EpicStatusEnum,
  updateStoryStatus,
  updateEpicStatus,
  getEpic as getEpicFromSprint,
  getStoriesByEpic,
} from './sprint-status';

export type WorkflowType = 'create-story' | 'dev-story' | 'code-review';

export interface StoryContext {
  story: StoryInfo;
  currentWorkflow: WorkflowType | null;
  attempt: number;
  lastError: string | null;
  lastCheckpoint: Date | null;
}

export interface TransitionResult {
  success: boolean;
  story: StoryInfo;
  epic?: EpicInfo;
  checkpointRequired: boolean;
}

export class InvalidTransitionError extends Error {
  constructor(
    public currentState: StoryStatus,
    public attemptedState: StoryStatus,
    public validStates: StoryStatus[]
  ) {
    super(`Invalid transition: ${currentState} → ${attemptedState}. Valid: ${validStates.join(', ')}`);
    this.name = 'InvalidTransitionError';
  }
}

const VALID_STORY_TRANSITIONS: Record<StoryStatus, StoryStatus[]> = {
  'backlog': ['ready-for-dev'],
  'ready-for-dev': ['in-progress'],
  'in-progress': ['review'],
  'review': ['done', 'in-progress'],
  'done': [],
};

const VALID_EPIC_TRANSITIONS: Record<EpicStatus, EpicStatus[]> = {
  'backlog': ['in-progress'],
  'in-progress': ['done'],
  'done': [],
};

export class StoryStateMachine {
  private checkpointCallbacks: Array<(context: StoryContext) => void> = [];

  constructor() {}

  canTransition(current: StoryStatus, next: StoryStatus): boolean {
    const validNextStates = VALID_STORY_TRANSITIONS[current];
    if (!validNextStates) return false;
    return validNextStates.includes(next);
  }

  getValidTransitions(status: StoryStatus): StoryStatus[] {
    return VALID_STORY_TRANSITIONS[status] ?? [];
  }

  transition(story: StoryInfo, newStatus: StoryStatus, context?: Partial<StoryContext>): TransitionResult {
    if (!this.canTransition(story.status, newStatus)) {
      const validStates = this.getValidTransitions(story.status);
      throw new InvalidTransitionError(story.status, newStatus, validStates);
    }

    updateStoryStatus(story.key, newStatus);

    const updatedStory: StoryInfo = {
      ...story,
      status: newStatus,
    };

    let epic: EpicInfo | undefined;
    let checkpointRequired = true;

    if (newStatus !== 'backlog') {
      const epicInfo = getEpicFromSprint(story.epicNum);
      if (epicInfo && epicInfo.status === 'backlog') {
        const updatedEpic = this.transitionEpic(story.epicNum, 'in-progress');
        epic = updatedEpic;
      } else if (epicInfo) {
        epic = epicInfo;
      }
    }

    if (newStatus === 'done') {
      const epicInfo = getEpicFromSprint(story.epicNum);
      if (epicInfo && epicInfo.status === 'in-progress' && this.checkEpicCompletion(story.epicNum)) {
        const updatedEpic = this.transitionEpic(story.epicNum, 'done');
        epic = updatedEpic;
      } else if (epicInfo) {
        epic = epicInfo;
      }
    }

    const storyContext: StoryContext = {
      story: updatedStory,
      currentWorkflow: context?.currentWorkflow ?? null,
      attempt: context?.attempt ?? 1,
      lastError: context?.lastError ?? null,
      lastCheckpoint: new Date(),
    };

    for (const callback of this.checkpointCallbacks) {
      try {
        callback(storyContext);
      } catch (callbackError) {
        console.error(`Checkpoint callback failed: ${callbackError instanceof Error ? callbackError.message : String(callbackError)}`);
      }
    }

    return {
      success: true,
      story: updatedStory,
      epic,
      checkpointRequired,
    };
  }

  transitionEpic(epicNum: number, newStatus: EpicStatus): EpicInfo {
    const key = `epic-${epicNum}`;
    const epicInfo = getEpicFromSprint(epicNum);

    if (!epicInfo) {
      throw new Error(`Epic not found: epic-${epicNum}`);
    }

    if (!VALID_EPIC_TRANSITIONS[epicInfo.status].includes(newStatus)) {
      throw new Error(
        `Invalid epic transition: ${epicInfo.status} → ${newStatus}. Valid: ${VALID_EPIC_TRANSITIONS[epicInfo.status].join(', ')}`
      );
    }

    updateEpicStatus(epicNum, newStatus);

    return {
      key,
      epicNum,
      status: newStatus,
    };
  }

  checkEpicCompletion(epicNum: number): boolean {
    const stories = getStoriesByEpic(epicNum);
    if (stories.length === 0) return false;

    return stories.every(s => s.status === 'done');
  }

  onCheckpoint(callback: (context: StoryContext) => void): void {
    this.checkpointCallbacks.push(callback);
  }

  startWorkflow(story: StoryInfo, workflow: WorkflowType): StoryContext {
    return {
      story,
      currentWorkflow: workflow,
      attempt: 1,
      lastError: null,
      lastCheckpoint: new Date(),
    };
  }

  incrementAttempt(context: StoryContext): void {
    context.attempt += 1;
  }

  recordError(context: StoryContext, error: string): void {
    context.lastError = error;
  }
}
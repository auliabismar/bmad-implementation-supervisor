import { StoryStateMachine, type WorkflowType } from './state/state-machine';
import { getSprintStatus, loadSprintStatus, getNextStory, getStory, type StoryInfo } from './state/sprint-status';

export interface SupervisorStatus {
  running: boolean;
  paused: boolean;
  currentStory: StoryInfo | null;
}

export class Supervisor {
  private stateMachine: StoryStateMachine;
  private running: boolean = false;
  private paused: boolean = false;

  constructor() {
    this.stateMachine = new StoryStateMachine();
  }

  async runNextStory(): Promise<void> {
    if (this.paused) {
      this.log('Supervisor is paused, skipping story');
      return;
    }

    loadSprintStatus();
    const story = getNextStory();

    if (!story) {
      this.log('No more stories to process');
      return;
    }

    this.log(`Processing story: ${story.key}`);

    try {
      const result = this.stateMachine.transition(story, 'ready-for-dev');
      this.log(`Story ${story.key} transitioned to ${result.story.status}`);
      if (result.epic) {
        this.log(`Epic ${result.epic.key} is now ${result.epic.status}`);
      }
    } catch (error) {
      this.log(`Failed to transition story ${story.key}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async runWorkflow(story: StoryInfo, workflow: WorkflowType): Promise<void> {
    const context = this.stateMachine.startWorkflow(story, workflow);
    this.log(`Starting workflow ${workflow} for story ${story.key}`);

    try {
      if (workflow === 'dev-story') {
        await this.runDevStory(story, context);
      } else if (workflow === 'code-review') {
        await this.runCodeReview(story, context);
      }
    } catch (error) {
      this.stateMachine.recordError(context, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async runDevStory(story: StoryInfo, context: ReturnType<typeof this.stateMachine.startWorkflow>): Promise<void> {
    this.log(`Dev story workflow running for ${story.key}`);
    this.stateMachine.transition(story, 'in-progress');
  }

  private async runCodeReview(story: StoryInfo, context: ReturnType<typeof this.stateMachine.startWorkflow>): Promise<boolean> {
    this.log(`Code review workflow running for ${story.key}`);
    return true;
  }

  private log(message: string): void {
    console.log(`[Supervisor] ${message}`);
  }

  pause(): void {
    this.paused = true;
    this.log('Supervisor paused');
  }

  resume(): void {
    this.paused = false;
    this.log('Supervisor resumed');
  }

  isPaused(): boolean {
    return this.paused;
  }

  async retryStory(storyKey: string): Promise<void> {
    const story = getStory(storyKey);
    if (!story) {
      throw new Error(`Story not found: ${storyKey}`);
    }
    
    this.log(`Retrying story: ${storyKey} (current status: ${story.status})`);
    
    if (story.status === 'done' || story.status === 'backlog') {
      this.stateMachine.transition(story, 'ready-for-dev');
    } else if (story.status === 'in-progress' || story.status === 'review') {
      this.log(`Story ${storyKey} is already ${story.status}, no transition needed`);
    } else if (story.status === 'failed') {
      this.stateMachine.transition(story, 'ready-for-dev');
    }
  }

  skipStory(storyKey: string): void {
    const story = getStory(storyKey);
    if (!story) {
      throw new Error(`Story not found: ${storyKey}`);
    }
    
    this.log(`Skipping story: ${storyKey}`);
    this.stateMachine.transition(story, 'done');
  }

  getCurrentStory(): StoryInfo | null {
    const status = getSprintStatus();
    
    for (const [key, storyStatus] of Object.entries(status.development_status)) {
      if (storyStatus === 'in-progress' || storyStatus === 'review') {
        return getStory(key);
      }
    }
    
    return null;
  }

  getStatus(): SupervisorStatus {
    return {
      running: this.running,
      paused: this.paused,
      currentStory: this.getCurrentStory(),
    };
  }

  stop(): void {
    this.running = false;
    this.log('Supervisor stopped');
  }

  start(): void {
    this.running = true;
    this.log('Supervisor started');
  }

  isRunning(): boolean {
    return this.running;
  }
}
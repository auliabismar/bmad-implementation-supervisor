import { StoryStateMachine, type WorkflowType } from './state/state-machine';
import { getSprintStatus, loadSprintStatus, getNextStory, type StoryInfo } from './state/sprint-status';

export class Supervisor {
  private stateMachine: StoryStateMachine;
  private running: boolean = false;

  constructor() {
    this.stateMachine = new StoryStateMachine();
  }

  async runNextStory(): Promise<void> {
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

  stop(): void {
    this.running = false;
    this.log('Supervisor stopped');
  }
}
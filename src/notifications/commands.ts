import type { StoryInfo } from '../state/sprint-status.js';
import { getSprintStatus, getStory, getStoriesByEpic } from '../state/sprint-status.js';

export interface CommandResult {
  success: boolean;
  message: string;
}

export interface CommandContext {
  supervisor: SupervisorCommands;
  stateMachine: StateMachineCommands;
  telegram: TelegramCommands;
}

export interface SupervisorCommands {
  pause(): void;
  resume(): void;
  stop(): void;
  retryStory(storyKey: string): Promise<void>;
  skipStory(storyKey: string): void;
  getCurrentStory(): StoryInfo | null;
  getStatus(): SupervisorStatus;
}

export interface StateMachineCommands {
  transition(story: StoryInfo, newStatus: string): void;
}

export interface TelegramCommands {
  sendMessage(text: string): Promise<void>;
}

export interface CommandHandler {
  name: string;
  description: string;
  execute(args: string[], context: CommandContext): Promise<CommandResult>;
}

export interface SupervisorStatus {
  running: boolean;
  paused: boolean;
  currentStory: StoryInfo | null;
}

export class StatusCommand implements CommandHandler {
  name = 'status';
  description = 'Show current status';

  async execute(_args: string[], _ctx: CommandContext): Promise<CommandResult> {
    const sprintStatus = getSprintStatus();
    const currentStory = this.findCurrentStory(sprintStatus.development_status);
    const queue = this.getQueue(sprintStatus.development_status);

    const statusText = this.formatStatus(sprintStatus, currentStory, queue);
    return { success: true, message: statusText };
  }

  private findCurrentStory(developmentStatus: Record<string, string>): StoryInfo | null {
    for (const [key, status] of Object.entries(developmentStatus)) {
      if (status === 'in-progress' || status === 'review') {
        return getStory(key);
      }
    }
    return null;
  }

  private getQueue(developmentStatus: Record<string, string>): string[] {
    return Object.entries(developmentStatus)
      .filter(([, s]) => s === 'backlog')
      .map(([key]) => key)
      .filter(key => key.match(/^\d+-\d+-/));
  }

  private formatStatus(sprintStatus: ReturnType<typeof getSprintStatus>, currentStory: StoryInfo | null, queue: string[]): string {
    const counts = this.getProgressCounts(sprintStatus.development_status);
    const epicStatus = this.getEpicStatuses(sprintStatus.development_status);

    return `📊 **Supervisor Status**

**Current Story:** ${currentStory?.key ?? 'None'}
**Status:** ${currentStory?.status ?? '-'}
**Queue:** ${queue.length} stories pending

**Progress:**
✅ Done: ${counts.done}
🔄 In Progress: ${counts.inProgress}
👀 Review: ${counts.review}
⏳ Backlog: ${counts.backlog}

**Epics:**
${epicStatus}
`.trim();
  }

  private getProgressCounts(developmentStatus: Record<string, string>): { done: number; inProgress: number; review: number; backlog: number } {
    const counts = { done: 0, inProgress: 0, review: 0, backlog: 0 };

    for (const [key, status] of Object.entries(developmentStatus)) {
      if (!key.match(/^\d+-\d+-/)) continue;
      if (status === 'done') counts.done++;
      else if (status === 'in-progress') counts.inProgress++;
      else if (status === 'review') counts.review++;
      else if (status === 'backlog') counts.backlog++;
    }

    return counts;
  }

  private getEpicStatuses(developmentStatus: Record<string, string>): string {
    const epics: Record<number, string> = {};
    
    for (const [key, status] of Object.entries(developmentStatus)) {
      if (key.startsWith('epic-') && !key.includes('retrospective')) {
        const epicNum = parseInt(key.replace('epic-', ''), 10);
        if (!isNaN(epicNum)) {
          epics[epicNum] = status;
        }
      }
    }

    return Object.entries(epics)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([num, status]) => {
        const icon = status === 'done' ? '✅' : status === 'in-progress' ? '🔄' : '⏳';
        return `${icon} Epic ${num}: ${status}`;
      })
      .join('\n');
  }
}

export class PauseCommand implements CommandHandler {
  name = 'pause';
  description = 'Pause all processing';

  async execute(_args: string[], ctx: CommandContext): Promise<CommandResult> {
    ctx.supervisor.pause();
    return { success: true, message: '⏸️ Supervisor paused. Use /resume to continue.' };
  }
}

export class ResumeCommand implements CommandHandler {
  name = 'resume';
  description = 'Resume processing';

  async execute(_args: string[], ctx: CommandContext): Promise<CommandResult> {
    ctx.supervisor.resume();
    return { success: true, message: '▶️ Supervisor resumed.' };
  }
}

export class RetryCommand implements CommandHandler {
  name = 'retry';
  description = 'Retry a story';

  async execute(args: string[], ctx: CommandContext): Promise<CommandResult> {
    const storyKey = args[0];
    if (!storyKey) {
      return { success: false, message: 'Usage: /retry <story-key>\nExample: /retry 1-2-config-loading' };
    }

    const story = getStory(storyKey);
    if (!story) {
      return { success: false, message: `Story not found: ${storyKey}` };
    }

    await ctx.supervisor.retryStory(storyKey);
    return { success: true, message: `🔄 Retrying story: ${storyKey}` };
  }
}

export class SkipCommand implements CommandHandler {
  name = 'skip';
  description = 'Skip a story';

  async execute(args: string[], ctx: CommandContext): Promise<CommandResult> {
    const storyKey = args[0];
    if (!storyKey) {
      return { success: false, message: 'Usage: /skip <story-key>\nExample: /skip 1-3-sprint-status-parser' };
    }

    const story = getStory(storyKey);
    if (!story) {
      return { success: false, message: `Story not found: ${storyKey}` };
    }

    ctx.supervisor.skipStory(storyKey);
    return { success: true, message: `⏭️ Skipped story: ${storyKey}` };
  }
}

export class AbortCommand implements CommandHandler {
  name = 'abort';
  description = 'Abort and stop supervisor';

  async execute(_args: string[], ctx: CommandContext): Promise<CommandResult> {
    ctx.supervisor.stop();
    return { success: true, message: '🛑 Supervisor stopped.' };
  }
}

export class HelpCommand implements CommandHandler {
  name = 'help';
  description = 'Show available commands';

  async execute(_args: string[], _ctx: CommandContext): Promise<CommandResult> {
    const helpText = `📚 **Available Commands**

| Command | Description |
|---------|-------------|
| \`/status\` | Show current status |
| \`/pause\` | Pause supervisor |
| \`/resume\` | Resume supervisor |
| \`/retry <key>\` | Retry a story |
| \`/skip <key>\` | Skip a story |
| \`/abort\` | Stop supervisor |
| \`/help\` | Show this help |

Examples:
- \`/retry 1-2-config-loading\`
- \`/skip 1-3-sprint-status-parser\`
`.trim();

    return { success: true, message: helpText };
  }
}

export class InputCommand implements CommandHandler {
  name = 'input';
  description = 'Provide input to agent';

  async execute(args: string[], ctx: CommandContext): Promise<CommandResult> {
    const input = args.join(' ');
    if (!input) {
      return { success: false, message: 'Usage: /input <text>\nExample: /input yes, proceed with implementation' };
    }

    return { success: true, message: `📝 Input received: "${input}"` };
  }
}

export const commandHandlers: CommandHandler[] = [
  new StatusCommand(),
  new PauseCommand(),
  new ResumeCommand(),
  new RetryCommand(),
  new SkipCommand(),
  new AbortCommand(),
  new HelpCommand(),
  new InputCommand(),
];

export function getCommandHandler(name: string): CommandHandler | undefined {
  return commandHandlers.find(h => h.name === name);
}
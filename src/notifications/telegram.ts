import { Bot, Context } from 'grammy';
import { Menu } from '@grammyjs/menu';
import { EventEmitter } from 'events';
import { getCommandHandler, type CommandContext, type SupervisorCommands, type StateMachineCommands } from './commands.js';
import { createStatusKeyboard } from './keyboards.js';

export interface Button {
  label: string;
  callback: (ctx: Context) => Promise<void>;
}

export interface StoryInfo {
  key: string;
  title: string;
}

export interface TelegramNotifierConfig {
  commandContext?: CommandContext;
  authorizedChatIds?: string[];
}

export class TelegramNotifier extends EventEmitter {
  private bot: Bot;
  private chatId: string;
  private running = false;
  private config: TelegramNotifierConfig;
  private statusKeyboard?: Menu;

  constructor(botToken: string, chatId: string, config: TelegramNotifierConfig = {}) {
    super();
    this.bot = new Bot(botToken);
    this.chatId = chatId;
    this.config = config;
    
    this.bot.catch((err) => {
      console.error('Grammy error:', err);
    });

    this.setupCommands();
  }

  setCommandContext(context: CommandContext): void {
    this.config.commandContext = context;
    if (!this.statusKeyboard) {
      this.statusKeyboard = createStatusKeyboard({
        supervisor: context.supervisor,
        getCurrentStoryKey: () => context.supervisor.getCurrentStory()?.key ?? null
      });
      this.bot.use(this.statusKeyboard);
    }
  }

  private isAuthorized(ctx: Context): boolean {
    if (!this.config.authorizedChatIds || this.config.authorizedChatIds.length === 0) {
      console.warn('[TelegramNotifier] No authorizedChatIds configured. Defaulting to deny for security.');
      return false;
    }
    const chatId = ctx.message?.chat.id.toString() ?? ctx.callbackQuery?.message?.chat.id.toString();
    if (!chatId) {
      console.warn('[TelegramNotifier] Unable to extract chat ID for authorization check');
      return false;
    }
    const authorized = this.config.authorizedChatIds.includes(chatId);
    if (!authorized) {
      console.warn(`[TelegramNotifier] Unauthorized access attempt from chat ID: ${chatId}`);
    }
    return authorized;
  }

  private async handleCommand(ctx: Context, command: string, args: string[]): Promise<void> {
    if (!this.isAuthorized(ctx)) {
      await ctx.reply('❌ Unauthorized');
      return;
    }

    const handler = getCommandHandler(command);
    if (!handler) {
      await ctx.reply(`Unknown command: /${command}\nUse /help for available commands.`);
      return;
    }

    if (!this.config.commandContext) {
      await ctx.reply('⚠️ Supervisor not initialized');
      return;
    }

    try {
      const result = await handler.execute(args, this.config.commandContext);
      if (command === 'status' && this.statusKeyboard) {
        await ctx.reply(result.message, { parse_mode: 'Markdown', reply_markup: this.statusKeyboard });
      } else {
        await ctx.reply(result.message, { parse_mode: 'Markdown' });
      }
      this.emit('command', command, args, result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      await ctx.reply(`❌ Error: ${errorMessage}`);
      this.emit('command-error', command, error);
    }
  }

  private setupCommands(): void {
    this.bot.command('status', async (ctx) => {
      const text = ctx.message?.text ?? '';
      const args = text.split(' ').slice(1);
      await this.handleCommand(ctx, 'status', args);
    });

    this.bot.command('pause', async (ctx) => {
      await this.handleCommand(ctx, 'pause', []);
    });

    this.bot.command('resume', async (ctx) => {
      await this.handleCommand(ctx, 'resume', []);
    });

    this.bot.command('retry', async (ctx) => {
      const text = ctx.message?.text ?? '';
      const args = text.split(' ').slice(1);
      await this.handleCommand(ctx, 'retry', args);
    });

    this.bot.command('skip', async (ctx) => {
      const text = ctx.message?.text ?? '';
      const args = text.split(' ').slice(1);
      await this.handleCommand(ctx, 'skip', args);
    });

    this.bot.command('abort', async (ctx) => {
      await this.handleCommand(ctx, 'abort', []);
    });

    this.bot.command('help', async (ctx) => {
      await this.handleCommand(ctx, 'help', []);
    });

    this.bot.command('input', async (ctx) => {
      const text = ctx.message?.text ?? '';
      const args = text.split(' ').slice(1);
      await this.handleCommand(ctx, 'input', args);
    });
  }

  async sendMessage(text: string): Promise<void> {
    try {
      await this.bot.api.sendMessage(this.chatId, text);
    } catch (error) {
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async sendWithButtons(text: string, buttons: Button[]): Promise<void> {
    const menuId = `menu-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const menu = new Menu(menuId);

    for (const button of buttons) {
      menu.text(button.label, async (ctx) => {
        try {
          await button.callback(ctx);
        } catch (e) {
          console.error('Button callback error:', e);
        }
        await ctx.editMessageText(`[Selected: ${button.label}]\n\n${text}`).catch(() => {});
      });
    }

    this.bot.use(menu);

    try {
      await this.bot.api.sendMessage(this.chatId, text, {
        reply_markup: menu,
      });
    } catch (error) {
      throw new Error(`Failed to send message with buttons: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async sendStoryUpdate(story: StoryInfo, workflow: string, status: string): Promise<void> {
    const text = `[STATUS] Story: ${story.key} | Workflow: ${workflow} | Status: ${status}`;
    await this.sendMessage(text);
  }

  async sendError(storyKey: string, error: string): Promise<void> {
    const text = `[ERROR] Story: ${storyKey}\n${error}`;
    await this.sendMessage(text);
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    this.bot.start().catch((err) => {
      console.error('Bot start error:', err);
      this.running = false;
    });
  }

  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }
    this.running = false;
    await this.bot.stop();
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.bot.api.getMe();
      return true;
    } catch {
      return false;
    }
  }

  isRunning(): boolean {
    return this.running;
  }
}

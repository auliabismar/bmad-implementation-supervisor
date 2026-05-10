import { Bot, Context } from 'grammy';
import { Menu } from '@grammyjs/menu';
import { EventEmitter } from 'events';

export interface Button {
  label: string;
  callback: (ctx: Context) => Promise<void>;
}

export interface StoryInfo {
  key: string;
  title: string;
}

export class TelegramNotifier extends EventEmitter {
  private bot: Bot;
  private chatId: string;
  private running = false;

  constructor(botToken: string, chatId: string) {
    super();
    this.bot = new Bot(botToken);
    this.chatId = chatId;
    
    this.bot.catch((err) => {
      console.error('Grammy error:', err);
    });

    this.setupCommands();
  }

  private setupCommands(): void {
    const handleCmd = (cmd: string) => async (ctx: Context) => {
      this.emit('command', cmd);
      await ctx.reply(`Command /${cmd} received.`);
    };

    this.bot.command('status', handleCmd('status'));
    this.bot.command('pause', handleCmd('pause'));
    this.bot.command('resume', handleCmd('resume'));
    this.bot.command('retry', handleCmd('retry'));
    this.bot.command('skip', handleCmd('skip'));
    this.bot.command('abort', handleCmd('abort'));
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

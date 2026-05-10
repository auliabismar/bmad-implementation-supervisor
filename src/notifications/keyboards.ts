import { Menu } from '@grammyjs/menu';
import type { SupervisorCommands } from './commands.js';

export interface KeyboardConfig {
  supervisor: SupervisorCommands;
  getCurrentStoryKey: () => string | null;
}

export function createStatusKeyboard(config: KeyboardConfig): Menu {
  const menu = new Menu('status-keyboard');

  menu.text('▶️ Resume', async (ctx) => {
    config.supervisor.resume();
    await ctx.reply('Resumed!', { reply_markup: menu });
  });

  menu.text('⏸️ Pause', async (ctx) => {
    config.supervisor.pause();
    await ctx.reply('Paused!', { reply_markup: menu });
  });

  menu.text('🔄 Retry Current', async (ctx) => {
    const currentKey = config.getCurrentStoryKey();
    if (currentKey) {
      await config.supervisor.retryStory(currentKey);
      await ctx.reply(`Retrying: ${currentKey}`, { reply_markup: menu });
    } else {
      await ctx.reply('No current story to retry', { reply_markup: menu });
    }
  });

  menu.text('📊 Status', async (ctx) => {
    const status = config.supervisor.getStatus();
    const currentStory = status.currentStory?.key ?? 'None';
    const storyStatus = status.currentStory?.status ?? '-';
    const state = status.paused ? 'Paused' : status.running ? 'Running' : 'Stopped';
    
    await ctx.reply(
      `📊 Status\n\nCurrent: ${currentStory}\nStatus: ${storyStatus}\nState: ${state}`,
      { reply_markup: menu }
    );
  });

  menu.text('❓ Help', async (ctx) => {
    await ctx.reply(
      `📚 Commands\n\n▶️ Resume - Resume\n⏸️ Pause - Pause\n🔄 Retry - Retry current\n📊 Status - Show status\n❓ Help - Show help`,
      { reply_markup: menu }
    );
  });

  return menu;
}

export function createConfirmationKeyboard(action: string, onConfirm: () => void, onCancel: () => void): Menu {
  const menu = new Menu(`confirm-${action}`);

  menu.text('✅ Confirm', async (ctx) => {
    onConfirm();
    await ctx.editMessageText(`✅ ${action} confirmed!`);
    await ctx.answerCallbackQuery();
  });

  menu.text('❌ Cancel', async (ctx) => {
    onCancel();
    await ctx.editMessageText(`❌ ${action} cancelled`);
    await ctx.answerCallbackQuery();
  });

  return menu;
}

export function createPauseResumeKeyboard(supervisor: SupervisorCommands, isPaused: boolean): Menu {
  const menu = new Menu('pause-resume');
  
  if (isPaused) {
    menu.text('▶️ Resume', async (ctx) => {
      supervisor.resume();
      await ctx.editMessageText('▶️ Resumed!');
      await ctx.answerCallbackQuery();
    });
  } else {
    menu.text('⏸️ Pause', async (ctx) => {
      supervisor.pause();
      await ctx.editMessageText('⏸️ Paused!');
      await ctx.answerCallbackQuery();
    });
  }

  return menu;
}
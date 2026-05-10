import { getConfig } from '../config.js';
import { TelegramNotifier } from './telegram.js';

let telegramNotifierInstance: TelegramNotifier | null = null;

export function getTelegramNotifier(): TelegramNotifier {
  if (telegramNotifierInstance) {
    return telegramNotifierInstance;
  }

  const config = getConfig();
  const telegramConfig = config.notification?.telegram;

  if (config.notification?.channel !== 'telegram') {
    throw new Error('Telegram notification channel is not configured');
  }

  if (!telegramConfig) {
    throw new Error('Telegram notification channel is not configured properly');
  }

  const { bot_token: botToken, chat_id: chatId } = telegramConfig;

  if (!botToken || botToken === '') {
    throw new Error('Telegram bot token is not configured');
  }

  if (!chatId || chatId === '') {
    throw new Error('Telegram chat ID is not configured');
  }

  telegramNotifierInstance = new TelegramNotifier(botToken, chatId);

  return telegramNotifierInstance;
}

export async function initializeTelegramBot(): Promise<TelegramNotifier> {
  const notifier = getTelegramNotifier();

  const healthy = await notifier.healthCheck();
  if (!healthy) {
    telegramNotifierInstance = null;
    throw new Error('Telegram bot health check failed');
  }

  return notifier;
}

export async function startTelegramBot(): Promise<void> {
  const notifier = getTelegramNotifier();
  await notifier.start();
}

export async function stopTelegramBot(): Promise<void> {
  if (telegramNotifierInstance) {
    try {
      await telegramNotifierInstance.stop();
    } finally {
      telegramNotifierInstance = null;
    }
  }
}

export function resetTelegramBot(): void {
  telegramNotifierInstance = null;
}

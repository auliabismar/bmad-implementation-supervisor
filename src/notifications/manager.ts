import { TelegramNotifier } from './telegram.js';
import {
  NotificationPayload,
  NotificationEvent,
  NotificationFormatter,
  StoryNotificationFormatter,
} from './events.js';

export interface NotificationManagerConfig {
  notificationsEnabled?: boolean;
  dryRun?: boolean;
  flushIntervalMs?: number;
}

export class NotificationManager {
  private telegram: TelegramNotifier;
  private queue: NotificationPayload[] = [];
  private flushInterval: ReturnType<typeof setTimeout> | null = null;
  private formatter: NotificationFormatter;
  private config: NotificationManagerConfig;
  private logger: (message: string, ...args: any[]) => void;

  constructor(
    telegram: TelegramNotifier,
    config: NotificationManagerConfig = {},
    logger: (message: string, ...args: any[]) => void = console.log
  ) {
    this.telegram = telegram;
    this.formatter = new StoryNotificationFormatter();
    this.config = {
      notificationsEnabled: true,
      dryRun: false,
      flushIntervalMs: 1000,
      ...config,
    };
    this.logger = logger;
  }

  updateConfig(config: NotificationManagerConfig): void {
    this.config = { ...this.config, ...config };
  }

  async notify(payload: NotificationPayload): Promise<void> {
    if (!this.config.notificationsEnabled) {
      this.logger('[NotificationManager] Notifications disabled, skipping');
      return;
    }

    if (this.config.dryRun) {
      this.logger(`[DRY-RUN] Notification: ${this.formatter.format(payload)}`);
      return;
    }

    this.queue.push(payload);
    this.scheduleFlush();
  }

  async storyStarted(storyKey: string, workflow: string): Promise<void> {
    await this.notify({
      event: 'STORY_STARTED',
      storyKey,
      workflow,
      timestamp: new Date(),
    });
  }

  async storyCompleted(storyKey: string): Promise<void> {
    await this.notify({
      event: 'STORY_COMPLETED',
      storyKey,
      timestamp: new Date(),
    });
  }

  async storyFailed(storyKey: string, error: string): Promise<void> {
    await this.notify({
      event: 'STORY_FAILED',
      storyKey,
      details: error,
      timestamp: new Date(),
    });
  }

  async needsInput(storyKey: string, question: string): Promise<void> {
    await this.notify({
      event: 'NEEDS_INPUT',
      storyKey,
      details: question,
      timestamp: new Date(),
    });
  }

  async stallDetected(storyKey: string): Promise<void> {
    await this.notify({
      event: 'STALL_DETECTED',
      storyKey,
      details: 'No progress detected for 10+ minutes',
      timestamp: new Date(),
    });
  }

  async epicCompleted(epicKey: string, details: string): Promise<void> {
    await this.notify({
      event: 'EPIC_COMPLETED',
      storyKey: epicKey,
      details,
      timestamp: new Date(),
    });
  }

  async sprintCompleted(): Promise<void> {
    await this.notify({
      event: 'SPRINT_COMPLETED',
      details: 'All stories in sprint completed',
      timestamp: new Date(),
    });
  }

  async circuitBreakerOpened(details: string): Promise<void> {
    await this.notify({
      event: 'CIRCUIT_BREAKER_OPEN',
      details,
      timestamp: new Date(),
    });
  }

  async recoveryComplete(storyKey: string): Promise<void> {
    await this.notify({
      event: 'RECOVERY_COMPLETE',
      storyKey,
      timestamp: new Date(),
    });
  }

  private async flushQueue(): Promise<void> {
    if (this.queue.length === 0) {
      return;
    }

    const notifications = this.queue.splice(0, this.queue.length);
    const failedMessages: NotificationPayload[] = [];

    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      try {
        const text = this.formatter.format(notification);
        await this.telegram.sendMessage(text);
        this.logger('[NotificationManager] Sent notification successfully');
      } catch (error) {
        this.logger('[NotificationManager] Failed to send notification:', error);
        failedMessages.push(notification, ...notifications.slice(i + 1));
        break;
      }
    }

    if (failedMessages.length > 0) {
      this.queue.unshift(...failedMessages);
      this.scheduleFlush(5000); // Backoff for 5s
    }
  }

  private scheduleFlush(delayMs?: number): void {
    if (this.flushInterval) {
      return;
    }

    const timeout = setTimeout(async () => {
      this.flushInterval = null;
      await this.flushQueue();
    }, delayMs ?? this.config.flushIntervalMs);

    // unref() prevents the timeout from keeping the Node process alive
    timeout?.unref?.();
    this.flushInterval = timeout;
  }

  async flush(): Promise<void> {
    if (this.flushInterval) {
      clearTimeout(this.flushInterval);
      this.flushInterval = null;
    }
    await this.flushQueue();
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isDryRun(): boolean {
    return this.config.dryRun ?? false;
  }

  setDryRun(dryRun: boolean): void {
    this.config.dryRun = dryRun;
  }

  setNotificationsEnabled(enabled: boolean): void {
    this.config.notificationsEnabled = enabled;
  }
}

let notificationManagerInstance: NotificationManager | null = null;

export function getNotificationManager(
  telegram?: TelegramNotifier,
  config?: NotificationManagerConfig
): NotificationManager {
  if (notificationManagerInstance) {
    if (config) {
      notificationManagerInstance.updateConfig(config);
    }
    return notificationManagerInstance;
  }

  if (!telegram) {
    throw new Error('Telegram notifier must be provided on first initialization');
  }

  notificationManagerInstance = new NotificationManager(telegram, config);
  return notificationManagerInstance;
}

export function resetNotificationManager(): void {
  notificationManagerInstance = null;
}
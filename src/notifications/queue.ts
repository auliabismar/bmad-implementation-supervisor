import * as store from '../state/store.js';
import { TelegramNotifier } from './telegram.js';

export interface QueuedNotification {
  id: number;
  event: string;
  storyKey?: string;
  message: string;
  priority: number;
  retries: number;
  lastAttempt: Date | null;
  createdAt: Date;
  status: 'pending' | 'sent' | 'failed' | 'dead_letter';
}

export interface QueueStats {
  pending: number;
  deadLetter: number;
  maxSize: number;
}

export class NotificationQueue {
  private retryInterval: NodeJS.Timeout | null = null;
  private processing = false;
  private readonly maxRetries = 5;
  private readonly retryDelays = [10000, 30000, 60000, 300000];
  private readonly maxQueueSize: number;

  constructor(maxQueueSize = 100) {
    this.maxQueueSize = maxQueueSize > 0 ? maxQueueSize : 100;
  }

  async enqueue(
    event: string,
    message: string,
    storyKey?: string,
    priority = 2
  ): Promise<void> {
    if (!event || typeof event !== 'string' || !event.trim()) {
      throw new Error('Invalid event: must be a non-empty string');
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      throw new Error('Invalid message: must be a non-empty string');
    }
    if (priority < 1 || !Number.isInteger(priority)) {
      throw new Error('Invalid priority: must be a positive integer');
    }

    const pending = await this.getPendingCount();
    if (pending >= this.maxQueueSize) {
      await this.dropLowestPriority();
    }

    store.queueNotification(storyKey || null, event, message, priority);
  }

  async processQueue(telegram: TelegramNotifier): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      const pending = await this.getPending();

      for (const notification of pending) {
        try {
          await telegram.sendMessage(notification.message);
          await this.markSent(notification.id);
        } catch (error) {
          await this.handleFailure(notification, error as Error);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async handleFailure(
    notification: QueuedNotification,
    error: Error
  ): Promise<void> {
    const newRetries = notification.retries + 1;

    if (newRetries >= this.maxRetries) {
      await this.markDeadLetter(notification.id);
      console.error('Notification moved to dead letter queue', {
        notificationId: notification.id,
        error: error.message,
      });
      return;
    }

    const delayIndex = Math.min(newRetries - 1, this.retryDelays.length - 1);
    const delay = this.retryDelays[delayIndex] ?? this.retryDelays[this.retryDelays.length - 1];
    await this.scheduleRetry(notification.id, newRetries, delay);

    console.info('Notification retry scheduled', {
      notificationId: notification.id,
      retryCount: newRetries,
      delayMs: delay,
    });
  }

  private async scheduleRetry(
    id: number,
    retries: number,
    delayMs: number
  ): Promise<void> {
    const executeAt = new Date(Date.now() + delayMs).toISOString();
    store.scheduleNotificationRetry(id, retries, executeAt);
  }

  private async getPending(): Promise<QueuedNotification[]> {
    const records = store.getPendingNotifications();
    return records.map(r => ({
      id: r.id,
      event: r.event_type,
      storyKey: r.story_key || undefined,
      message: r.message,
      priority: r.priority,
      retries: r.retries || 0,
      lastAttempt: r.last_attempt ? new Date(r.last_attempt) : null,
      createdAt: new Date(r.created_at),
      status: (r.status as 'pending' | 'sent' | 'failed' | 'dead_letter') || 'pending'
    }));
  }

  private async markSent(id: number): Promise<void> {
    store.markNotificationSent(id);
  }

  private async markDeadLetter(id: number): Promise<void> {
    store.updateNotificationStatus(id, 'dead_letter');
  }

  private async dropLowestPriority(): Promise<void> {
    store.dropLowestPriorityNotification();
  }

  async getQueueStats(): Promise<QueueStats> {
    const pending = await this.getPendingCount();
    const deadLetter = await this.getDeadLetterCount();

    return { pending, deadLetter, maxSize: this.maxQueueSize };
  }

  async clearDeadLetter(): Promise<void> {
    store.clearDeadLetterNotifications();
  }

  private async getPendingCount(): Promise<number> {
    return store.getPendingNotificationsCount();
  }

  private async getDeadLetterCount(): Promise<number> {
    return store.getDeadLetterCount();
  }

  stop(): void {
    this.processing = false;
  }
}
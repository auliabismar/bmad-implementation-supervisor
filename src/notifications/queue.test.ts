import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as store from '../state/store.js';
import { NotificationQueue } from './queue.js';
import { TelegramNotifier } from './telegram.js';

describe('NotificationQueue', () => {
  let queue: NotificationQueue;
  let mockTelegram: Partial<TelegramNotifier>;
  const testDbPath = path.join(process.cwd(), 'data', 'queue-test.db');

  beforeEach(async () => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    await store.initDatabase(testDbPath);
    store.resetDatabase();
    await store.initDatabase(testDbPath); // Re-initialize to apply schema

    mockTelegram = {
      sendMessage: vi.fn().mockResolvedValue(true),
    };

    queue = new NotificationQueue(10); // max queue size 10 for testing
    // Stop auto-processing to control it manually during tests
    queue.stop();
  });

  afterEach(() => {
    queue.stop();
    store.resetDatabase();
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch (e) {
        // Ignore unlink errors
      }
    }
  });

  it('enqueues notifications', async () => {
    await queue.enqueue('STORY_STARTED', 'Test message', 'epic-1', 2);
    const stats = await queue.getQueueStats();
    expect(stats.pending).toBe(1);
    
    const pending = store.getPendingNotifications();
    expect(pending).toHaveLength(1);
    expect(pending[0].message).toBe('Test message');
  });

  it('processes queue in order of priority', async () => {
    await queue.enqueue('LOW', 'Low priority', undefined, 3);
    await queue.enqueue('HIGH', 'High priority', undefined, 1);
    await queue.enqueue('NORMAL', 'Normal priority', undefined, 2);

    const pending = store.getPendingNotifications();
    expect(pending[0].message).toBe('High priority');
    expect(pending[1].message).toBe('Normal priority');
    expect(pending[2].message).toBe('Low priority');

    await queue.processQueue(mockTelegram as TelegramNotifier);

    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(3);
    // Highest priority should be sent first
    expect(mockTelegram.sendMessage).toHaveBeenNthCalledWith(1, 'High priority');
    expect(mockTelegram.sendMessage).toHaveBeenNthCalledWith(2, 'Normal priority');
    expect(mockTelegram.sendMessage).toHaveBeenNthCalledWith(3, 'Low priority');

    const stats = await queue.getQueueStats();
    expect(stats.pending).toBe(0);
  });

  it('retries failed notifications', async () => {
    mockTelegram.sendMessage = vi.fn().mockRejectedValueOnce(new Error('Network error')).mockResolvedValue(true);
    
    await queue.enqueue('STORY_FAILED', 'Failing message', undefined, 1);
    await queue.processQueue(mockTelegram as TelegramNotifier);
    
    // First attempt failed
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    
    const pendingAfterFail = store.getDatabase()!.exec('SELECT retries FROM notifications')[0].values[0][0];
    expect(pendingAfterFail).toBe(1);

    // Mock Date.now to be in the future (after delay)
    // Actually, SQLite uses datetime('now'), so let's modify the last_attempt in DB directly to be in the past
    store.getDatabase()!.run('UPDATE notifications SET last_attempt = datetime("now", "-15 seconds")');
    
    await queue.processQueue(mockTelegram as TelegramNotifier);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2); // Retried
    
    const stats = await queue.getQueueStats();
    expect(stats.pending).toBe(0);
  });

  it('moves to dead letter after max retries', async () => {
    // Always fail
    mockTelegram.sendMessage = vi.fn().mockRejectedValue(new Error('Persistent error'));
    
    await queue.enqueue('TEST', 'Bad message', undefined, 1);
    
    const originalDateNow = Date.now;
    let timeOffset = 0;
    Date.now = () => originalDateNow() + timeOffset;

    // Process 5 times (max retries = 5)
    for (let i = 0; i < 6; i++) {
      await queue.processQueue(mockTelegram as TelegramNotifier);
      // set last_attempt to the past so it gets picked up again
      store.getDatabase()!.run('UPDATE notifications SET last_attempt = datetime("now", "-1 day")');
    }
    
    const stats = await queue.getQueueStats();
    expect(stats.pending).toBe(0);
    expect(stats.deadLetter).toBe(1);
  });

  it('drops low priority when full', async () => {
    // Fill up the queue with low priority
    for (let i = 0; i < 10; i++) {
      await queue.enqueue('LOW', `Low ${i}`, undefined, 3);
    }
    
    // Enqueue a high priority item when full
    await queue.enqueue('HIGH', 'High priority', undefined, 1);
    
    const stats = await queue.getQueueStats();
    expect(stats.pending).toBe(10); // Still 10 max
    
    const pending = store.getPendingNotifications();
    const hasHighPriority = pending.some(n => n.message === 'High priority');
    const hasAllLows = pending.filter(n => n.message.startsWith('Low')).length;
    
    expect(hasHighPriority).toBe(true);
    expect(hasAllLows).toBe(9); // One low priority got dropped
  });

  it('clears dead letter queue', async () => {
    mockTelegram.sendMessage = vi.fn().mockRejectedValue(new Error('Persistent error'));

    await queue.enqueue('TEST1', 'Dead 1', undefined, 1);
    await queue.enqueue('TEST2', 'Dead 2', undefined, 1);

    const originalDateNow = Date.now;
    Date.now = () => originalDateNow() + 1000;

    for (let i = 0; i < 6; i++) {
      await queue.processQueue(mockTelegram as TelegramNotifier);
      store.getDatabase()!.run('UPDATE notifications SET last_attempt = datetime("now", "-1 day")');
    }

    const statsBefore = await queue.getQueueStats();
    expect(statsBefore.deadLetter).toBe(2);

    await queue.clearDeadLetter();

    const statsAfter = await queue.getQueueStats();
    expect(statsAfter.deadLetter).toBe(0);
  });

  it('rejects invalid priority values', async () => {
    await expect(queue.enqueue('TEST', 'msg', undefined, 0)).rejects.toThrow('Invalid priority');
    await expect(queue.enqueue('TEST', 'msg', undefined, -1)).rejects.toThrow('Invalid priority');
    await expect(queue.enqueue('TEST', 'msg', undefined, 1.5)).rejects.toThrow('Invalid priority');
  });

  it('sets default maxQueueSize when invalid', () => {
    const queueZero = new NotificationQueue(0);
    expect((queueZero as any).maxQueueSize).toBe(100);
    queueZero.stop();

    const queueNeg = new NotificationQueue(-5);
    expect((queueNeg as any).maxQueueSize).toBe(100);
    queueNeg.stop();
  });

  it('rejects empty message and event', async () => {
    await expect(queue.enqueue('', 'msg')).rejects.toThrow('Invalid event');
    await expect(queue.enqueue('TEST', '')).rejects.toThrow('Invalid message');
    await expect(queue.enqueue('TEST', '   ')).rejects.toThrow('Invalid message');
  });
});

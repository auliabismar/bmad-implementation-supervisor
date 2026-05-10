import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationManager } from './manager.js';
import { StoryNotificationFormatter, NotificationPayload } from './events.js';

class MockTelegramNotifier {
  sendMessage = vi.fn().mockResolvedValue(true);
}

describe('StoryNotificationFormatter', () => {
  let formatter: StoryNotificationFormatter;

  beforeEach(() => {
    formatter = new StoryNotificationFormatter();
  });

  it('formats STORY_STARTED notification', () => {
    const payload: NotificationPayload = {
      event: 'STORY_STARTED',
      storyKey: '4-2-event-notifications',
      workflow: 'dev-story',
      timestamp: new Date(),
    };
    const result = formatter.format(payload);
    expect(result).toBe('🔄 Story started: 4-2-event-notifications\nWorkflow: dev-story');
  });

  it('formats STORY_COMPLETED notification', () => {
    const payload: NotificationPayload = {
      event: 'STORY_COMPLETED',
      storyKey: '4-2-event-notifications',
      timestamp: new Date(),
    };
    const result = formatter.format(payload);
    expect(result).toBe('✅ Story completed: 4-2-event-notifications');
  });

  it('formats STORY_FAILED notification', () => {
    const payload: NotificationPayload = {
      event: 'STORY_FAILED',
      storyKey: '4-2-event-notifications',
      details: 'Test error',
      timestamp: new Date(),
    };
    const result = formatter.format(payload);
    expect(result).toBe('❌ Story failed: 4-2-event-notifications\nError: Test error');
  });

  it('formats NEEDS_INPUT notification', () => {
    const payload: NotificationPayload = {
      event: 'NEEDS_INPUT',
      storyKey: '4-2-event-notifications',
      details: 'What should I do next?',
      timestamp: new Date(),
    };
    const result = formatter.format(payload);
    expect(result).toBe('❓ Input needed: 4-2-event-notifications\nWhat should I do next?');
  });

  it('formats STALL_DETECTED notification', () => {
    const payload: NotificationPayload = {
      event: 'STALL_DETECTED',
      storyKey: '4-2-event-notifications',
      details: 'No progress for 10+ minutes',
      timestamp: new Date(),
    };
    const result = formatter.format(payload);
    expect(result).toBe('⚠️ Stall detected: 4-2-event-notifications\nNo progress for 10+ minutes');
  });

  it('formats EPIC_COMPLETED notification', () => {
    const payload: NotificationPayload = {
      event: 'EPIC_COMPLETED',
      storyKey: 'epic-4',
      details: '4 stories completed',
      timestamp: new Date(),
    };
    const result = formatter.format(payload);
    expect(result).toBe('🎉 Epic completed!\n4 stories completed');
  });

  it('formats SPRINT_COMPLETED notification', () => {
    const payload: NotificationPayload = {
      event: 'SPRINT_COMPLETED',
      details: 'All stories done.',
      timestamp: new Date(),
    };
    const result = formatter.format(payload);
    expect(result).toBe('🏁 Sprint completed!\nAll stories done.');
  });

  it('formats CIRCUIT_BREAKER_OPEN notification', () => {
    const payload: NotificationPayload = {
      event: 'CIRCUIT_BREAKER_OPEN',
      details: 'Too many failures',
      timestamp: new Date(),
    };
    const result = formatter.format(payload);
    expect(result).toBe('🔴 Circuit breaker open: Too many failures');
  });

  it('formats RECOVERY_COMPLETE notification', () => {
    const payload: NotificationPayload = {
      event: 'RECOVERY_COMPLETE',
      storyKey: '4-2-event-notifications',
      timestamp: new Date(),
    };
    const result = formatter.format(payload);
    expect(result).toBe('♻️ Recovery complete: 4-2-event-notifications');
  });
});

describe('NotificationManager', () => {
  let manager: NotificationManager;
  const mockLogger = vi.fn();
  const mockTelegram = new MockTelegramNotifier();

  beforeEach(() => {
    vi.clearAllMocks();
    manager = new NotificationManager(
      mockTelegram as any,
      { dryRun: false, notificationsEnabled: true, flushIntervalMs: 100 },
      mockLogger
    );
  });

  describe('constructor', () => {
    it('initializes with default config', () => {
      const defaultManager = new NotificationManager({} as any);
      expect(defaultManager.getQueueLength()).toBe(0);
      expect(defaultManager.isDryRun()).toBe(false);
    });

    it('initializes with custom config', () => {
      const customManager = new NotificationManager(
        {} as any,
        { dryRun: true, notificationsEnabled: false },
        mockLogger
      );
      expect(customManager.isDryRun()).toBe(true);
    });
  });

  describe('storyStarted', () => {
    it('adds STORY_STARTED to queue', async () => {
      await manager.storyStarted('4-2-event-notifications', 'dev-story');
      expect(manager.getQueueLength()).toBe(1);
    });

    it('sends notification after flush interval', async () => {
      await manager.storyStarted('4-2-event-notifications', 'dev-story');
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '🔄 Story started: 4-2-event-notifications\nWorkflow: dev-story'
      );
    });
  });

  describe('storyCompleted', () => {
    it('adds STORY_COMPLETED to queue', async () => {
      await manager.storyCompleted('4-2-event-notifications');
      expect(manager.getQueueLength()).toBe(1);
    });
  });

  describe('storyFailed', () => {
    it('adds STORY_FAILED with error details to queue', async () => {
      await manager.storyFailed('4-2-event-notifications', 'Test error');
      expect(manager.getQueueLength()).toBe(1);
    });
  });

  describe('needsInput', () => {
    it('adds NEEDS_INPUT with question to queue', async () => {
      await manager.needsInput('4-2-event-notifications', 'What to do next?');
      expect(manager.getQueueLength()).toBe(1);
    });
  });

  describe('dryRun mode', () => {
    it('logs instead of sending when dryRun is true', async () => {
      const dryRunManager = new NotificationManager(
        {} as any,
        { dryRun: true },
        mockLogger
      );
      await dryRunManager.storyStarted('4-2-event-notifications', 'dev-story');

      expect(mockLogger).toHaveBeenCalledWith(
        expect.stringContaining('[DRY-RUN] Notification:')
      );
      expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('notifications disabled', () => {
    it('skips notification when notificationsEnabled is false', async () => {
      const disabledManager = new NotificationManager(
        {} as any,
        { notificationsEnabled: false },
        mockLogger
      );
      await disabledManager.storyStarted('4-2-event-notifications', 'dev-story');

      expect(mockLogger).toHaveBeenCalledWith(
        expect.stringContaining('Notifications disabled')
      );
      expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe('flush', () => {
    it('sends all queued notifications immediately', async () => {
      await manager.storyStarted('4-2-event-notifications', 'dev-story');
      await manager.storyCompleted('4-2-event-notifications');
      expect(manager.getQueueLength()).toBe(2);

      await manager.flush();

      expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(2);
      expect(manager.getQueueLength()).toBe(0);
    });
  });

  describe('queue handling', () => {
    it('batches multiple notifications', async () => {
      await manager.storyStarted('4-2-event-notifications', 'dev-story');
      await manager.storyCompleted('4-2-event-notifications');
      await manager.storyFailed('4-2-event-notifications', 'error');

      expect(manager.getQueueLength()).toBe(3);
    });
  });

  describe('setDryRun', () => {
    it('changes dryRun mode at runtime', () => {
      expect(manager.isDryRun()).toBe(false);
      manager.setDryRun(true);
      expect(manager.isDryRun()).toBe(true);
    });
  });

  describe('setNotificationsEnabled', () => {
    it('changes notificationsEnabled at runtime', async () => {
      await manager.storyStarted('4-2-event-notifications', 'dev-story');
      expect(manager.getQueueLength()).toBe(1);

      manager.setNotificationsEnabled(false);
      await manager.storyCompleted('4-2-event-notifications');
      expect(manager.getQueueLength()).toBe(1);
    });
  });

  describe('error recovery', () => {
    it('re-queues notification when send fails', async () => {
      const failingTelegram = {
        sendMessage: vi.fn().mockRejectedValueOnce(new Error('Network error')),
      } as any;

      const failingManager = new NotificationManager(
        failingTelegram,
        { flushIntervalMs: 100 },
        mockLogger
      );

      await failingManager.storyStarted('4-2-event-notifications', 'dev-story');
      await new Promise((resolve) => setTimeout(resolve, 150));

      expect(failingTelegram.sendMessage).toHaveBeenCalledTimes(1);
      expect(failingManager.getQueueLength()).toBe(1);
    });
  });

  describe('convenience methods', () => {
    it('epicCompleted sends EPIC_COMPLETED event', async () => {
      await manager.epicCompleted('epic-4', 'All 5 stories completed');
      await manager.flush();

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '🎉 Epic completed!\nAll 5 stories completed'
      );
    });

    it('sprintCompleted sends SPRINT_COMPLETED event', async () => {
      await manager.sprintCompleted();
      await manager.flush();

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '🏁 Sprint completed!\nAll stories in sprint completed'
      );
    });

    it('circuitBreakerOpened sends CIRCUIT_BREAKER_OPEN event', async () => {
      await manager.circuitBreakerOpened('Too many failures');
      await manager.flush();

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '🔴 Circuit breaker open: Too many failures'
      );
    });

    it('recoveryComplete sends RECOVERY_COMPLETE event', async () => {
      await manager.recoveryComplete('4-2-event-notifications');
      await manager.flush();

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '♻️ Recovery complete: 4-2-event-notifications'
      );
    });

    it('stallDetected sends STALL_DETECTED event', async () => {
      await manager.stallDetected('4-2-event-notifications');
      await manager.flush();

      expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
        '⚠️ Stall detected: 4-2-event-notifications\nNo progress detected for 10+ minutes'
      );
    });
  });
});
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TelegramNotifier, StoryInfo, Button } from './telegram.js';
import { Context } from 'grammy';

const { mockSendMessage, mockGetMe, mockStart, mockStop, mockUse, mockCatch } = vi.hoisted(() => {
  return {
    mockSendMessage: vi.fn().mockResolvedValue(true),
    mockGetMe: vi.fn().mockResolvedValue({ id: 123, username: 'test_bot' }),
    mockStart: vi.fn().mockResolvedValue(undefined),
    mockStop: vi.fn().mockResolvedValue(undefined),
    mockUse: vi.fn(),
    mockCatch: vi.fn()
  };
});

vi.mock('grammy', () => {
  const mockApi = {
    sendMessage: mockSendMessage,
    getMe: mockGetMe,
  };

  const mockBot = {
    command: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    use: mockUse,
    catch: mockCatch,
    api: mockApi,
    start: mockStart,
    stop: mockStop,
  };

  return {
    Bot: class {
      constructor() {
        return mockBot;
      }
    },
  };
});

vi.mock('@grammyjs/menu', () => {
  return {
    Menu: class {
      constructor() {}
      text = vi.fn();
    },
  };
});

describe('TelegramNotifier', () => {
  let notifier: TelegramNotifier;

  beforeEach(() => {
    vi.clearAllMocks();
    notifier = new TelegramNotifier('test-bot-token', 'test-chat-id');
  });

  describe('constructor', () => {
    it('initializes with bot token and chat ID', () => {
      expect(notifier).toBeDefined();
    });
    
    it('sets up a global error handler', () => {
      expect(mockCatch).toHaveBeenCalled();
    });
  });

  describe('sendMessage', () => {
    it('sends message successfully', async () => {
      await notifier.sendMessage('test message');
      expect(mockSendMessage).toHaveBeenCalledWith('test-chat-id', 'test message');
    });

    it('throws error when API fails', async () => {
      mockSendMessage.mockRejectedValueOnce(new Error('API Error'));

      await expect(notifier.sendMessage('test')).rejects.toThrow('Failed to send message');
    });
  });

  describe('sendWithButtons', () => {
    it('creates a dynamic menu, registers it, and sends message', async () => {
      const buttons: Button[] = [
        { label: 'Test Button', callback: async () => {} }
      ];
      
      await notifier.sendWithButtons('test text', buttons);
      
      expect(mockUse).toHaveBeenCalled();
      expect(mockSendMessage).toHaveBeenCalledWith(
        'test-chat-id',
        'test text',
        expect.objectContaining({ reply_markup: expect.anything() })
      );
    });
  });

  describe('sendStoryUpdate', () => {
    it('sends formatted status message', async () => {
      const story: StoryInfo = { key: '4-1-test', title: 'Test Story' };
      await notifier.sendStoryUpdate(story, 'dev-story', 'in-progress');
      expect(mockSendMessage).toHaveBeenCalledWith(
        'test-chat-id',
        '[STATUS] Story: 4-1-test | Workflow: dev-story | Status: in-progress'
      );
    });
  });

  describe('sendError', () => {
    it('sends formatted error message', async () => {
      await notifier.sendError('4-1-test', 'Something went wrong');
      expect(mockSendMessage).toHaveBeenCalledWith(
        'test-chat-id',
        '[ERROR] Story: 4-1-test\nSomething went wrong'
      );
    });
  });

  describe('healthCheck', () => {
    it('returns true when API call succeeds', async () => {
      const result = await notifier.healthCheck();
      expect(mockGetMe).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('returns false when API call fails', async () => {
      mockGetMe.mockRejectedValueOnce(new Error('API Error'));

      const result = await notifier.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('start/stop', () => {
    it('starts without error', async () => {
      await notifier.start();
      expect(mockStart).toHaveBeenCalled();
      expect(notifier.isRunning()).toBe(true);
    });

    it('stops without error', async () => {
      await notifier.start();
      await notifier.stop();
      expect(mockStop).toHaveBeenCalled();
      expect(notifier.isRunning()).toBe(false);
    });

    it('does not start twice', async () => {
      await notifier.start();
      await notifier.start();
      expect(mockStart).toHaveBeenCalledTimes(1);
      expect(notifier.isRunning()).toBe(true);
    });

    it('does not stop twice', async () => {
      await notifier.start();
      await notifier.stop();
      await notifier.stop();
      expect(mockStop).toHaveBeenCalledTimes(1);
      expect(notifier.isRunning()).toBe(false);
    });
  });
});

import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { StatusCommand, PauseCommand, ResumeCommand, RetryCommand, SkipCommand, AbortCommand, HelpCommand } from './commands.js';
import { getSprintStatus, loadSprintStatus, getStory, type StoryInfo } from '../state/sprint-status.js';

const mockSupervisor = {
  pause: vi.fn(),
  resume: vi.fn(),
  stop: vi.fn(),
  retryStory: vi.fn().mockResolvedValue(undefined),
  skipStory: vi.fn(),
  getCurrentStory: vi.fn(),
  getStatus: vi.fn(),
};

const mockStateMachine = {
  transition: vi.fn(),
};

const mockCommandContext = {
  supervisor: mockSupervisor as any,
  stateMachine: mockStateMachine as any,
  telegram: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
  },
};

describe('CommandHandlers', () => {
  describe('StatusCommand', () => {
    it('shows current status with story and progress', async () => {
      const statusCmd = new StatusCommand();
      const result = await statusCmd.execute([], mockCommandContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Supervisor Status');
    });

    it('shows queue length', async () => {
      const statusCmd = new StatusCommand();
      const result = await statusCmd.execute([], mockCommandContext);
      
      expect(result.message).toContain('Queue');
    });
  });

  describe('PauseCommand', () => {
    it('pauses supervisor', async () => {
      const pauseCmd = new PauseCommand();
      const result = await pauseCmd.execute([], mockCommandContext);
      
      expect(mockSupervisor.pause).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('paused');
    });
  });

  describe('ResumeCommand', () => {
    it('resumes supervisor', async () => {
      const resumeCmd = new ResumeCommand();
      const result = await resumeCmd.execute([], mockCommandContext);
      
      expect(mockSupervisor.resume).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('resumed');
    });
  });

  describe('RetryCommand', () => {
    it('retrys story with valid key', async () => {
      const retryCmd = new RetryCommand();
      const result = await retryCmd.execute(['1-1-project-setup'], mockCommandContext);
      
      expect(mockSupervisor.retryStory).toHaveBeenCalledWith('1-1-project-setup');
      expect(result.success).toBe(true);
    });

    it('fails without story key', async () => {
      const retryCmd = new RetryCommand();
      const result = await retryCmd.execute([], mockCommandContext);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Usage');
    });
  });

  describe('SkipCommand', () => {
    it('skips story with valid key', async () => {
      const skipCmd = new SkipCommand();
      const result = await skipCmd.execute(['1-1-project-setup'], mockCommandContext);
      
      expect(mockSupervisor.skipStory).toHaveBeenCalledWith('1-1-project-setup');
      expect(result.success).toBe(true);
      expect(result.message).toContain('Skipped');
    });

    it('fails without story key', async () => {
      const skipCmd = new SkipCommand();
      const result = await skipCmd.execute([], mockCommandContext);
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Usage');
    });
  });

  describe('AbortCommand', () => {
    it('stops supervisor', async () => {
      const abortCmd = new AbortCommand();
      const result = await abortCmd.execute([], mockCommandContext);
      
      expect(mockSupervisor.stop).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('stopped');
    });
  });

  describe('HelpCommand', () => {
    it('shows help message', async () => {
      const helpCmd = new HelpCommand();
      const result = await helpCmd.execute([], mockCommandContext);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('/status');
      expect(result.message).toContain('/pause');
      expect(result.message).toContain('/resume');
      expect(result.message).toContain('/help');
    });
  });
});
import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import { RecoveryManager, createRecoveryManager } from './recovery';
import * as checkpoint from './checkpoint';
import * as sprintStatus from './sprint-status';
import type { StoryInfo } from './sprint-status';

describe('RecoveryManager', () => {
  let recoveryManager: RecoveryManager;

  beforeEach(() => {
    recoveryManager = createRecoveryManager();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkForPendingCheckpoint', () => {
    it('should return null when no checkpoints exist', async () => {
      vi.spyOn(checkpoint, 'getAllCheckpoints').mockResolvedValue([]);
      const result = await recoveryManager.checkForPendingCheckpoint();
      expect(result).toBeNull();
    });

    it('should return most recent checkpoint when exists', async () => {
      const mockCheckpoint = {
        id: 1,
        story_key: '3-6-recovery-logic',
        workflow: 'dev-story',
        status: 'in-progress',
        attempt: 2,
        created_at: '2026-05-09T10:00:00Z',
      };
      vi.spyOn(checkpoint, 'getAllCheckpoints').mockResolvedValue([mockCheckpoint]);
      const result = await recoveryManager.checkForPendingCheckpoint();
      expect(result).toEqual(mockCheckpoint);
    });

    it('should throw on database error', async () => {
      vi.spyOn(checkpoint, 'getAllCheckpoints').mockRejectedValue(new Error('DB corrupted'));
      await expect(recoveryManager.checkForPendingCheckpoint()).rejects.toThrow('DB corrupted');
    });
  });

  describe('analyzeRecovery', () => {
    it('should correctly analyze recovery context', async () => {
      const mockCheckpoint: checkpoint.CheckpointRecord = {
        id: 1,
        story_key: '3-6-recovery-logic',
        workflow: 'dev-story',
        status: 'in-progress',
        attempt: 2,
        created_at: '2026-05-09T10:00:00Z',
      };

      const mockStory: StoryInfo = {
        key: '3-6-recovery-logic',
        epicNum: 3,
        storyNum: 6,
        title: 'Recovery Logic',
        status: 'in-progress',
        type: 'story',
      };

      vi.spyOn(sprintStatus, 'loadSprintStatus').mockReturnValue(void 0 as any);
      vi.spyOn(sprintStatus, 'getStory').mockReturnValue(mockStory);

      const context = await recoveryManager.analyzeRecovery(mockCheckpoint);

      expect(context.storyKey).toBe('3-6-recovery-logic');
      expect(context.lastCheckpoint).toEqual(mockCheckpoint);
      expect(context.workflow).toBe('dev-story');
      expect(context.resumeFromStatus).toBe('in-progress');
      expect(context.attemptCount).toBe(2);
      expect(context.storyInSprint).toEqual(mockStory);
      expect(context.hasConflict).toBe(false);
    });

    it('should detect conflict when checkpoint status differs from sprint status', async () => {
      const mockCheckpoint: checkpoint.CheckpointRecord = {
        id: 1,
        story_key: '3-6-recovery-logic',
        workflow: 'dev-story',
        status: 'in-progress',
        attempt: 1,
        created_at: '2026-05-09T10:00:00Z',
      };

      const mockStory: StoryInfo = {
        key: '3-6-recovery-logic',
        epicNum: 3,
        storyNum: 6,
        title: 'Recovery Logic',
        status: 'ready-for-dev',
        type: 'story',
      };

      vi.spyOn(sprintStatus, 'loadSprintStatus').mockReturnValue(void 0 as any);
      vi.spyOn(sprintStatus, 'getStory').mockReturnValue(mockStory);

      const context = await recoveryManager.analyzeRecovery(mockCheckpoint);

      expect(context.hasConflict).toBe(true);
      expect(context.conflictDetails).toContain('Checkpoint shows status "in-progress"');
    });

    it('should handle missing story in sprint', async () => {
      const mockCheckpoint: checkpoint.CheckpointRecord = {
        id: 1,
        story_key: 'unknown-story',
        workflow: 'dev-story',
        status: 'in-progress',
        attempt: 1,
        created_at: '2026-05-09T10:00:00Z',
      };

      vi.spyOn(sprintStatus, 'loadSprintStatus').mockReturnValue(void 0 as any);
      vi.spyOn(sprintStatus, 'getStory').mockReturnValue(null);

      const context = await recoveryManager.analyzeRecovery(mockCheckpoint);

      expect(context.storyInSprint).toBeNull();
      expect(context.hasConflict).toBe(false);
    });
  });

  describe('proposeRecovery', () => {
    it('should not recommend recovery when conflict detected', async () => {
      const context: any = {
        storyKey: '3-6-recovery-logic',
        hasConflict: true,
        conflictDetails: 'Status mismatch',
        storyInSprint: { key: '3-6-recovery-logic', epicNum: 3, status: 'ready-for-dev' },
      };

      const result = await recoveryManager.proposeRecovery(context);

      expect(result.canRecover).toBe(true);
      expect(result.shouldRecover).toBe(false);
      expect(result.error).toBe('Status mismatch');
    });

    it('should not recommend recovery when story not in sprint', async () => {
      const context: any = {
        storyKey: 'unknown-story',
        hasConflict: false,
        storyInSprint: null,
      };

      const result = await recoveryManager.proposeRecovery(context);

      expect(result.canRecover).toBe(true);
      expect(result.shouldRecover).toBe(false);
      expect(result.error).toContain('not found in sprint-status.yaml');
    });

    it('should not recommend recovery when story already done', async () => {
      const context: any = {
        storyKey: '3-6-recovery-logic',
        hasConflict: false,
        storyInSprint: { key: '3-6-recovery-logic', epicNum: 3, status: 'done' },
      };

      const result = await recoveryManager.proposeRecovery(context);

      expect(result.canRecover).toBe(true);
      expect(result.shouldRecover).toBe(false);
      expect(result.error).toContain('already marked as done');
    });

    it('should require human confirmation before recovery', async () => {
      const context: any = {
        storyKey: '3-6-recovery-logic',
        hasConflict: false,
        storyInSprint: { key: '3-6-recovery-logic', epicNum: 3, status: 'in-progress' },
      };

      const result = await recoveryManager.proposeRecovery(context);

      expect(result.shouldRecover).toBe(false);
      expect(recoveryManager.isHumanConfirmationRequired()).toBe(true);
    });
  });

  describe('executeRecovery', () => {
    it('should succeed when statuses match', async () => {
      const context: any = {
        storyKey: '3-6-recovery-logic',
        storyInSprint: { key: '3-6-recovery-logic', epicNum: 3, status: 'in-progress' },
        lastCheckpoint: { status: 'in-progress' },
      };

      const result = await recoveryManager.executeRecovery(context);

      expect(result.success).toBe(true);
      expect(result.nextStatus).toBe('in-progress');
    });

    it('should allow recovery from ready-for-dev to in-progress', async () => {
      const context: any = {
        storyKey: '3-6-recovery-logic',
        storyInSprint: { key: '3-6-recovery-logic', epicNum: 3, status: 'ready-for-dev' },
        lastCheckpoint: { status: 'in-progress' },
      };

      const result = await recoveryManager.executeRecovery(context);

      expect(result.success).toBe(true);
      expect(result.nextStatus).toBe('in-progress');
    });

    it('should fail when story not in sprint', async () => {
      const context: any = {
        storyKey: 'unknown-story',
        storyInSprint: null,
      };

      const result = await recoveryManager.executeRecovery(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not in sprint');
    });

    it('should not allow jumping ahead (e.g., from backlog to review)', async () => {
      const context: any = {
        storyKey: '3-6-recovery-logic',
        storyInSprint: { key: '3-6-recovery-logic', epicNum: 3, status: 'backlog' },
        lastCheckpoint: { status: 'review' },
      };

      const result = await recoveryManager.executeRecovery(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Cannot jump');
    });
  });

  describe('startFresh', () => {
    it('should allow starting fresh without errors', async () => {
      await expect(recoveryManager.startFresh('3-6-recovery-logic')).resolves.toBeUndefined();
    });
  });

  describe('human confirmation toggle', () => {
    it('should default to requiring confirmation', () => {
      expect(recoveryManager.isHumanConfirmationRequired()).toBe(true);
    });

    it('should allow toggling confirmation requirement', () => {
      recoveryManager.setHumanConfirmationRequired(false);
      expect(recoveryManager.isHumanConfirmationRequired()).toBe(false);
    });
  });

  describe('idempotency', () => {
    it('should produce same result on multiple calls with same checkpoint', async () => {
      const mockCheckpoint: checkpoint.CheckpointRecord = {
        id: 1,
        story_key: '3-6-recovery-logic',
        workflow: 'dev-story',
        status: 'in-progress',
        attempt: 1,
        created_at: '2026-05-09T10:00:00Z',
      };

      const mockStory: StoryInfo = {
        key: '3-6-recovery-logic',
        epicNum: 3,
        storyNum: 6,
        title: 'Recovery Logic',
        status: 'in-progress',
        type: 'story',
      };

      vi.spyOn(sprintStatus, 'loadSprintStatus').mockReturnValue(void 0 as any);
      vi.spyOn(sprintStatus, 'getStory').mockReturnValue(mockStory);

      const context1 = await recoveryManager.analyzeRecovery(mockCheckpoint);
      const context2 = await recoveryManager.analyzeRecovery(mockCheckpoint);

      expect(context1).toEqual(context2);
    });
  });
});
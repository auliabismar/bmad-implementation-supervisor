import { describe, it, expect, beforeEach, vi } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  setSprintStatusTestPath,
  resetSprintStatus,
  reloadSprintStatus,
  getEpic,
  getStory,
  getStoriesByEpic,
} from './sprint-status';
import {
  StoryStateMachine,
  InvalidTransitionError,
  type StoryInfo,
  type StoryStatus,
  type WorkflowType,
} from './state-machine';

describe('StoryStateMachine', () => {
  let stateMachine: StoryStateMachine;
  let tempDir: string;
  let statusPath: string;

  const baseSprintStatus = `generated: 2026-05-09
last_updated: 2026-05-09
project: test-project
tracking_system: file-system
story_location: _bmad-output/implementation-artifacts

development_status:
  epic-1: backlog
  1-1-first-story: backlog
  1-2-second-story: backlog
  1-3-third-story: done
  epic-1-retrospective: optional`;

  beforeEach(() => {
    resetSprintStatus();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
    statusPath = path.join(tempDir, 'sprint-status.yaml');
    fs.writeFileSync(statusPath, baseSprintStatus);
    setSprintStatusTestPath(statusPath);
    reloadSprintStatus();
    stateMachine = new StoryStateMachine();
  });

  function createStoryInfo(key: string, status: StoryStatus): StoryInfo {
    const match = key.match(/^(\d+)-(\d+)-(.+)$/);
    if (!match) throw new Error(`Invalid story key: ${key}`);
    return {
      key,
      epicNum: parseInt(match[1], 10),
      storyNum: parseInt(match[2], 10),
      title: match[3],
      status,
      type: 'story',
    };
  }

  describe('AC-1: Valid transitions', () => {
    it('allows backlog → ready-for-dev', () => {
      const story = createStoryInfo('1-1-first-story', 'backlog');
      const result = stateMachine.transition(story, 'ready-for-dev');
      expect(result.success).toBe(true);
      expect(result.story.status).toBe('ready-for-dev');
    });

    it('allows ready-for-dev → in-progress', () => {
      const story = createStoryInfo('1-1-first-story', 'ready-for-dev');
      const result = stateMachine.transition(story, 'in-progress');
      expect(result.success).toBe(true);
      expect(result.story.status).toBe('in-progress');
    });

    it('allows in-progress → review', () => {
      const story = createStoryInfo('1-1-first-story', 'in-progress');
      const result = stateMachine.transition(story, 'review');
      expect(result.success).toBe(true);
      expect(result.story.status).toBe('review');
    });

    it('allows review → done (approved)', () => {
      const story = createStoryInfo('1-1-first-story', 'review');
      const result = stateMachine.transition(story, 'done');
      expect(result.success).toBe(true);
      expect(result.story.status).toBe('done');
    });

    it('allows review → in-progress (changes requested)', () => {
      const story = createStoryInfo('1-1-first-story', 'review');
      const result = stateMachine.transition(story, 'in-progress');
      expect(result.success).toBe(true);
      expect(result.story.status).toBe('in-progress');
    });
  });

  describe('AC-2: transition() validates and applies', () => {
    it('returns TransitionResult with story and checkpointRequired', () => {
      const story = createStoryInfo('1-1-first-story', 'backlog');
      const result = stateMachine.transition(story, 'ready-for-dev');
      expect(result.success).toBe(true);
      expect(result.checkpointRequired).toBe(true);
      expect(result.story).toBeDefined();
      expect(result.story.status).toBe('ready-for-dev');
    });

    it('can transition epic alongside story', () => {
      const story = createStoryInfo('1-1-first-story', 'backlog');
      const result = stateMachine.transition(story, 'ready-for-dev');
      expect(result.epic).toBeDefined();
      expect(result.epic!.status).toBe('in-progress');
    });
  });

  describe('AC-3: Invalid transitions throw InvalidTransitionError', () => {
    it('throws for backlog → in-progress (skip)', () => {
      const story = createStoryInfo('1-1-first-story', 'backlog');
      expect(() => stateMachine.transition(story, 'in-progress')).toThrow(InvalidTransitionError);
    });

    it('throws for backlog → review (skip)', () => {
      const story = createStoryInfo('1-1-first-story', 'backlog');
      expect(() => stateMachine.transition(story, 'review')).toThrow(InvalidTransitionError);
    });

    it('throws for backlog → done (skip)', () => {
      const story = createStoryInfo('1-1-first-story', 'backlog');
      expect(() => stateMachine.transition(story, 'done')).toThrow(InvalidTransitionError);
    });

    it('throws for ready-for-dev → backlog (reverse)', () => {
      const story = createStoryInfo('1-1-first-story', 'ready-for-dev');
      expect(() => stateMachine.transition(story, 'backlog')).toThrow(InvalidTransitionError);
    });

    it('throws for ready-for-dev → review (skip)', () => {
      const story = createStoryInfo('1-1-first-story', 'ready-for-dev');
      expect(() => stateMachine.transition(story, 'review')).toThrow(InvalidTransitionError);
    });

    it('throws for ready-for-dev → done (skip)', () => {
      const story = createStoryInfo('1-1-first-story', 'ready-for-dev');
      expect(() => stateMachine.transition(story, 'done')).toThrow(InvalidTransitionError);
    });

    it('throws for in-progress → ready-for-dev (reverse)', () => {
      const story = createStoryInfo('1-1-first-story', 'in-progress');
      expect(() => stateMachine.transition(story, 'ready-for-dev')).toThrow(InvalidTransitionError);
    });

    it('throws for in-progress → backlog (reverse)', () => {
      const story = createStoryInfo('1-1-first-story', 'in-progress');
      expect(() => stateMachine.transition(story, 'backlog')).toThrow(InvalidTransitionError);
    });

    it('throws for in-progress → done (skip)', () => {
      const story = createStoryInfo('1-1-first-story', 'in-progress');
      expect(() => stateMachine.transition(story, 'done')).toThrow(InvalidTransitionError);
    });

    it('throws for done → any (terminal)', () => {
      const story = createStoryInfo('1-1-first-story', 'done');
      expect(() => stateMachine.transition(story, 'backlog')).toThrow(InvalidTransitionError);
      expect(() => stateMachine.transition(story, 'ready-for-dev')).toThrow(InvalidTransitionError);
      expect(() => stateMachine.transition(story, 'in-progress')).toThrow(InvalidTransitionError);
      expect(() => stateMachine.transition(story, 'review')).toThrow(InvalidTransitionError);
    });

    it('InvalidTransitionError contains current, attempted, and valid states', () => {
      const story = createStoryInfo('1-1-first-story', 'backlog');
      try {
        stateMachine.transition(story, 'in-progress');
        expect.fail('Should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(InvalidTransitionError);
        const err = e as InvalidTransitionError;
        expect(err.currentState).toBe('backlog');
        expect(err.attemptedState).toBe('in-progress');
        expect(err.validStates).toEqual(['ready-for-dev']);
      }
    });
  });

  describe('AC-4: Epic state transitions', () => {
    it('transitions epic when story transitions', () => {
      const story = createStoryInfo('1-1-first-story', 'backlog');
      const result = stateMachine.transition(story, 'ready-for-dev');
      expect(result.epic).toBeDefined();
      expect(result.epic!.status).toBe('in-progress');
    });

    it('can transition epic manually', () => {
      const epicInfo = stateMachine.transitionEpic(1, 'in-progress');
      expect(epicInfo.status).toBe('in-progress');
    });

    it('getEpic returns updated epic', () => {
      const story = createStoryInfo('1-1-first-story', 'backlog');
      stateMachine.transition(story, 'ready-for-dev');
      const epic = getEpic(1);
      expect(epic?.status).toBe('in-progress');
    });
  });

  describe('AC-5: Epic auto-transitions to in-progress when first story moves from backlog', () => {
    it('auto-transitions epic when first backlog story moves', () => {
      const epicBefore = getEpic(1);
      expect(epicBefore?.status).toBe('backlog');

      const story = createStoryInfo('1-1-first-story', 'backlog');
      stateMachine.transition(story, 'ready-for-dev');

      const epicAfter = getEpic(1);
      expect(epicAfter?.status).toBe('in-progress');
    });

    it('does not auto-transition if epic is already in-progress', () => {
      stateMachine.transitionEpic(1, 'in-progress');

      const story = createStoryInfo('1-1-first-story', 'backlog');
      stateMachine.transition(story, 'ready-for-dev');

      const epic = getEpic(1);
      expect(epic?.status).toBe('in-progress');
    });
  });

  describe('AC-6: Epic auto-transitions to done when all its stories reach done', () => {
    it('transitions epic to done when all stories done', () => {
      const story1 = createStoryInfo('1-1-first-story', 'review');
      const story2 = createStoryInfo('1-2-second-story', 'review');

      stateMachine.transition(story1, 'done');
      stateMachine.transition(story2, 'done');

      const epic = getEpic(1);
      expect(epic?.status).toBe('done');
    });

    it('does not transition to done if not all stories complete', () => {
      const story1 = createStoryInfo('1-1-first-story', 'review');
      const story2 = createStoryInfo('1-2-second-story', 'ready-for-dev');

      stateMachine.transition(story1, 'done');
      stateMachine.transition(story2, 'in-progress');

      const epic = getEpic(1);
      expect(epic?.status).toBe('in-progress');
    });

    it('checkEpicCompletion returns true when all done', () => {
      const story1 = createStoryInfo('1-1-first-story', 'review');
      const story2 = createStoryInfo('1-2-second-story', 'review');

      stateMachine.transition(story1, 'done');
      stateMachine.transition(story2, 'done');

      expect(stateMachine.checkEpicCompletion(1)).toBe(true);
    });

    it('checkEpicCompletion returns false if not all done', () => {
      const story1 = createStoryInfo('1-1-first-story', 'done');
      const story2 = createStoryInfo('1-2-second-story', 'in-progress');

      expect(stateMachine.checkEpicCompletion(1)).toBe(false);
    });
  });

  describe('AC-7: Checkpoint callback hook', () => {
    it('calls registered checkpoint callback on transition', () => {
      const callback = vi.fn();
      stateMachine.onCheckpoint(callback);

      const story = createStoryInfo('1-1-first-story', 'backlog');
      stateMachine.transition(story, 'ready-for-dev');

      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('calls multiple registered callbacks', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      stateMachine.onCheckpoint(callback1);
      stateMachine.onCheckpoint(callback2);

      const story = createStoryInfo('1-1-first-story', 'backlog');
      stateMachine.transition(story, 'ready-for-dev');

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('passes context to checkpoint callback', () => {
      const callback = vi.fn();
      stateMachine.onCheckpoint(callback);

      const story = createStoryInfo('1-1-first-story', 'backlog');
      stateMachine.transition(story, 'ready-for-dev');

      const passedContext = callback.mock.calls[0]?.[0];
      expect(passedContext).toBeDefined();
      expect(passedContext.story.key).toBe('1-1-first-story');
      expect(passedContext.story.status).toBe('ready-for-dev');
    });
  });

  describe('AC-8: Workflow enum', () => {
    it('WorkflowType is create-story | dev-story | code-review', () => {
      const validWorkflows: WorkflowType[] = ['create-story', 'dev-story', 'code-review'];
      expect(validWorkflows).toBeDefined();
    });
  });

  describe('AC-9: Story context tracking', () => {
    it('startWorkflow sets currentWorkflow and initializes context', () => {
      const story = createStoryInfo('1-1-first-story', 'ready-for-dev');
      const context = stateMachine.startWorkflow(story, 'dev-story');

      expect(context.currentWorkflow).toBe('dev-story');
      expect(context.attempt).toBe(1);
      expect(context.lastError).toBeNull();
      expect(context.lastCheckpoint).toBeDefined();
    });

    it('incrementAttempt increases attempt count', () => {
      const story = createStoryInfo('1-1-first-story', 'ready-for-dev');
      const context = stateMachine.startWorkflow(story, 'dev-story');

      stateMachine.incrementAttempt(context);
      expect(context.attempt).toBe(2);

      stateMachine.incrementAttempt(context);
      expect(context.attempt).toBe(3);
    });

    it('recordError sets lastError message', () => {
      const story = createStoryInfo('1-1-first-story', 'ready-for-dev');
      const context = stateMachine.startWorkflow(story, 'dev-story');

      stateMachine.recordError(context, 'Something went wrong');
      expect(context.lastError).toBe('Something went wrong');
    });
  });

  describe('canTransition validation', () => {
    it('canTransition returns true for valid transition', () => {
      expect(stateMachine.canTransition('backlog', 'ready-for-dev')).toBe(true);
      expect(stateMachine.canTransition('ready-for-dev', 'in-progress')).toBe(true);
      expect(stateMachine.canTransition('in-progress', 'review')).toBe(true);
      expect(stateMachine.canTransition('review', 'done')).toBe(true);
      expect(stateMachine.canTransition('review', 'in-progress')).toBe(true);
    });

    it('canTransition returns false for invalid transition', () => {
      expect(stateMachine.canTransition('backlog', 'in-progress')).toBe(false);
      expect(stateMachine.canTransition('done', 'backlog')).toBe(false);
      expect(stateMachine.canTransition('ready-for-dev', 'done')).toBe(false);
    });

    it('getValidTransitions returns correct states', () => {
      expect(stateMachine.getValidTransitions('backlog')).toEqual(['ready-for-dev']);
      expect(stateMachine.getValidTransitions('ready-for-dev')).toEqual(['in-progress']);
      expect(stateMachine.getValidTransitions('in-progress')).toEqual(['review']);
      expect(stateMachine.getValidTransitions('review')).toEqual(['done', 'in-progress']);
      expect(stateMachine.getValidTransitions('done')).toEqual([]);
    });
  });
});
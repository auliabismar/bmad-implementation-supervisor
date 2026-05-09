import { describe, it, expect, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  setSprintStatusTestPath,
  resetSprintStatus,
  loadSprintStatus,
  reloadSprintStatus,
  getNextStory,
  getStory,
  updateStoryStatus,
  getEpic,
  updateEpicStatus,
  getStoriesByEpic,
  isFirstStoryInEpic,
  getSprintStatusPath,
} from './sprint-status';

describe('Sprint Status Parser', () => {
  let tempDir: string;

  beforeEach(() => {
    resetSprintStatus();
    setSprintStatusTestPath(null);
  });

  function createTempSprintStatus(content: string): string {
    const statusPath = path.join(tempDir, 'sprint-status.yaml');
    fs.writeFileSync(statusPath, content);
    return statusPath;
  }

  const validSprintStatus = `generated: 2026-05-09
last_updated: 2026-05-09
project: test-project
tracking_system: file-system
story_location: _bmad-output/implementation-artifacts

development_status:
  epic-1: in-progress
  1-1-first-story: done
  1-2-second-story: backlog
  1-3-third-story: ready-for-dev
  1-4-fourth-story: in-progress
  epic-2: backlog
  2-1-another-story: backlog
  2-2-yet-another: done
  epic-1-retrospective: optional`;

  describe('loadSprintStatus', () => {
    it('loads valid sprint-status.yaml', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);

      const status = loadSprintStatus();
      expect(status.project).toBe('test-project');
      expect(status.tracking_system).toBe('file-system');
      expect(status.development_status['1-1-first-story']).toBe('done');
      expect(status.development_status['epic-1']).toBe('in-progress');

      fs.rmSync(tempDir, { recursive: true });
    });

    it('throws for missing file', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = path.join(tempDir, 'nonexistent.yaml');
      setSprintStatusTestPath(statusPath);

      expect(() => loadSprintStatus()).toThrow(/Sprint status file not found/i);

      fs.rmSync(tempDir, { recursive: true });
    });

    it('throws for invalid yaml syntax', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus('invalid: yaml: content:');
      setSprintStatusTestPath(statusPath);

      expect(() => loadSprintStatus()).toThrow(/Failed to parse sprint-status\.yaml/i);

      fs.rmSync(tempDir, { recursive: true });
    });

    it('throws for invalid status values', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const invalidStatus = `generated: 2026-05-09
last_updated: 2026-05-09
project: test
tracking_system: file-system
story_location: test

development_status:
  1-1-test: invalid-status`;
      const statusPath = createTempSprintStatus(invalidStatus);
      setSprintStatusTestPath(statusPath);

      expect(() => loadSprintStatus()).toThrow(/Sprint status validation failed/i);

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('getNextStory', () => {
    it('returns first backlog story', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const next = getNextStory();
      expect(next).not.toBeNull();
      expect(next!.key).toBe('1-2-second-story');
      expect(next!.epicNum).toBe(1);
      expect(next!.storyNum).toBe(2);
      expect(next!.title).toBe('second-story');
      expect(next!.status).toBe('backlog');

      fs.rmSync(tempDir, { recursive: true });
    });

    it('skips epic and retrospective entries', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const next = getNextStory();
      expect(next).not.toBeNull();
      expect(next!.key.startsWith('epic')).toBe(false);
      expect(next!.key.includes('retrospective')).toBe(false);

      fs.rmSync(tempDir, { recursive: true });
    });

    it('returns null when all stories done', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const allDoneStatus = `generated: 2026-05-09
last_updated: 2026-05-09
project: test
tracking_system: file-system
story_location: test

development_status:
  1-1-done-story: done
  1-2-another-done: done`;
      const statusPath = createTempSprintStatus(allDoneStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const next = getNextStory();
      expect(next).toBeNull();

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('getStory', () => {
    it('returns story info for valid key', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const story = getStory('1-1-first-story');
      expect(story).not.toBeNull();
      expect(story!.key).toBe('1-1-first-story');
      expect(story!.epicNum).toBe(1);
      expect(story!.storyNum).toBe(1);
      expect(story!.status).toBe('done');

      fs.rmSync(tempDir, { recursive: true });
    });

    it('returns null for invalid key', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const story = getStory('non-existent');
      expect(story).toBeNull();

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('updateStoryStatus', () => {
    it('updates status in memory and persists to file', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      updateStoryStatus('1-2-second-story', 'in-progress');

      const updatedStory = getStory('1-2-second-story');
      expect(updatedStory!.status).toBe('in-progress');

      const fileContent = fs.readFileSync(statusPath, 'utf-8');
      expect(fileContent).toContain('1-2-second-story: in-progress');

      fs.rmSync(tempDir, { recursive: true });
    });

    it('throws for invalid story key', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      expect(() => updateStoryStatus('non-existent', 'in-progress')).toThrow(/Story key not found/i);

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('getEpic', () => {
    it('returns epic info for valid epic number', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const epic = getEpic(1);
      expect(epic).not.toBeNull();
      expect(epic!.key).toBe('epic-1');
      expect(epic!.epicNum).toBe(1);
      expect(epic!.status).toBe('in-progress');

      fs.rmSync(tempDir, { recursive: true });
    });

    it('returns null for invalid epic number', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const epic = getEpic(999);
      expect(epic).toBeNull();

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('updateEpicStatus', () => {
    it('updates epic status in memory and persists', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      updateEpicStatus(2, 'in-progress');

      const epic = getEpic(2);
      expect(epic!.status).toBe('in-progress');

      const fileContent = fs.readFileSync(statusPath, 'utf-8');
      expect(fileContent).toContain('epic-2: in-progress');

      fs.rmSync(tempDir, { recursive: true });
    });

    it('throws for invalid epic number', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      expect(() => updateEpicStatus(999, 'done')).toThrow(/Epic not found/i);

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('getStoriesByEpic', () => {
    it('returns all stories for an epic', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const stories = getStoriesByEpic(1);
      expect(stories.length).toBe(4);
      const firstStory = stories[0];
      const fourthStory = stories[3];
      expect(firstStory?.key).toBe('1-1-first-story');
      expect(fourthStory?.key).toBe('1-4-fourth-story');

      fs.rmSync(tempDir, { recursive: true });
    });

    it('returns null for epic with no stories', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const stories = getStoriesByEpic(3);
      expect(stories.length).toBe(0);
      expect(isFirstStoryInEpic({ key: '3-1-fake', epicNum: 3, storyNum: 1, title: 'fake', status: 'backlog', type: 'story' })).toBeNull();

      fs.rmSync(tempDir, { recursive: true });
    });
  });

  describe('isFirstStoryInEpic', () => {
    it('returns true for first story in epic', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const story = getStory('1-1-first-story');
      expect(isFirstStoryInEpic(story!)).toBe(true);

      fs.rmSync(tempDir, { recursive: true });
    });

    it('returns false for non-first story in epic', () => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
      const statusPath = createTempSprintStatus(validSprintStatus);
      setSprintStatusTestPath(statusPath);
      reloadSprintStatus();

      const story = getStory('1-2-second-story');
      expect(isFirstStoryInEpic(story!)).toBe(false);

      fs.rmSync(tempDir, { recursive: true });
    });
  });
});
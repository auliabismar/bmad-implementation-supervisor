import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { getConfig } from '../config';
import { resolveProjectPath, normalizePath } from '../utils/paths';

export const StoryStatusEnum = z.enum([
  'backlog',
  'ready-for-dev',
  'in-progress',
  'review',
  'failed',
  'stalled',
  'done',
]);

export type StoryStatus = z.infer<typeof StoryStatusEnum>;

export const EpicStatusEnum = z.enum(['backlog', 'in-progress', 'done']);

export type EpicStatus = z.infer<typeof EpicStatusEnum>;

export const RetroStatusEnum = z.enum(['optional', 'done']);

export type RetroStatus = z.infer<typeof RetroStatusEnum>;

const SprintStatusSchema = z.object({
  generated: z.string(),
  last_updated: z.string(),
  project: z.string(),
  tracking_system: z.string(),
  story_location: z.string(),
  development_status: z.record(
    z.string(),
    z.union([StoryStatusEnum, EpicStatusEnum, RetroStatusEnum])
  ),
  version: z.number().optional(),
});

export type SprintStatus = z.infer<typeof SprintStatusSchema>;

export interface StoryInfo {
  key: string;
  epicNum: number;
  storyNum: number;
  title: string;
  status: StoryStatus;
  type: 'story';
}

export interface EpicInfo {
  key: string;
  epicNum: number;
  status: EpicStatus;
}

let sprintStatusCache: SprintStatus | null = null;
let testPathOverride: string | null = null;
let cachedMtime: number | null = null;

export function setSprintStatusTestPath(p: string | null): void {
  testPathOverride = p;
  sprintStatusCache = null;
  cachedMtime = null;
}

export function resetSprintStatus(): void {
  sprintStatusCache = null;
  cachedMtime = null;
}

function formatZodError(error: z.ZodError): string {
  const lines: string[] = ['Sprint status validation failed:'];
  for (const issue of error.issues) {
    const p = issue.path.join('.');
    if (issue.code === 'invalid_type') {
      if (issue.received === 'undefined') {
        lines.push(`- ${p}: Required field missing`);
      } else {
        lines.push(`- ${p}: Expected ${issue.expected}, got ${issue.received}`);
      }
    } else {
      lines.push(`- ${p}: ${issue.message}`);
    }
  }
  return lines.join('\n');
}

function getSprintStatusPathInternal(customPath?: string): string {
  if (customPath) {
    const resolved = path.resolve(customPath);
    const projectRoot = resolveProjectPath('.');
    if (!resolved.startsWith(projectRoot)) {
      throw new Error(`Path traversal attempt detected: ${resolved}`);
    }
    return resolved;
  }
  if (testPathOverride) {
    return testPathOverride;
  }
  const config = getConfig();
  return resolveProjectPath(config.project.sprint_status);
}

export { getSprintStatusPathInternal as getSprintStatusPath };

export function loadSprintStatus(customPath?: string): SprintStatus {
  const statusPath = getSprintStatusPathInternal(customPath);

  if (!fs.existsSync(statusPath)) {
    throw new Error(
      `Sprint status file not found: ${normalizePath(statusPath)}\n` +
      'Run "sprint-planning" to generate sprint status file.'
    );
  }

  const yaml = require('yaml');
  let parsed: unknown;

  try {
    const rawContent = fs.readFileSync(statusPath, 'utf-8');
    parsed = yaml.parse(rawContent);
  } catch (e) {
    const err = e as Error;
    throw new Error(`Failed to parse sprint-status.yaml: ${err.message}`);
  }

  if (parsed === null) {
    throw new Error('Sprint status file is empty or invalid');
  }

  const result = SprintStatusSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }

  const mtime = fs.statSync(statusPath).mtimeMs;
  cachedMtime = mtime;
  sprintStatusCache = result.data;
  return result.data;
}

export function getSprintStatus(): SprintStatus {
  if (sprintStatusCache) {
    const statusPath = getSprintStatusPathInternal();
    if (fs.existsSync(statusPath)) {
      const currentMtime = fs.statSync(statusPath).mtimeMs;
      if (cachedMtime !== null && currentMtime !== cachedMtime) {
        sprintStatusCache = null;
        cachedMtime = null;
        return loadSprintStatus();
      }
    }
    return sprintStatusCache;
  }
  return loadSprintStatus();
}

export function saveSprintStatus(status: SprintStatus): void {
  const statusPath = getSprintStatusPathInternal();
  const tempPath = `${statusPath}.tmp`;

  const yaml = require('yaml');
  status.version = (status.version ?? 0) + 1;
  const content = yaml.stringify(status);

  try {
    fs.writeFileSync(tempPath, content, 'utf-8');
    fs.renameSync(tempPath, statusPath);
  } catch (e) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch {}
    }
    throw e;
  }

  sprintStatusCache = status;
  cachedMtime = fs.statSync(statusPath).mtimeMs;
}

export function reloadSprintStatus(): SprintStatus {
  sprintStatusCache = null;
  cachedMtime = null;
  return loadSprintStatus();
}

function parseStoryKey(key: string): { epicNum: number; storyNum: number; title: string; type: 'story' | 'epic' | 'retrospective' } | null {
  if (key.startsWith('epic-')) {
    if (key.endsWith('-retrospective')) {
      const epicMatch = key.match(/^epic-(\d+)-retrospective$/);
      const epicNum = epicMatch?.[1];
      if (epicNum !== undefined) {
        return { epicNum: parseInt(epicNum, 10), storyNum: 0, title: 'retrospective', type: 'retrospective' };
      }
    } else {
      const epicMatch = key.match(/^epic-(\d+)$/);
      const epicNum = epicMatch?.[1];
      if (epicNum !== undefined) {
        return { epicNum: parseInt(epicNum, 10), storyNum: 0, title: key, type: 'epic' };
      }
    }
  }

  const storyMatch = key.match(/^(\d+)-(\d+)-(.+)$/);
  if (storyMatch) {
    const epicNum = storyMatch[1];
    const storyNum = storyMatch[2];
    const title = storyMatch[3];
    if (epicNum !== undefined && storyNum !== undefined && title !== undefined) {
      return {
        epicNum: parseInt(epicNum, 10),
        storyNum: parseInt(storyNum, 10),
        title,
        type: 'story'
      };
    }
  }

  return null;
}

export function getNextStory(): StoryInfo | null {
  const status = getSprintStatus();

  for (const [key, value] of Object.entries(status.development_status)) {
    if (value !== 'backlog') continue;

    const parsed = parseStoryKey(key);
    if (!parsed || parsed.type !== 'story') continue;

    return {
      key,
      epicNum: parsed.epicNum,
      storyNum: parsed.storyNum,
      title: parsed.title,
      status: 'backlog',
      type: 'story',
    };
  }

  return null;
}

export function getStory(key: string): StoryInfo | null {
  const status = getSprintStatus();
  const value = status.development_status[key];

  if (!value) return null;

  const parsed = parseStoryKey(key);
  if (!parsed || parsed.type !== 'story') return null;

  if (!StoryStatusEnum.safeParse(value).success) {
    throw new Error(`Invalid story status value for ${key}: ${value}`);
  }

  return {
    key,
    epicNum: parsed.epicNum,
    storyNum: parsed.storyNum,
    title: parsed.title,
    status: value as StoryStatus,
    type: 'story',
  };
}

export function updateStoryStatus(key: string, newStatus: StoryStatus, expectedVersion?: number): void {
  const status = getSprintStatus();
  if (expectedVersion !== undefined && status.version !== undefined && status.version !== expectedVersion) {
    throw new Error(`Concurrent modification detected: expected version ${expectedVersion}, got ${status.version}. Reload and retry.`);
  }

  if (!(key in status.development_status)) {
    throw new Error(`Story key not found: ${key}`);
  }

  status.development_status[key] = newStatus;
  status.last_updated = new Date().toISOString();

  saveSprintStatus(status);
}

export function getEpic(epicNum: number): EpicInfo | null {
  const key = `epic-${epicNum}`;
  const status = getSprintStatus();
  const value = status.development_status[key];

  if (!value) return null;

  const parsed = parseStoryKey(key);
  if (!parsed || parsed.type !== 'epic') return null;

  if (!EpicStatusEnum.safeParse(value).success) {
    throw new Error(`Invalid epic status value for ${key}: ${value}`);
  }

  return {
    key,
    epicNum,
    status: value as EpicStatus,
  };
}

export function updateEpicStatus(epicNum: number, newStatus: EpicStatus, expectedVersion?: number): void {
  const key = `epic-${epicNum}`;
  const status = getSprintStatus();
  if (expectedVersion !== undefined && status.version !== undefined && status.version !== expectedVersion) {
    throw new Error(`Concurrent modification detected: expected version ${expectedVersion}, got ${status.version}. Reload and retry.`);
  }

  if (!(key in status.development_status)) {
    throw new Error(`Epic not found: epic-${epicNum}`);
  }

  status.development_status[key] = newStatus;
  status.last_updated = new Date().toISOString();

  saveSprintStatus(status);
}

export function getStoriesByEpic(epicNum: number): StoryInfo[] {
  const status = getSprintStatus();
  const stories: StoryInfo[] = [];

  for (const [key, value] of Object.entries(status.development_status)) {
    const parsed = parseStoryKey(key);
    if (!parsed || parsed.type !== 'story') continue;
    if (parsed.epicNum !== epicNum) continue;

    stories.push({
      key,
      epicNum: parsed.epicNum,
      storyNum: parsed.storyNum,
      title: parsed.title,
      status: value as StoryStatus,
      type: 'story',
    });
  }

  return stories.sort((a, b) => a.storyNum - b.storyNum);
}

export function isFirstStoryInEpic(storyInfo: StoryInfo): boolean | null {
  const stories = getStoriesByEpic(storyInfo.epicNum);
  if (stories.length === 0) return null;

  const firstStory = stories[0];
  return firstStory !== undefined && firstStory.key === storyInfo.key;
}

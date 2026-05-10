import {
  initDatabase,
  checkpoint as storeCheckpoint,
  getLastCheckpoint,
  logError,
  logInvocation,
  getCheckpointsByStory,
  getErrorsByStory,
  getAllCheckpoints,
  getPendingNotifications,
  markNotificationSent,
  queueNotification,
  getDatabase,
  saveDatabase,
  resetDatabase,
  type CheckpointRecord,
  type ErrorRecord,
  type NotificationRecord,
  type InvocationRecord,
} from './store';
import { type StoryInfo, type WorkflowType } from './state-machine';

export { 
  type CheckpointRecord, 
  type ErrorRecord, 
  type NotificationRecord, 
  type InvocationRecord,
  getAllCheckpoints,
};

let isInitialized = false;
let initPromise: Promise<void> | null = null;

export async function ensureInitialized(): Promise<void> {
  if (isInitialized) return;
  if (!initPromise) {
    initPromise = initDatabase().then(() => {
      isInitialized = true;
      initPromise = null;
    });
  }
  await initPromise;
}

export async function checkpointStory(
  story: StoryInfo,
  workflow: WorkflowType,
  attempt: number = 1
): Promise<CheckpointRecord> {
  await ensureInitialized();
  return storeCheckpoint(story.key, workflow, story.status, attempt);
}

export async function getLastCheckpointForStory(storyKey: string): Promise<CheckpointRecord | null> {
  await ensureInitialized();
  return getLastCheckpoint(storyKey);
}

export async function logStoryError(
  storyKey: string,
  workflow: WorkflowType,
  errorType: string,
  errorMessage: string,
  stackTrace?: string
): Promise<ErrorRecord> {
  await ensureInitialized();
  return logError(storyKey, workflow, errorType, errorMessage, stackTrace ?? null);
}

export async function logAgentInvocation(
  storyKey: string | null,
  workflow: string | null,
  harness: string,
  model: string,
  exitCode: number | null,
  durationMs: number | null,
  success: boolean
): Promise<InvocationRecord> {
  await ensureInitialized();
  return logInvocation(storyKey, workflow, harness, model, exitCode, durationMs, success);
}

export async function getStoryHistory(storyKey: string): Promise<{
  checkpoints: CheckpointRecord[];
  errors: ErrorRecord[];
}> {
  await ensureInitialized();
  return {
    checkpoints: getCheckpointsByStory(storyKey),
    errors: getErrorsByStory(storyKey),
  };
}

export async function getAllStoryCheckpoints(): Promise<CheckpointRecord[]> {
  await ensureInitialized();
  return getAllCheckpoints();
}

export async function getUnsentNotifications(): Promise<NotificationRecord[]> {
  await ensureInitialized();
  return getPendingNotifications();
}

export async function markNotificationAsSent(id: number): Promise<void> {
  await ensureInitialized();
  markNotificationSent(id);
}

export async function enqueueNotification(
  storyKey: string | null,
  eventType: string,
  message: string,
  priority: number = 2
): Promise<NotificationRecord> {
  await ensureInitialized();
  return queueNotification(storyKey, eventType, message, priority);
}

export async function recoverFromCheckpoint(storyKey: string): Promise<{
  lastCheckpoint: CheckpointRecord | null;
  recentErrors: ErrorRecord[];
  storyCheckpoints: CheckpointRecord[];
} | null> {
  await ensureInitialized();

  const lastCheckpoint = getLastCheckpoint(storyKey);
  if (!lastCheckpoint) {
    return null;
  }

  const errors = getErrorsByStory(storyKey);
  const checkpoints = getCheckpointsByStory(storyKey);

  return {
    lastCheckpoint,
    recentErrors: errors.slice(0, 10),
    storyCheckpoints: checkpoints,
  };
}

export async function forceSave(): Promise<void> {
  await ensureInitialized();
  saveDatabase();
}

export async function cleanup(): Promise<void> {
  resetDatabase();
  isInitialized = false;
  initPromise = null;
}

export function isReady(): boolean {
  return isInitialized && getDatabase() !== null;
}
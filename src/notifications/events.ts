export type NotificationEvent =
  | 'STORY_STARTED'
  | 'STORY_COMPLETED'
  | 'STORY_FAILED'
  | 'NEEDS_INPUT'
  | 'STALL_DETECTED'
  | 'EPIC_COMPLETED'
  | 'SPRINT_COMPLETED'
  | 'CIRCUIT_BREAKER_OPEN'
  | 'RECOVERY_COMPLETE';

export interface NotificationPayload {
  event: NotificationEvent;
  storyKey?: string;
  workflow?: string;
  details?: string;
  timestamp: Date;
}

export interface NotificationFormatter {
  format(payload: NotificationPayload): string;
}

export class StoryNotificationFormatter implements NotificationFormatter {
  format(payload: NotificationPayload): string {
    const { event, storyKey, workflow, details } = payload;
    
    const key = storyKey ?? 'Unknown';
    const wf = workflow ?? 'Unknown';
    const det = details ?? '';

    const templates: Record<NotificationEvent, string> = {
      STORY_STARTED: `🔄 Story started: ${key}\nWorkflow: ${wf}`,
      STORY_COMPLETED: `✅ Story completed: ${key}`,
      STORY_FAILED: `❌ Story failed: ${key}\nError: ${det}`,
      NEEDS_INPUT: `❓ Input needed: ${key}\n${det}`,
      STALL_DETECTED: `⚠️ Stall detected: ${key}\n${det}`,
      EPIC_COMPLETED: `🎉 Epic completed!\n${det}`,
      SPRINT_COMPLETED: `🏁 Sprint completed!\n${det}`,
      CIRCUIT_BREAKER_OPEN: `🔴 Circuit breaker open: ${det}`,
      RECOVERY_COMPLETE: `♻️ Recovery complete: ${key}`,
    };

    return templates[event] ?? `Unknown event: ${event}`;
  }
}

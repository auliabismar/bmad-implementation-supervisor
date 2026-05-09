/**
 * Error Type Definitions
 * 
 * Defines the taxonomy for error classification and recovery actions.
 */

import type { AgentResult } from '../agents/harness/interface';

export type ErrorCategory = 'RETRYABLE' | 'RECOVERABLE' | 'FATAL' | 'HUMAN_INPUT';

export type ErrorAction = 'RETRY' | 'SWITCH_MODEL' | 'PAUSE' | 'ESCALATE' | 'WAIT_FOR_INPUT';

export type WorkflowType = 'create-story' | 'dev-story' | 'code-review';

export interface ErrorContext {
  storyKey: string;
  workflow: WorkflowType;
  attempt: number;
  error: Error | null;
  agentResult?: AgentResult;
  timestamp: Date;
}

export interface ErrorClassification {
  category: ErrorCategory;
  action: ErrorAction;
  reason: string;
  shouldRetry: boolean;
  retryableWithBackoff: boolean;
  fallbackPossible: boolean;
}

export interface ErrorActionResult {
  action: ErrorAction;
  backoffMs?: number;
  reason: string;
  nextSteps?: string[];
}

export const EXIT_TIMEOUT = 124;
export const EXIT_SIGNAL = 137;
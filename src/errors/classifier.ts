/**
 * Error Classification for Fallback & Recovery
 * 
 * This module classifies errors to determine fallback behavior:
 * - RETRYABLE: Can retry same model/harness (e.g., rate limit, timeout)
 * - RECOVERABLE: Switch to next model/harness (e.g., model not found)
 * - FATAL: Stop immediately, requires human intervention (e.g., auth failure)
 * - HUMAN_INPUT: Agent requires human confirmation (e.g., question via stdout)
 */

import type { AgentResult } from '../agents/harness/interface';
import type { ErrorClassification, ErrorCategory, ErrorContext, WorkflowType } from './types';

export type { ErrorCategory, ErrorAction, ErrorContext, ErrorClassification, ErrorActionResult, WorkflowType } from './types';

export enum ErrorType {
  RETRYABLE = 'retryable',
  RECOVERABLE = 'recoverable',
  FATAL = 'fatal',
}

export class FallbackExhaustedError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(attempts: number, lastError: Error) {
    const message = `All ${attempts} fallback attempts exhausted. Last error: ${lastError.message}`;
    super(message);
    this.name = 'FallbackExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

const RETRYABLE_PATTERNS: RegExp[] = [
  /timeout/i,
  /timed out/i,
  /rate limit/i,
  /429/i,
  /too many requests/i,
  /network error/i,
  /ECONNREFUSED/i,
  /ETIMEDOUT/i,
  /ENOTFOUND/i,
  /quota exceeded/i,
  /insufficient credits/i,
];

const RECOVERABLE_PATTERNS: RegExp[] = [
  /parse error/i,
  /invalid json/i,
  /json error/i,
  /missing artifact/i,
  /incomplete output/i,
  /context window/i,
  /spawn.*eacces/i,
  /spawn.*enoent/i,
  /executable.*not found/i,
  /failed to spawn/i,
  /model not found/i,
  /unknown model/i,
  /unsupported model/i,
  /cli not found/i,
  /command not found/i,
  /not found/i,
];

const FATAL_PATTERNS: RegExp[] = [
  /disk full/i,
  /no space left/i,
  /ENOSPC/i,
  /permission denied/i,
  /EACCES/i,
  /yaml parse error/i,
  /invalid yaml/i,
  /authentication failed/i,
  /invalid api key/i,
  /unauthorized/i,
  /invalid token/i,
  /access denied/i,
];

const HUMAN_INPUT_PATTERNS: RegExp[] = [
  /please confirm/i,
  /should i proceed/i,
  /do you want me to/i,
  /\?$/m,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function getDefaultClassification(category: ErrorCategory, reason: string): ErrorClassification {
  return {
    category,
    action: categoryToAction(category),
    reason,
    shouldRetry: category === 'RETRYABLE',
    retryableWithBackoff: category === 'RETRYABLE',
    fallbackPossible: category !== 'FATAL',
  };
}

function categoryToAction(category: ErrorCategory): string {
  switch (category) {
    case 'RETRYABLE': return 'RETRY';
    case 'RECOVERABLE': return 'SWITCH_MODEL';
    case 'FATAL': return 'ESCALATE';
    case 'HUMAN_INPUT': return 'WAIT_FOR_INPUT';
  }
  return 'ESCALATE';
}

export function classifyError(error: Error, stderr?: string): ErrorType {
  if (!error) return ErrorType.FATAL;
  const text = [error.message, stderr || ''].join(' ');

  if (matchesAny(text, FATAL_PATTERNS)) return ErrorType.FATAL;
  if (matchesAny(text, RETRYABLE_PATTERNS)) return ErrorType.RETRYABLE;
  if (matchesAny(text, HUMAN_INPUT_PATTERNS)) return ErrorType.FATAL;
  if (matchesAny(text, RECOVERABLE_PATTERNS)) return ErrorType.RECOVERABLE;

  return ErrorType.FATAL;
}

export function shouldFallback(errorType: ErrorType): boolean {
  return errorType === ErrorType.RETRYABLE || errorType === ErrorType.RECOVERABLE;
}

export function classifyFromStatus(status: string, stderr?: string): ErrorType {
  if (!status || typeof status !== 'string') return ErrorType.FATAL;

  if (status === 'completed') return ErrorType.FATAL;
  if (status === 'retryable' || status === 'timeout') return ErrorType.RETRYABLE;
  if (status === 'needs_input') return ErrorType.FATAL;
  if (status === 'failed') {
    const text = stderr || '';
    if (matchesAny(text, HUMAN_INPUT_PATTERNS)) return ErrorType.FATAL;
    if (matchesAny(text, FATAL_PATTERNS)) return ErrorType.FATAL;
    if (matchesAny(text, RETRYABLE_PATTERNS)) return ErrorType.RETRYABLE;
    if (matchesAny(text, RECOVERABLE_PATTERNS)) return ErrorType.RECOVERABLE;
    return ErrorType.RECOVERABLE;
  }
  return ErrorType.FATAL;
}

export class ErrorClassifier {
  classify(error: Error | AgentResult, context: ErrorContext): ErrorClassification {
    if (this.isAgentResult(error)) {
      return this.classifyAgentResult(error, context);
    }
    return this.classifyErrorObj(error, context);
  }

  private isAgentResult(value: Error | AgentResult): value is AgentResult {
    return 'status' in value && 'exitCode' in value;
  }

  private classifyAgentResult(result: AgentResult, context: ErrorContext): ErrorClassification {
    const { stdout, stderr, exitCode } = result;
    const combined = `${stdout} ${stderr}`;

    if (matchesAny(combined, HUMAN_INPUT_PATTERNS)) {
      return {
        category: 'HUMAN_INPUT',
        action: 'WAIT_FOR_INPUT',
        reason: 'Agent requires human confirmation',
        shouldRetry: false,
        retryableWithBackoff: false,
        fallbackPossible: true,
      };
    }

    if (matchesAny(combined, FATAL_PATTERNS)) {
      return {
        category: 'FATAL',
        action: 'ESCALATE',
        reason: 'Fatal system error detected',
        shouldRetry: false,
        retryableWithBackoff: false,
        fallbackPossible: false,
      };
    }

    if (exitCode === 124 || exitCode === 137 || matchesAny(combined, RETRYABLE_PATTERNS)) {
      return {
        category: 'RETRYABLE',
        action: 'RETRY',
        reason: 'Transient error, safe to retry',
        shouldRetry: true,
        retryableWithBackoff: true,
        fallbackPossible: true,
      };
    }

    if (matchesAny(combined, RECOVERABLE_PATTERNS)) {
      return {
        category: 'RECOVERABLE',
        action: 'SWITCH_MODEL',
        reason: 'Recoverable error, try different model',
        shouldRetry: false,
        retryableWithBackoff: false,
        fallbackPossible: true,
      };
    }

    return {
      category: 'RECOVERABLE',
      action: 'SWITCH_MODEL',
      reason: 'Unknown error, attempting recovery',
      shouldRetry: false,
      retryableWithBackoff: false,
      fallbackPossible: true,
    };
  }

  private classifyErrorObj(error: Error, context: ErrorContext): ErrorClassification {
    const message = error?.message || '';

    if (matchesAny(message, HUMAN_INPUT_PATTERNS)) {
      return {
        category: 'HUMAN_INPUT',
        action: 'WAIT_FOR_INPUT',
        reason: 'Agent requires human confirmation',
        shouldRetry: false,
        retryableWithBackoff: false,
        fallbackPossible: true,
      };
    }

    if (matchesAny(message, FATAL_PATTERNS)) {
      return {
        category: 'FATAL',
        action: 'ESCALATE',
        reason: `Fatal error: ${message}`,
        shouldRetry: false,
        retryableWithBackoff: false,
        fallbackPossible: false,
      };
    }

    if (matchesAny(message, RETRYABLE_PATTERNS)) {
      return {
        category: 'RETRYABLE',
        action: 'RETRY',
        reason: `Retryable error: ${message}`,
        shouldRetry: true,
        retryableWithBackoff: true,
        fallbackPossible: true,
      };
    }

    return {
      category: 'RECOVERABLE',
      action: 'SWITCH_MODEL',
      reason: `Unknown error: ${message}`,
      shouldRetry: false,
      retryableWithBackoff: false,
      fallbackPossible: true,
    };
  }
}

export const classifier = new ErrorClassifier();
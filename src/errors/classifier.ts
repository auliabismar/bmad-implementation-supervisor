/**
 * Error Classification for Fallback & Recovery
 * 
 * This module classifies errors to determine fallback behavior:
 * - RETRYABLE: Can retry same model/harness (e.g., rate limit, timeout)
 * - RECOVERABLE: Switch to next model/harness (e.g., model not found)
 * - FATAL: Stop immediately, requires human intervention (e.g., auth failure)
 */

export enum ErrorType {
  RETRYABLE = 'retryable',
  RECOVERABLE = 'recoverable',
  FATAL = 'fatal',
}

/**
 * Thrown when all fallback attempts (model pool entries) have been exhausted.
 */
export class FallbackExhaustedError extends Error {
  public readonly attempts: number;
  public readonly lastError: Error;

  constructor(attempts: number, lastError: Error) {
    super(`All ${attempts} fallback attempts exhausted. Last error: ${lastError.message}`);
    this.name = 'FallbackExhaustedError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

/**
 * Classify an error (and optional stderr) into an ErrorType to guide fallback behavior.
 * 
 * Pattern matching is case-insensitive and examines both error message and stderr.
 * 
 * @param error - The error object from harness invocation
 * @param stderr - Optional stderr output for additional context
 * @returns ErrorType classification
 */
export function classifyError(error: Error, stderr?: string): ErrorType {
  const text = [error.message, stderr || ''].join(' ').toLowerCase();

  // RETRYABLE patterns - can retry same model after backoff
  const retryablePatterns = [
    /rate limit/,
    /429/,
    /too many requests/,
    /quota exceeded/,
    /insufficient credits/,
    /timed out/,
    /timeout/,
  ];

  for (const pattern of retryablePatterns) {
    if (pattern.test(text)) {
      return ErrorType.RETRYABLE;
    }
  }

  // RECOVERABLE patterns - try a different model/harness
  const recoverablePatterns = [
    /model not found/,
    /unknown model/,
    /not found/,
    /unsupported model/,
    /cli not found/,
    /command not found/,
    /spawn.*eacces/,
    /spawn.*enoent/,
    /executable.*not found/,
    /failed to spawn/,
  ];

  for (const pattern of recoverablePatterns) {
    if (pattern.test(text)) {
      return ErrorType.RECOVERABLE;
    }
  }

  // FATAL patterns - stop immediately, needs human
  const fatalPatterns = [
    /authentication failed/,
    /invalid api key/,
    /unauthorized/,
    /invalid token/,
    /permission denied/,
    /access denied/,
  ];

  for (const pattern of fatalPatterns) {
    if (pattern.test(text)) {
      return ErrorType.FATAL;
    }
  }

  // Unknown errors default to FATAL for safety
  return ErrorType.FATAL;
}

/**
 * Determine whether an error type should trigger fallback to next model.
 * RETRYABLE and RECOVERABLE both trigger fallback chain progression.
 * 
 * @param errorType - Classified error type
 * @returns true if fallback should proceed
 */
export function shouldFallback(errorType: ErrorType): boolean {
  return errorType === ErrorType.RETRYABLE || errorType === ErrorType.RECOVERABLE;
}

/**
 * Extract error classification from an AgentResult status.
 * Converts the harness-specific status into an ErrorType for fallback decisions.
 * 
 * @param status - AgentResult status ('completed', 'failed', 'timeout', 'retryable')
 * @param stderr - Optional stderr for finer-grained classification
 * @returns ErrorType
 */
export function classifyFromStatus(status: string, stderr?: string): ErrorType {
  if (status === 'completed') {
    // Success case - this branch is dead code since caller checks 'completed' before calling,
    // but returning FATAL as a sentinel ensures no fallback is triggered if ever called directly
    return ErrorType.FATAL;
  }
  if (status === 'retryable' || status === 'timeout') {
    return ErrorType.RETRYABLE;
  }
  if (status === 'failed') {
    if (!stderr) {
      // No stderr, unknown failure, treat as RECOVERABLE to allow fallback
      return ErrorType.RECOVERABLE;
    }

    const lowerStderr = stderr.toLowerCase();

    // RETRYABLE patterns
    const retryablePatterns = [
      /rate limit/,
      /429/,
      /too many requests/,
      /quota exceeded/,
      /insufficient credits/,
      /timed out/,
      /timeout/,
    ];
    for (const pattern of retryablePatterns) {
      if (pattern.test(lowerStderr)) {
        return ErrorType.RETRYABLE;
      }
    }

    // FATAL patterns - stop immediately, needs human
    const fatalPatterns = [
      /authentication failed/,
      /invalid api key/,
      /unauthorized/,
      /invalid token/,
      /permission denied/,
      /access denied/,
    ];
    for (const pattern of fatalPatterns) {
      if (pattern.test(lowerStderr)) {
        return ErrorType.FATAL;
      }
    }

    // All other errors are RECOVERABLE - try another model/harness
    return ErrorType.RECOVERABLE;
  }
  // 'needs_input' and other statuses default to FATAL
  return ErrorType.FATAL;
}

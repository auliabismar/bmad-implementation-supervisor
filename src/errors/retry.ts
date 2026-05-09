import type { ErrorClassification, ErrorContext } from './types';
import { ErrorClassifier } from './classifier';

export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  multiplier?: number;
  jitterMs?: number;
  shouldRetry?: (error: any, classification?: ErrorClassification) => boolean;
  onRetry?: (attempt: number, delayMs: number, error: Error) => void;
  signal?: AbortSignal;
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  attempts: number;
  totalTimeMs: number;
  lastError?: Error;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
  if (!signal) {
    return sleep(ms);
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => resolve(), ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timeout);
      reject(new Error('Retry cancelled'));
    }, { once: true });
  });
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'object' && error !== null) {
    return new Error(JSON.stringify(error));
  }
  return new Error(String(error));
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 60000,
    multiplier = 2,
    jitterMs = 100,
    shouldRetry,
    onRetry,
    signal,
  } = options;

  if (maxRetries < 0 || baseDelayMs < 0 || maxDelayMs < 0 || jitterMs < 0 || multiplier <= 0) {
    throw new RangeError('maxRetries, baseDelayMs, maxDelayMs, and jitterMs must be non-negative; multiplier must be positive');
  }

  const startTime = Date.now();
  let lastError: Error | undefined;
  let attempt = 0;

  while (true) {
    attempt++;
    
    if (signal?.aborted) {
      throw new Error('Retry cancelled');
    }

    try {
      const result = await fn();
      if (signal?.aborted) {
        throw new Error('Retry cancelled');
      }
      return {
        success: true,
        result,
        attempts: attempt,
        totalTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      lastError = normalizeError(error);

      const shouldRetryOnError = shouldRetry ? shouldRetry(error) : true;
      if (!shouldRetryOnError) {
        break;
      }

      if (attempt > maxRetries) {
        break;
      }

      const baseDelay = Math.min(
        baseDelayMs * (multiplier ** (attempt - 1)),
        maxDelayMs
      );
      const jitter = Math.random() * Math.max(0, jitterMs);
      const delayMs = Math.floor(baseDelay + jitter);

      try {
        onRetry?.(attempt, delayMs, lastError);
      } catch {
        // Swallow callback errors to not disrupt retry logic
      }

      await sleepWithAbort(delayMs, signal);

      if (signal?.aborted) {
        throw new Error('Retry cancelled');
      }
    }
  }

  return {
    success: false,
    attempts: attempt,
    totalTimeMs: Date.now() - startTime,
    lastError,
  };
}

const classifier = new ErrorClassifier();

export async function withRetry<T>(
  fn: () => Promise<T>,
  context: ErrorContext,
  options: RetryOptions = {}
): Promise<RetryResult<T>> {
  const userShouldRetry = options.shouldRetry;
  
  return retryWithBackoff(fn, {
    ...options,
    shouldRetry: (error, classification) => {
      const autoRetry = classifier.classify(error, context);
      const userAllows = !userShouldRetry || userShouldRetry(error, autoRetry);
      return autoRetry.shouldRetry && autoRetry.retryableWithBackoff && userAllows;
    },
    onRetry: (attempt, delayMs, error) => {
      try {
        options.onRetry?.(attempt, delayMs, error);
      } catch {
        // Swallow callback errors
      }
    },
  });
}
import { describe, it, expect, beforeEach } from 'bun:test';
import { retryWithBackoff, withRetry } from './retry';
import type { RetryOptions } from './retry';
import type { ErrorContext } from './types';

function createMockFn<T>(values: T[], errors: Error[]): () => Promise<T> {
  let callCount = 0;
  return async (): Promise<T> => {
    if (callCount < errors.length) {
      throw errors[callCount++];
    }
    if (callCount < values.length + errors.length) {
      return values[callCount++ - errors.length] as T;
    }
    throw new Error('No more mock values');
  };
}

describe('retryWithBackoff', () => {
  describe('succeeds on first try', () => {
    it('returns success immediately without retries', async () => {
      const fn = createMockFn(['success'], []);
      const result = await retryWithBackoff(fn, { maxRetries: 3 });
      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.attempts).toBe(1);
    });
  });

  describe('retries on failure', () => {
    it('retries failed operations up to maxRetries', async () => {
      const fn = createMockFn(
        ['success'],
        [new Error('fail 1'), new Error('fail 2')]
      );
      const result = await retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 1, jitterMs: 0 });
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(3);
    });

    it('returns failure after exhausting retries', async () => {
      const err = new Error('permanent failure');
      const fn = async () => { throw err; };
      const result = await retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 1, jitterMs: 0 });
      expect(result.success).toBe(false);
      expect(result.attempts).toBe(3);
      expect(result.lastError).toBe(err);
    });
  });

  describe('exponential backoff', () => {
    it('increases delay exponentially', async () => {
      const errors = [new Error('retry 1'), new Error('retry 2'), new Error('retry 3')];
      const fn = createMockFn(['success'], errors);
      
      const start = Date.now();
      const result = await retryWithBackoff(fn, { 
        maxRetries: 3, 
        baseDelayMs: 50, 
        jitterMs: 0,
        multiplier: 2 
      });
      const elapsed = Date.now() - start;
      
      expect(result.success).toBe(true);
      expect(elapsed).toBeGreaterThanOrEqual(150);
    });
  });

  describe('max delay capping', () => {
    it('caps delay at maxDelayMs', async () => {
      const errors = [new Error('retry 1'), new Error('retry 2'), new Error('retry 3')];
      const fn = createMockFn(['success'], errors);
      
      const start = Date.now();
      const result = await retryWithBackoff(fn, { 
        maxRetries: 3, 
        baseDelayMs: 1000,
        maxDelayMs: 50,
        multiplier: 2,
        jitterMs: 0 
      });
      const elapsed = Date.now() - start;
      
      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(300);
    });
  });

  describe('jitter', () => {
    it('adds random jitter to prevent thundering herd', async () => {
      const delays: number[] = [];
      const fn = async () => { throw new Error('fail'); };
      
      await retryWithBackoff(fn, { 
        maxRetries: 1, 
        baseDelayMs: 100,
        jitterMs: 50,
        onRetry: (_: number, delayMs: number) => delays.push(delayMs)
      });
      
      expect(delays.length).toBe(1);
      expect(delays[0]).toBeGreaterThanOrEqual(100);
      expect(delays[0]).toBeLessThanOrEqual(150);
    });
  });

  describe('cancellation', () => {
    it('respects AbortController cancellation', async () => {
      const controller = new AbortController();
      const fn = async () => { throw new Error('fail'); };

      const promise = retryWithBackoff(fn, { 
        maxRetries: 3,
        baseDelayMs: 10,
        signal: controller.signal
      });

      controller.abort();

      await expect(promise).rejects.toThrow('Retry cancelled');
    });

    it('does not retry after cancellation', async () => {
      const controller = new AbortController();
      let callCount = 0;
      const fn = async () => { 
        callCount++;
        throw new Error('fail'); 
      };

      const promise = retryWithBackoff(fn, { 
        maxRetries: 3,
        baseDelayMs: 10,
        signal: controller.signal
      });

      controller.abort();

      await expect(promise).rejects.toThrow('Retry cancelled');
      expect(callCount).toBe(1);
    });
  });

  describe('onRetry callback', () => {
    it('calls onRetry with attempt number, delay, and error', async () => {
      const calls: [number, number, Error][] = [];
      const errors = [new Error('fail 1'), new Error('fail 2')];
      const fn = createMockFn(['success'], errors);

      await retryWithBackoff(fn, { 
        maxRetries: 3,
        baseDelayMs: 10,
        jitterMs: 0,
        onRetry: (attempt, delayMs, error) => calls.push([attempt, delayMs, error])
      });

      expect(calls.length).toBe(2);
      expect(calls[0]?.[0]).toBe(1);
      expect(calls[0]?.[2]?.message).toBe('fail 1');
    });
  });

  describe('retry statistics', () => {
    it('tracks total time across all attempts', async () => {
      const errors = [new Error('retry')];
      const fn = createMockFn(['success'], errors);
      
      const result = await retryWithBackoff(fn, { 
        maxRetries: 1,
        baseDelayMs: 10,
        jitterMs: 0
      });
      
      expect(result.totalTimeMs).toBeGreaterThanOrEqual(10);
    });

    it('counts total attempts including initial', async () => {
      const errors = [new Error('fail 1'), new Error('fail 2')];
      const fn = createMockFn(['success'], errors);
      
      const result = await retryWithBackoff(fn, { 
        maxRetries: 2,
        baseDelayMs: 10,
        jitterMs: 0
      });
      
      expect(result.attempts).toBe(3);
    });
  });

  describe('custom shouldRetry predicate', () => {
    it('respects custom retry predicate', async () => {
      const fn = async () => { throw new Error('specific error'); };

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        shouldRetry: (error: Error) => error.message !== 'specific error'
      });

      expect(result.success).toBe(false);
      expect(result.lastError?.message).toBe('specific error');
    });

    it('allows retry when predicate returns true', async () => {
      const fn = createMockFn(['success'], [new Error('retryable error')]);

      const result = await retryWithBackoff(fn, {
        maxRetries: 3,
        baseDelayMs: 10,
        jitterMs: 0,
        shouldRetry: (error: Error) => error.message.includes('retryable')
      });

      expect(result.success).toBe(true);
    });
  });

  describe('default values', () => {
    it('uses sensible defaults when options not provided', async () => {
      const fn = async () => 'success';
      const result = await retryWithBackoff(fn);
      expect(result.success).toBe(true);
      expect(result.attempts).toBe(1);
    });
  });
});

describe('RetryResult interface', () => {
  it('has all required properties', async () => {
    const fn = async () => 'value';
    const result = await retryWithBackoff(fn);
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('result');
    expect(result).toHaveProperty('attempts');
    expect(result).toHaveProperty('totalTimeMs');
  });
});

describe('validation', () => {
  it('throws on negative maxDelayMs', async () => {
    const fn = async () => 'ok';
    await expect(retryWithBackoff(fn, { maxDelayMs: -1 }))
      .rejects.toThrow(RangeError);
  });

  it('throws on zero multiplier', async () => {
    const fn = async () => 'ok';
    await expect(retryWithBackoff(fn, { multiplier: 0 }))
      .rejects.toThrow(RangeError);
  });

  it('throws on negative multiplier', async () => {
    const fn = async () => 'ok';
    await expect(retryWithBackoff(fn, { multiplier: -2 }))
      .rejects.toThrow(RangeError);
  });
});

describe('withRetry', () => {
  it('retries on RETRYABLE classification', async () => {
    const context: ErrorContext = {
      storyKey: 'test',
      workflow: 'dev-story',
      attempt: 1,
      error: null,
      timestamp: new Date(),
    };
    const fn = createMockFn(['success'], [new Error('timeout error')]);
    const result = await withRetry(fn, context, { maxRetries: 1, baseDelayMs: 1, jitterMs: 0 });
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
  });

  it('does not retry on FATAL classification', async () => {
    const context: ErrorContext = {
      storyKey: 'test',
      workflow: 'dev-story',
      attempt: 1,
      error: null,
      timestamp: new Date(),
    };
    const fn = async () => { throw new Error('disk full'); };
    const result = await withRetry(fn, context, { maxRetries: 3 });
    expect(result.success).toBe(false);
    expect(result.lastError?.message).toBe('disk full');
  });
});

describe('normalizeError', () => {
  it('preserves Error instance', async () => {
    const err = new Error('test');
    const fn = async () => { throw err; };
    const result = await retryWithBackoff(fn, { maxRetries: 0 });
    expect(result.lastError).toBe(err);
  });

  it('converts non-Error objects to Error', async () => {
    const fn = async () => { throw { code: 'ERR_OOM', message: 'out of memory' }; };
    const result = await retryWithBackoff(fn, { maxRetries: 0 });
    expect(result.lastError).toBeInstanceOf(Error);
    expect(result.lastError?.message).toContain('ERR_OOM');
  });

  it('converts primitives to Error', async () => {
    const fn = async () => { throw 42; };
    const result = await retryWithBackoff(fn, { maxRetries: 0 });
    expect(result.lastError).toBeInstanceOf(Error);
    expect(result.lastError?.message).toBe('42');
  });
});
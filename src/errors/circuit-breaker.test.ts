import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, CircuitBreakerState, CircuitBreakerError, CircuitBreakerRegistry } from './circuit-breaker';

describe('CircuitBreaker', () => {
  beforeEach(() => {
    CircuitBreakerRegistry.resetAllBreakers();
  });

  let clock: number;
  let originalDateNow: typeof Date.now;

  beforeEach(() => {
    clock = Date.now();
    originalDateNow = Date.now;
    Date.now = vi.fn(() => clock);
  });

  afterEach(() => {
    Date.now = originalDateNow;
  });

  it('timeout transition', async () => {
    const cb = new CircuitBreaker({ threshold: 3, timeoutMs: 50 });
    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
    }
    expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    advanceTime(100);
    expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);
  });

  const advanceTime = (ms: number) => {
    clock += ms;
  };

  describe('initial state', () => {
    it('starts in CLOSED state', () => {
      const cb = new CircuitBreaker({ threshold: 3 });
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('starts not open', () => {
      const cb = new CircuitBreaker({ threshold: 3 });
      expect(cb.isOpen()).toBe(false);
    });
  });

  describe('state transitions', () => {
    it('transitions to OPEN after threshold failures', async () => {
      const cb = new CircuitBreaker({ threshold: 3, timeoutMs: 1000 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      }

      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
      expect(cb.isOpen()).toBe(true);
    });

    it('stays CLOSED when below threshold', async () => {
      const cb = new CircuitBreaker({ threshold: 3 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('transitions to HALF_OPEN after cooldown', async () => {
      const cb = new CircuitBreaker({ threshold: 3, timeoutMs: 50 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      }

      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);

      advanceTime(100);

      expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('resets to CLOSED on success in HALF_OPEN', async () => {
      const cb = new CircuitBreaker({ threshold: 3, timeoutMs: 50 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      }

      advanceTime(100);

      await cb.execute(() => Promise.resolve('success'));

      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('returns to OPEN on failure in HALF_OPEN', async () => {
      const cb = new CircuitBreaker({ threshold: 3, timeoutMs: 50 });

      for (let i = 0; i < 3; i++) {
        await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      }

      advanceTime(100);

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

      expect(cb.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('isOpen()', () => {
    it('returns true in OPEN state', async () => {
      const cb = new CircuitBreaker({ threshold: 2, timeoutMs: 10000 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

      expect(cb.isOpen()).toBe(true);
    });

    it('returns false in CLOSED state', () => {
      const cb = new CircuitBreaker({ threshold: 3 });
      expect(cb.isOpen()).toBe(false);
    });

    it('returns false in HALF_OPEN state', async () => {
      const cb = new CircuitBreaker({ threshold: 2, timeoutMs: 50 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

      advanceTime(100);

      expect(cb.isOpen()).toBe(false);
      expect(cb.getState()).toBe(CircuitBreakerState.HALF_OPEN);
    });

    it('rejects concurrent requests in HALF_OPEN state', async () => {
      const cb = new CircuitBreaker({ threshold: 1, timeoutMs: 50 });

      // Trip the breaker
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      
      // Advance past timeout
      advanceTime(100);
      
      // Create a pending Promise to simulate a slow trial request
      let resolveTrial: (val: string) => void;
      const slowRequest = new Promise<string>(resolve => {
        resolveTrial = resolve;
      });

      // Start the trial
      const trialPromise = cb.execute(() => slowRequest);
      
      // Try a concurrent request - should immediately throw CircuitBreakerError
      await expect(cb.execute(() => Promise.resolve('concurrent'))).rejects.toThrow('HALF_OPEN and a trial request is already pending');
      
      // Finish the trial
      resolveTrial!('success');
      await expect(trialPromise).resolves.toBe('success');
      
      // Breaker should now be CLOSED and accept requests again
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
      await expect(cb.execute(() => Promise.resolve('after-trial'))).resolves.toBe('after-trial');
    });
  });

  describe('execute()', () => {
    it('throws CircuitBreakerError when open', async () => {
      const cb = new CircuitBreaker({ threshold: 1, timeoutMs: 10000 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

      expect(cb.isOpen()).toBe(true);

      const error = await cb.execute(() => Promise.resolve('result')).catch(e => e);
      expect(error).toBeInstanceOf(CircuitBreakerError);
    });

    it('returns result on success', async () => {
      const cb = new CircuitBreaker({ threshold: 3 });
      const result = await cb.execute(() => Promise.resolve('test result'));
      expect(result).toBe('test result');
    });

    it('preserves successful executions after failure', async () => {
      const cb = new CircuitBreaker({ threshold: 3 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

      const result = await cb.execute(() => Promise.resolve('success'));
      expect(result).toBe('success');
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    });

  describe('synchronous operations', () => {
    it('throws when synchronous function passed', async () => {
      const cb = new CircuitBreaker({ threshold: 3 });
      await expect(cb.execute(() => {
        throw new Error('sync error');
      })).rejects.toThrow('sync error');
    });
  });

  describe('metrics tracking', () => {
    it('tracks failure count', async () => {
      const cb = new CircuitBreaker({ threshold: 3 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

      const stats = cb.getStats();
      expect(stats.failures).toBe(2);
    });

    it('tracks success count', async () => {
      const cb = new CircuitBreaker({ threshold: 3 });

      await cb.execute(() => Promise.resolve('a'));
      await cb.execute(() => Promise.resolve('b'));

      const stats = cb.getStats();
      expect(stats.successes).toBe(2);
    });

    it('tracks trips with timeout', async () => {
      const cb = new CircuitBreaker({ threshold: 2, timeoutMs: 50 });

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');

      let stats = cb.getStats();
      expect(stats.trips).toBe(1);

      advanceTime(100);

      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('Circuit breaker is OPEN');

      stats = cb.getStats();
      expect(stats.trips).toBe(2);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  beforeEach(() => {
    CircuitBreakerRegistry.resetAllBreakers();
  });

  it('creates per-harness circuit breakers', () => {
    const { createBreakerForHarness } = CircuitBreakerRegistry;

    const codexBreaker = createBreakerForHarness('codex');
    const opencodeBreaker = createBreakerForHarness('opencode');
    const commandcodeBreaker = createBreakerForHarness('commandcode');

    expect(codexBreaker).toBeDefined();
    expect(opencodeBreaker).toBeDefined();
    expect(commandcodeBreaker).toBeDefined();

    expect(codexBreaker).not.toBe(opencodeBreaker);
    expect(opencodeBreaker).not.toBe(commandcodeBreaker);
  });

  it('returns same instance for same harness', () => {
    const { createBreakerForHarness } = CircuitBreakerRegistry;

    const breaker1 = createBreakerForHarness('codex');
    const breaker2 = createBreakerForHarness('codex');

    expect(breaker1).toBe(breaker2);
  });

  it('throws for invalid harness', () => {
    const { createBreakerForHarness } = CircuitBreakerRegistry;

    expect(() => createBreakerForHarness('invalid' as any)).toThrow();
  });
});
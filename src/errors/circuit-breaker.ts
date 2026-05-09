import type { AgentHarness } from '../agents/harness/interface';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
    Error.captureStackTrace(this, CircuitBreakerError);
  }
}

export interface CircuitBreakerOptions {
  threshold?: number;
  timeoutMs?: number;
  resetTimeoutMs?: number;
}

export interface CircuitBreakerStats {
  failures: number;
  successes: number;
  trips: number;
  lastTripAt: number | null;
  state: CircuitBreakerState;
}

const defaultOptions: Required<CircuitBreakerOptions> = {
  threshold: 3,
  timeoutMs: 60000,
  resetTimeoutMs: 1000,
};

export class CircuitBreaker {
  private state: CircuitBreakerState;
  private failureCount: number;
  private successCount: number;
  private tripCount: number;
  private lastTripAt: number | null;
  private lastFailureAt: number;
  private options: Required<CircuitBreakerOptions>;
  private logger: (msg: string) => void;
  private halfOpenTrialPending: boolean;

  constructor(options: CircuitBreakerOptions = {}, logger?: (msg: string) => void) {
    this.options = { ...defaultOptions, ...options };
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.tripCount = 0;
    this.lastTripAt = null;
    this.lastFailureAt = 0;
    this.halfOpenTrialPending = false;
    this.logger = logger ?? (() => {});
  }

  getState(): CircuitBreakerState {
    this.checkTransition();
    return this.state;
  }

  isOpen(): boolean {
    this.checkTransition();
    return this.state === CircuitBreakerState.OPEN;
  }

  private checkTransition(): void {
    if (this.state !== CircuitBreakerState.OPEN) {
      return;
    }

    if (!this.lastTripAt) {
      return;
    }

    const timeSinceTrip = Date.now() - this.lastTripAt;
    if (timeSinceTrip >= this.options.timeoutMs) {
      this.transitionTo(CircuitBreakerState.HALF_OPEN);
    }
  }

  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    this.state = newState;
    this.logger(`CircuitBreaker: ${oldState} -> ${newState}`);

    if (newState === CircuitBreakerState.OPEN) {
      this.lastTripAt = Date.now();
      this.tripCount++;
    }

    if (newState === CircuitBreakerState.CLOSED) {
      this.failureCount = 0;
    }
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (typeof fn !== 'function') {
      throw new Error('fn must be a function');
    }

    this.checkTransition();

    if (this.state === CircuitBreakerState.OPEN) {
      throw new CircuitBreakerError(
        `Circuit breaker is OPEN. Last trip: ${this.lastTripAt}`
      );
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenTrialPending) {
        throw new CircuitBreakerError(
          `Circuit breaker is HALF_OPEN and a trial request is already pending`
        );
      }
      this.halfOpenTrialPending = true;
    }

    try {
      const result = await fn();

      this.successCount++;
      this.logger(`CircuitBreaker: Success in ${this.state} state`);

      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.transitionTo(CircuitBreakerState.CLOSED);
        this.halfOpenTrialPending = false;
      }

      return result;
    } catch (error) {
      this.failureCount++;
      this.lastFailureAt = Date.now();

      if (this.state === CircuitBreakerState.HALF_OPEN) {
        this.transitionTo(CircuitBreakerState.OPEN);
        this.halfOpenTrialPending = false;
        this.logger(`CircuitBreaker: Failed in HALF_OPEN, transitioned to OPEN`);
        throw error;
      }

      if (this.failureCount >= this.options.threshold) {
        this.transitionTo(CircuitBreakerState.OPEN);
        this.logger(`CircuitBreaker: Tripped after ${this.failureCount} failures`);
      }

      throw error;
    }
  }

  getStats(): CircuitBreakerStats {
    this.checkTransition();
    return {
      failures: this.failureCount,
      successes: this.successCount,
      trips: this.tripCount,
      lastTripAt: this.lastTripAt,
      state: this.state,
    };
  }

  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.halfOpenTrialPending = false;
    this.logger('CircuitBreaker: Reset to CLOSED');
  }
}

type HarnessType = AgentHarness;

const breakers: Map<HarnessType, CircuitBreaker> = new Map();

export function createBreakerForHarness(
  harness: HarnessType,
  options?: CircuitBreakerOptions
): CircuitBreaker {
  const validHarnesses: HarnessType[] = ['codex', 'opencode', 'commandcode'];
  
  if (!validHarnesses.includes(harness)) {
    throw new Error(`Invalid harness: ${harness}. Valid: ${validHarnesses.join(', ')}`);
  }

  if (!breakers.has(harness)) {
    breakers.set(harness, new CircuitBreaker(options));
  }

  return breakers.get(harness)!;
}

export function getBreaker(harness: HarnessType): CircuitBreaker | undefined {
  return breakers.get(harness);
}

export function resetAllBreakers(): void {
  for (const breaker of breakers.values()) {
    breaker.reset();
  }
}

export interface CircuitBreakerManager {
  execute<T>(harness: AgentHarness, fn: () => Promise<T>): Promise<T>;
  isOpen(harness: AgentHarness): boolean;
  getStats(harness: AgentHarness): CircuitBreakerStats;
  reset(harness?: AgentHarness): void;
}

export const createCircuitBreakerManager = (
  options?: CircuitBreakerOptions
): CircuitBreakerManager => ({
  async execute<T>(harness: AgentHarness, fn: () => Promise<T>): Promise<T> {
    const breaker = createBreakerForHarness(harness, options);
    return breaker.execute(fn);
  },

  isOpen(harness: AgentHarness): boolean {
    const breaker = getBreaker(harness);
    return breaker?.isOpen() ?? false;
  },

  getStats(harness: AgentHarness): CircuitBreakerStats {
    const breaker = getBreaker(harness);
    return breaker?.getStats() ?? {
      failures: 0,
      successes: 0,
      trips: 0,
      lastTripAt: null,
      state: CircuitBreakerState.CLOSED,
    };
  },

  reset(harness?: AgentHarness): void {
    if (harness) {
      getBreaker(harness)?.reset();
    } else {
      resetAllBreakers();
    }
  },
});

export const CircuitBreakerRegistry = {
  createBreakerForHarness,
  getBreaker,
  resetAllBreakers,
  createCircuitBreakerManager,
};
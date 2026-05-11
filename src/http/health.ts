import { getSprintStatus } from '../state/sprint-status';
import { getBreaker, CircuitBreakerState } from '../errors/circuit-breaker';
import type { HarnessType } from '../agents/harness/interface';

export interface HealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  timestamp: string;
  stories: {
    total: number;
    inProgress: number;
    done: number;
    failed: number;
    stalled: number;
  };
  lastError: string | null;
  circuitBreaker: 'closed' | 'open' | 'half_open';
}

let serverStartTime: number = Date.now();

function emptyStoryStatusCounts(): StoryStatusCounts {
  return {
    total: 0,
    inProgress: 0,
    done: 0,
    failed: 0,
    stalled: 0,
  };
}

export function resetUptime(): void {
  serverStartTime = Date.now();
}

export function getUptime(): number {
  return Date.now() - serverStartTime;
}

export interface StoryStatusCounts {
  total: number;
  inProgress: number;
  done: number;
  failed: number;
  stalled: number;
}

export function getStoryStatusCounts(): StoryStatusCounts {
  const status = getSprintStatus();
  const counts = emptyStoryStatusCounts();

  for (const [key, value] of Object.entries(status.development_status)) {
    if (key.startsWith('epic-') || key.includes('-retrospective')) {
      continue;
    }

    const storyMatch = key.match(/^\d+-\d+-/);
    if (!storyMatch) continue;

    counts.total++;

    switch (value) {
      case 'in-progress':
      case 'review':
        counts.inProgress++;
        break;
      case 'done':
        counts.done++;
        break;
      case 'failed':
        counts.failed++;
        break;
      case 'stalled':
        counts.stalled++;
        break;
      case 'backlog':
      case 'ready-for-dev':
      default:
        break;
    }
  }

  return counts;
}

export function getCircuitBreakerState(): 'closed' | 'open' | 'half_open' {
  const harnesses: HarnessType[] = ['codex', 'opencode', 'commandcode'];
  let worstState: CircuitBreakerState = CircuitBreakerState.CLOSED;

  for (const harness of harnesses) {
    const breaker = getBreaker(harness);
    if (breaker) {
      const state = breaker.getState();
      if (state === CircuitBreakerState.OPEN) {
        return 'open';
      }
      if (state === CircuitBreakerState.HALF_OPEN) {
        worstState = CircuitBreakerState.HALF_OPEN;
      }
    }
  }

  return worstState === CircuitBreakerState.HALF_OPEN ? 'half_open' : 'closed';
}

export function generateHealthResponse(lastError: string | null = null): HealthResponse {
  let stories = emptyStoryStatusCounts();
  let storyStatusError: string | null = null;

  try {
    stories = getStoryStatusCounts();
  } catch (error) {
    storyStatusError = error instanceof Error ? error.message : String(error);
  }

  const circuitBreakerState = getCircuitBreakerState();

  let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
  if (storyStatusError || circuitBreakerState === 'open') {
    status = 'unhealthy';
  } else if (stories.failed > 0 || stories.stalled > 0 || circuitBreakerState === 'half_open') {
    status = 'degraded';
  }

  return {
    status,
    uptime: getUptime(),
    timestamp: new Date().toISOString(),
    stories,
    lastError: lastError ?? storyStatusError,
    circuitBreaker: circuitBreakerState,
  };
}

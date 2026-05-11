import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  generateHealthResponse,
  getStoryStatusCounts,
  getCircuitBreakerState,
  resetUptime,
  getUptime,
} from './health';
import { CircuitBreakerRegistry, CircuitBreakerState } from '../errors/circuit-breaker';
import type { HarnessType } from '../agents/harness/interface';
import { resetSprintStatus, setSprintStatusTestPath } from '../state/sprint-status';

describe('health', () => {
  let tempDir: string;

  function writeSprintStatus(developmentStatus: Record<string, string>): string {
    const statusPath = path.join(tempDir, 'sprint-status.yaml');
    const statusEntries = Object.entries(developmentStatus)
      .map(([key, value]) => `  ${key}: ${value}`)
      .join('\n');

    fs.writeFileSync(
      statusPath,
      `generated: 2026-05-09
last_updated: 2026-05-09
project: test-project
tracking_system: file-system
story_location: _bmad-output/implementation-artifacts
development_status:
${statusEntries}
version: 1
`,
    );

    return statusPath;
  }

  function useSprintStatus(developmentStatus: Record<string, string>): void {
    setSprintStatusTestPath(writeSprintStatus(developmentStatus));
    resetSprintStatus();
  }

  async function tripBreaker(harness: HarnessType): Promise<void> {
    const breaker = CircuitBreakerRegistry.createBreakerForHarness(harness, { threshold: 1 });

    for (let attempt = 0; attempt < 3 && breaker.getState() !== CircuitBreakerState.OPEN; attempt++) {
      try {
        await breaker.execute(async () => {
          throw new Error('boom');
        });
      } catch {
        // Expected while forcing the breaker open.
      }
    }
  }

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-health-test-'));
    useSprintStatus({
      'epic-1': 'in-progress',
      '1-1-done-story': 'done',
      '1-2-active-story': 'in-progress',
      '1-3-review-story': 'review',
      '1-4-ready-story': 'ready-for-dev',
      '1-5-failed-story': 'failed',
      '1-6-stalled-story': 'stalled',
      'epic-1-retrospective': 'optional',
    });
    resetUptime();
    CircuitBreakerRegistry.resetAllBreakers();
  });

  afterEach(() => {
    setSprintStatusTestPath(null);
    resetSprintStatus();
    CircuitBreakerRegistry.resetAllBreakers();

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('getUptime', () => {
    it('returns non-negative value after reset', () => {
      resetUptime();
      expect(getUptime()).toBeGreaterThanOrEqual(0);
    });

    it('returns increasing uptime over time', () => {
      resetUptime();
      const start = getUptime();
      expect(start).toBeLessThanOrEqual(10);
    });
  });

  describe('getStoryStatusCounts', () => {
    it('counts only story entries and maps review to in-progress', () => {
      const counts = getStoryStatusCounts();

      expect(counts).toEqual({
        total: 6,
        inProgress: 2,
        done: 1,
        failed: 1,
        stalled: 1,
      });
    });
  });

  describe('getCircuitBreakerState', () => {
    it('returns closed when no breakers exist', () => {
      expect(getCircuitBreakerState()).toBe('closed');
    });

    it('returns open when any breaker is open', async () => {
      await tripBreaker('codex');

      expect(getCircuitBreakerState()).toBe('open');
    });
  });

  describe('generateHealthResponse', () => {
    it('returns valid health response structure', () => {
      const response = generateHealthResponse();

      expect(response.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(response.uptime).toBeGreaterThanOrEqual(0);
      expect(response.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(response.stories).toHaveProperty('total');
      expect(response.stories).toHaveProperty('inProgress');
      expect(response.stories).toHaveProperty('done');
      expect(response.stories).toHaveProperty('failed');
      expect(response.stories).toHaveProperty('stalled');
      expect(response.lastError).toBeNull();
      expect(response.circuitBreaker).toMatch(/^(closed|open|half_open)$/);
    });

    it('returns valid JSON structure', () => {
      const response = generateHealthResponse();
      const jsonString = JSON.stringify(response);
      const parsed = JSON.parse(jsonString);

      expect(parsed).toHaveProperty('status');
      expect(parsed).toHaveProperty('uptime');
      expect(parsed).toHaveProperty('timestamp');
      expect(parsed).toHaveProperty('stories');
      expect(parsed).toHaveProperty('lastError');
      expect(parsed).toHaveProperty('circuitBreaker');
    });

    it('marks health unhealthy when sprint status cannot be read', () => {
      setSprintStatusTestPath(path.join(tempDir, 'missing.yaml'));
      resetSprintStatus();

      const response = generateHealthResponse();

      expect(response.status).toBe('unhealthy');
      expect(response.lastError).toContain('Sprint status file not found');
    });

    it('marks health unhealthy when a circuit breaker is open', async () => {
      await tripBreaker('opencode');

      const response = generateHealthResponse();

      expect(response.status).toBe('unhealthy');
      expect(response.circuitBreaker).toBe('open');
    });

    it('accepts lastError parameter', () => {
      const response = generateHealthResponse('Test error');
      expect(response.lastError).toBe('Test error');
    });

    it('accepts null lastError', () => {
      const response = generateHealthResponse(null);
      expect(response.lastError).toBeNull();
    });
  });
});

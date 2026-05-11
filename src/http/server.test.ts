import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  startServer,
  stopServer,
  isServerRunning,
  getServerInfo,
  setLastError,
  getLastError,
  type ServerConfig,
} from './server';
import { CircuitBreakerRegistry, CircuitBreakerState } from '../errors/circuit-breaker';
import type { HarnessType } from '../agents/harness/interface';
import { resetSprintStatus, setSprintStatusTestPath } from '../state/sprint-status';

describe('server', () => {
  let tempDir: string;

  function writeSprintStatus(): string {
    const statusPath = path.join(tempDir, 'sprint-status.yaml');

    fs.writeFileSync(
      statusPath,
      `generated: 2026-05-09
last_updated: 2026-05-09
project: test-project
tracking_system: file-system
story_location: _bmad-output/implementation-artifacts
development_status:
  epic-1: in-progress
  1-1-done-story: done
  1-2-active-story: in-progress
  1-3-review-story: review
  epic-1-retrospective: optional
version: 1
`,
    );

    return statusPath;
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

  beforeEach(async () => {
    if (isServerRunning()) {
      await stopServer();
    }

    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-server-test-'));
    setSprintStatusTestPath(writeSprintStatus());
    resetSprintStatus();
    setLastError(null);
    CircuitBreakerRegistry.resetAllBreakers();
  });

  afterEach(async () => {
    if (isServerRunning()) {
      await stopServer();
    }

    setLastError(null);
    setSprintStatusTestPath(null);
    resetSprintStatus();
    CircuitBreakerRegistry.resetAllBreakers();

    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('startServer', () => {
    it('starts server on default port 3000', () => {
      const server = startServer();

      expect(server.port).toBe(3000);
      expect(server.hostname).toBe('localhost');
      expect(isServerRunning()).toBe(true);
    });

    it('starts server on custom port', () => {
      const server = startServer({ port: 19000 });

      expect(server.port).toBe(19000);
      expect(server.hostname).toBe('localhost');
    });

    it('does not allow hostname override', () => {
      const server = startServer({ port: 19001, hostname: '0.0.0.0' } as unknown as Partial<ServerConfig>);

      expect(server.hostname).toBe('localhost');
    });

    it('rejects duplicate start attempts', () => {
      startServer({ port: 19006 });

      expect(() => startServer({ port: 19007 })).toThrow(/already running/i);
    });
  });

  describe('stopServer', () => {
    it('stops running server', async () => {
      startServer({ port: 19002 });
      expect(isServerRunning()).toBe(true);

      await stopServer();
      expect(isServerRunning()).toBe(false);
    });

    it('handles stop when server not running', async () => {
      await expect(stopServer()).resolves.toBeUndefined();
    });
  });

  describe('getServerInfo', () => {
    it('returns server info when running', () => {
      startServer({ port: 19003 });

      const info = getServerInfo();
      expect(info).toEqual({ port: 19003, hostname: 'localhost' });
    });

    it('returns null when not running', () => {
      const info = getServerInfo();
      expect(info).toBeNull();
    });
  });

  describe('error tracking', () => {
    it('sets and gets last error', () => {
      setLastError('Test error');
      expect(getLastError()).toBe('Test error');
    });

    it('clears last error with null', () => {
      setLastError('Test error');
      setLastError(null);
      expect(getLastError()).toBeNull();
    });
  });

  describe('health endpoint', () => {
    it('returns health response on /health', async () => {
      startServer({ port: 19004 });

      const response = await fetch('http://localhost:19004/health');
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'healthy');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('timestamp');
      expect(data).toHaveProperty('stories');
      expect(data).toHaveProperty('circuitBreaker');
    });

    it('returns 503 when health status is unhealthy', async () => {
      await tripBreaker('codex');

      startServer({ port: 19008 });

      const response = await fetch('http://localhost:19008/health');
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data).toHaveProperty('status', 'unhealthy');
    });

    it('returns 404 for unknown routes', async () => {
      startServer({ port: 19005 });

      const response = await fetch('http://localhost:19005/unknown');
      expect(response.status).toBe(404);
    });
  });
});

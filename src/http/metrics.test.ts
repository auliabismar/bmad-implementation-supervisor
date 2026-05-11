import { describe, it, expect, beforeEach } from 'bun:test';
import {
  registry,
  storiesTotal,
  workflowDuration,
  errorsTotal,
  updateStoryMetrics,
  recordWorkflowDuration,
  recordError,
  getMetrics,
} from './metrics';

describe('metrics', () => {
  beforeEach(() => {
    registry.resetMetrics();
  });

  describe('storiesTotal gauge', () => {
    it('can set story counts with status labels', async () => {
      storiesTotal.set({ status: 'done' }, 5);
      storiesTotal.set({ status: 'in_progress' }, 2);
      storiesTotal.set({ status: 'failed' }, 1);

      const metrics = await getMetrics();
      expect(metrics).toContain('bmad_stories_total');
      expect(metrics).toContain('status="done"');
      expect(metrics).toContain('status="in_progress"');
      expect(metrics).toContain('status="failed"');
    });
  });

  describe('workflowDuration histogram', () => {
    it('records workflow duration with workflow label', async () => {
      recordWorkflowDuration('dev-story', 5000);
      recordWorkflowDuration('dev-story', 10000);
      recordWorkflowDuration('quick-dev', 2000);

      const metrics = await getMetrics();
      expect(metrics).toContain('bmad_workflow_duration_ms');
      expect(metrics).toContain('workflow="dev-story"');
      expect(metrics).toContain('workflow="quick-dev"');
      expect(metrics).toContain('le="60000"');
    });
  });

  describe('errorsTotal counter', () => {
    it('increments error count by error type', async () => {
      recordError('retryable');
      recordError('retryable');
      recordError('fatal');

      const metrics = await getMetrics();
      expect(metrics).toContain('bmad_errors_total');
      expect(metrics).toContain('error_type="retryable"');
      expect(metrics).toContain('error_type="fatal"');
    });
  });

  describe('updateStoryMetrics', () => {
    it('updates all story status gauges', async () => {
      updateStoryMetrics({
        total: 10,
        inProgress: 3,
        done: 5,
        failed: 1,
        stalled: 1,
      });

      const metrics = await getMetrics();
      expect(metrics).toContain('bmad_stories_total{status="total"} 10');
      expect(metrics).toContain('bmad_stories_total{status="in_progress"} 3');
      expect(metrics).toContain('bmad_stories_total{status="done"} 5');
      expect(metrics).toContain('bmad_stories_total{status="failed"} 1');
      expect(metrics).toContain('bmad_stories_total{status="stalled"} 1');
    });
  });

  describe('getMetrics', () => {
    it('returns Prometheus format string', async () => {
      const metrics = await getMetrics();

      expect(typeof metrics).toBe('string');
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toContain('bmad_');
    });

    it('includes default metrics', async () => {
      const metrics = await getMetrics();

      expect(metrics).toContain('process_cpu_seconds_total');
      expect(metrics).toContain('process_resident_memory_bytes');
    });
  });

  describe('Prometheus format compliance', () => {
    it('includes HELP and TYPE comments for custom metrics', async () => {
      const metrics = await getMetrics();

      expect(metrics).toContain('# HELP bmad_stories_total');
      expect(metrics).toContain('# TYPE bmad_stories_total gauge');
      expect(metrics).toContain('# HELP bmad_workflow_duration_ms');
      expect(metrics).toContain('# TYPE bmad_workflow_duration_ms histogram');
      expect(metrics).toContain('# HELP bmad_errors_total');
      expect(metrics).toContain('# TYPE bmad_errors_total counter');
    });
  });
});
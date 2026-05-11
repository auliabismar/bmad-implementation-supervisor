import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

export const registry = new Registry();

collectDefaultMetrics({ register: registry });

export const storiesTotal = new Gauge({
  name: 'bmad_stories_total',
  help: 'Total stories by status',
  labelNames: ['status'],
  registers: [registry],
});

export const workflowDuration = new Histogram({
  name: 'bmad_workflow_duration_ms',
  help: 'Workflow duration in milliseconds',
  labelNames: ['workflow'],
  buckets: [1000, 5000, 10000, 30000, 60000, 120000, 300000, 600000],
  registers: [registry],
});

export const errorsTotal = new Counter({
  name: 'bmad_errors_total',
  help: 'Total errors by type',
  labelNames: ['error_type'],
  registers: [registry],
});

export function updateStoryMetrics(stories?: {
  total: number;
  inProgress: number;
  done: number;
  failed: number;
  stalled: number;
}): void {
  const s = stories ?? { total: 0, inProgress: 0, done: 0, failed: 0, stalled: 0 };
  storiesTotal.set({ status: 'total' }, typeof s.total === 'number' ? s.total : 0);
  storiesTotal.set({ status: 'in_progress' }, typeof s.inProgress === 'number' ? s.inProgress : 0);
  storiesTotal.set({ status: 'done' }, typeof s.done === 'number' ? s.done : 0);
  storiesTotal.set({ status: 'failed' }, typeof s.failed === 'number' ? s.failed : 0);
  storiesTotal.set({ status: 'stalled' }, typeof s.stalled === 'number' ? s.stalled : 0);
}

export function recordWorkflowDuration(workflow: string, durationMs: number): void {
  workflowDuration.observe({ workflow }, durationMs);
}

export function recordError(errorType: string): void {
  errorsTotal.inc({ error_type: errorType });
}

export async function getMetrics(): Promise<string> {
  return registry.metrics();
}
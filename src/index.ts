import { getConfig } from './config';
import { startServerWithGracefulShutdown } from './http/server';
import { logger } from './utils/logger';

function maskSecret(value: string): string {
  if (!value || value.length <= 8) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

logger.info('BMAD Supervisor v0.1.0 - Starting...');

try {
  const config = getConfig();

  logger.info({
    msg: 'Configuration loaded',
    project: {
      root: config.project.root,
      sprintStatus: config.project.sprint_status,
      storiesDir: config.project.stories_dir,
    },
    notification: {
      channel: config.notification.channel,
      bot: maskSecret(config.notification.telegram.bot_token),
      chat: maskSecret(config.notification.telegram.chat_id),
    },
    workflows: Object.keys(config.workflows),
    health: {
      port: config.health.port,
      stuckTimeoutMs: config.health.stuck_timeout_ms,
      maxRetries: config.health.max_retries_per_story,
      circuitBreaker: config.health.circuit_breaker_threshold,
    },
    supervisor: {
      pollIntervalMs: config.supervisor.poll_interval_ms,
      concurrentStories: config.supervisor.concurrent_stories,
    },
  });

  startServerWithGracefulShutdown({ port: config.health.port });
  logger.info('BMAD Supervisor initialized successfully');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  logger.fatal({ err: error }, `Failed to load configuration: ${message}`);
  process.exit(1);
}

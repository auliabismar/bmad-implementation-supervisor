import { getConfig } from './config';

function maskSecret(value: string): string {
  if (!value || value.length <= 8) return '****';
  return value.slice(0, 2) + '****' + value.slice(-2);
}

console.log('BMAD Supervisor v0.1.0 - Starting...');

try {
  const config = getConfig();

  console.log('Configuration loaded successfully:');
  console.log(`  Project Root: ${config.project.root}`);
  console.log(`  Sprint Status: ${config.project.sprint_status}`);
  console.log(`  Stories Dir: ${config.project.stories_dir}`);
  console.log(`  Notification Channel: ${config.notification.channel}`);
  console.log(`  Telegram Bot: ${maskSecret(config.notification.telegram.bot_token)}`);
  console.log(`  Telegram Chat: ${maskSecret(config.notification.telegram.chat_id)}`);
  console.log(`  Workflows: ${Object.keys(config.workflows).join(', ')}`);
  console.log(`  Health - Stuck Timeout: ${config.health.stuck_timeout_ms}ms`);
  console.log(`  Health - Max Retries: ${config.health.max_retries_per_story}`);
  console.log(`  Health - Circuit Breaker: ${config.health.circuit_breaker_threshold}`);
  console.log(`  Supervisor - Poll Interval: ${config.supervisor.poll_interval_ms}ms`);
  console.log(`  Supervisor - Concurrent Stories: ${config.supervisor.concurrent_stories}`);
  console.log('BMAD Supervisor initialized successfully.');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = message.replace(/(\/[A-Za-z]:\\)?[^:]+/g, '***');
  console.error('Failed to load configuration:', sanitized);
  process.exit(1);
}
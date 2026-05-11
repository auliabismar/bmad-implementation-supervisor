import pino from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from './paths';

const VALID_LEVELS = ['debug', 'info', 'warn', 'error', 'fatal'] as const;
type LogLevel = (typeof VALID_LEVELS)[number];

function validateLevel(level: string | undefined): LogLevel {
  if (!level) return 'info';
  const lower = level.toLowerCase() as LogLevel;
  if (VALID_LEVELS.includes(lower)) return lower;
  return 'info';
}

const LOG_DIR = resolveProjectPath('logs');
const isDev = process.env.NODE_ENV !== 'production';
const level = validateLevel(process.env.LOG_LEVEL);

function getLogFilePath(): string {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(LOG_DIR, `supervisor-${date}.log`);
}

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

/** Remove log files older than 30 days */
export function cleanOldLogs(): void {
  try {
    if (!fs.existsSync(LOG_DIR)) return;
    const files = fs.readdirSync(LOG_DIR).filter(f => f.startsWith('supervisor-') && f.endsWith('.log'));
    if (files.length <= 30) return;

    const sorted = files.sort();
    const today = `supervisor-${new Date().toISOString().slice(0, 10)}.log`;
    const toDelete = sorted.filter(f => f !== today).slice(0, sorted.length - 30);

    for (const file of toDelete) {
      try {
        fs.unlinkSync(path.join(LOG_DIR, file));
      } catch (err) {
        process.stderr.write(`Failed to delete old log ${file}: ${(err as Error).message}\n`);
      }
    }
  } catch (err) {
    process.stderr.write(`cleanOldLogs error: ${(err as Error).message}\n`);
  }
}

function buildLogger(): pino.Logger {
  ensureLogDir();
  cleanOldLogs();

  const fileDestination = pino.destination({ dest: getLogFilePath(), sync: true });

  const streams: pino.StreamEntry[] = [
    { level, stream: fileDestination },
  ];

  if (isDev) {
    // Dev: pretty-printed to stdout via pino-pretty
    const pretty = require('pino-pretty')({ colorize: true });
    streams.push({ level, stream: pretty });
  } else {
    // Production: JSON to stdout
    streams.push({ level, stream: process.stdout });
  }

  return pino({ level }, pino.multistream(streams));
}

export const logger = buildLogger();

/**
 * Create a child logger with bound structured fields (storyKey, workflow, etc.)
 */
export function createChildLogger(bindings: { storyKey?: string; workflow?: string; [key: string]: unknown }): pino.Logger {
  return logger.child(bindings);
}

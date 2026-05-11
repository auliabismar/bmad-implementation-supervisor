import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath, normalizePath } from './utils/paths';

export const AgentConfigSchema = z.object({
  harness: z.enum(['codex', 'opencode', 'commandcode']),
  model: z.string(),
  timeout_ms: z.number().positive(),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

export const ModelPoolEntrySchema = z.object({
  harness: z.enum(['codex', 'opencode', 'commandcode']),
  model: z.string(),
});

export type ModelPoolEntry = z.infer<typeof ModelPoolEntrySchema>;

const NonEmptyString = z.string().min(1, 'String cannot be empty');

const SupervisorConfigSchema = z.object({
  project: z.object({
    root: z.string(),
    sprint_status: z.string(),
    stories_dir: z.string(),
  }),
  notification: z.object({
    channel: z.literal('telegram'),
    telegram: z.object({
      bot_token: NonEmptyString,
      chat_id: NonEmptyString,
    }),
  }),
  workflows: z.object({
    create_story: AgentConfigSchema,
    dev_story: AgentConfigSchema,
    code_review: AgentConfigSchema,
  }),
  model_pool: z.object({
    create_story: z.array(ModelPoolEntrySchema),
    dev_story: z.array(ModelPoolEntrySchema),
    code_review: z.array(ModelPoolEntrySchema),
  }),
  health: z.object({
    port: z.number().int().positive().default(3000),
    stuck_timeout_ms: z.number().positive(),
    max_retries_per_story: z.number().int().positive(),
    circuit_breaker_threshold: z.number().int().positive(),
  }),
  supervisor: z.object({
    poll_interval_ms: z.number().positive(),
    concurrent_stories: z.number().int().positive(),
  }),
});

function substituteEnvVars(yamlContent: string): string {
  return yamlContent.replace(/\$\{([^}]+)\}/g, (match, expr) => {
    const [envVar, defaultValue] = expr.split(':-');
    const value = process.env[envVar];
    if (value !== undefined) {
      return value;
    }
    if (defaultValue !== undefined) {
      return defaultValue;
    }
    return '';
  });
}

function formatZodError(error: z.ZodError): string {
  const lines: string[] = ['Config validation failed:'];
  for (const issue of error.issues) {
    const path = issue.path.join('.');
    if (issue.code === 'invalid_type') {
      if (issue.received === 'undefined') {
        lines.push(`- ${path}: Required field missing`);
      } else {
        lines.push(`- ${path}: Expected ${issue.expected}, got ${issue.received}`);
      }
    } else {
      lines.push(`- ${path}: ${issue.message}`);
    }
  }
  return lines.join('\n');
}

let configInstance: SupervisorConfig | null = null;
let configLoading = false;

export type SupervisorConfig = z.infer<typeof SupervisorConfigSchema>;

export function loadConfig(configPath?: string): SupervisorConfig {
  const configFilePath = configPath
    ? path.resolve(configPath)
    : resolveProjectPath('supervisor.config.yaml');

  if (!fs.existsSync(configFilePath)) {
    throw new Error(`Config file not found: ${normalizePath(configFilePath)}`);
  }

  const rawYaml = fs.readFileSync(configFilePath, 'utf-8');
  const resolvedYaml = substituteEnvVars(rawYaml);

  const yaml = require('yaml');
  const parsed = yaml.parse(resolvedYaml);

  if (parsed === null) {
    throw new Error('Config file is empty or invalid');
  }

  const result = SupervisorConfigSchema.safeParse(parsed);

  if (!result.success) {
    throw new Error(formatZodError(result.error));
  }

  return result.data;
}

export function getConfig(): SupervisorConfig {
  if (configInstance) {
    return configInstance;
  }
  if (configLoading) {
    throw new Error('Config is already being loaded');
  }
  configLoading = true;
  try {
    configInstance = loadConfig();
    return configInstance;
  } finally {
    configLoading = false;
  }
}

export function resetConfig(): void {
  configInstance = null;
}

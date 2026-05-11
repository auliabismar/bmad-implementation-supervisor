import { describe, it, expect, beforeEach } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { loadConfig, resetConfig } from './config';

describe('Config Loading', () => {
  let tempDir: string;

  beforeEach(() => {
    resetConfig();
  });

  function createTempConfig(content: string): string {
    const configPath = path.join(tempDir, 'test.config.yaml');
    fs.writeFileSync(configPath, content);
    return configPath;
  }

  it('loads valid config from yaml', () => {
    const validConfig = `project:
  root: /test/project
  sprint_status: _bmad-output/sprint-status.yaml
  stories_dir: _bmad-output/implementation-artifacts

notification:
  channel: telegram
  telegram:
    bot_token: test_token
    chat_id: test_chat

workflows:
  create_story:
    harness: codex
    model: gpt-5.4
    timeout_ms: 300000
  dev_story:
    harness: codex
    model: o3
    timeout_ms: 1800000
  code_review:
    harness: opencode
    model: anthropic/claude-sonnet-4-6
    timeout_ms: 600000

model_pool:
  create_story:
    - { harness: codex, model: gpt-5.4 }
  dev_story:
    - { harness: codex, model: o3 }
  code_review:
    - { harness: opencode, model: anthropic/claude-sonnet-4-6 }

health:
  stuck_timeout_ms: 600000
  max_retries_per_story: 3
  circuit_breaker_threshold: 3

supervisor:
  poll_interval_ms: 5000
  concurrent_stories: 1`;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
    const configPath = createTempConfig(validConfig);
    const config = loadConfig(configPath);

    expect(config.project.root).toBe('/test/project');
    expect(config.notification.channel).toBe('telegram');
    expect(config.workflows.create_story.model).toBe('gpt-5.4');
    expect(config.health.port).toBe(3000);
    expect(config.health.circuit_breaker_threshold).toBe(3);
    expect(config.supervisor.concurrent_stories).toBe(1);

    fs.rmSync(tempDir, { recursive: true });
  });

  it('throws clear error for missing required field', () => {
    const missingFieldConfig = `project:
  root: /test
  stories_dir: _bmad-output/implementation-artifacts

notification:
  channel: telegram
  telegram:
    bot_token: token
    chat_id: chat

workflows:
  create_story:
    harness: codex
    model: gpt-5.4
    timeout_ms: 300000
  dev_story:
    harness: codex
    model: o3
    timeout_ms: 1800000
  code_review:
    harness: opencode
    model: anthropic/claude-sonnet-4-6
    timeout_ms: 600000

model_pool:
  create_story: []
  dev_story: []
  code_review: []

health:
  stuck_timeout_ms: 600000
  max_retries_per_story: 3
  circuit_breaker_threshold: 3

supervisor:
  poll_interval_ms: 5000
  concurrent_stories: 1`;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
    const configPath = createTempConfig(missingFieldConfig);

    expect(() => loadConfig(configPath)).toThrow(/sprint_status.*Required field missing/i);
    fs.rmSync(tempDir, { recursive: true });
  });

  it('throws clear error for invalid field types', () => {
    const invalidTypeConfig = `project:
  root: /test
  sprint_status: _bmad-output/sprint-status.yaml
  stories_dir: _bmad-output/implementation-artifacts

notification:
  channel: telegram
  telegram:
    bot_token: token
    chat_id: chat

workflows:
  create_story:
    harness: codex
    model: gpt-5.4
    timeout_ms: 300000
  dev_story:
    harness: codex
    model: o3
    timeout_ms: 1800000
  code_review:
    harness: opencode
    model: anthropic/claude-sonnet-4-6
    timeout_ms: 600000

model_pool:
  create_story: []
  dev_story: []
  code_review: []

health:
  stuck_timeout_ms: 600000
  max_retries_per_story: "not-a-number"
  circuit_breaker_threshold: 3

supervisor:
  poll_interval_ms: 5000
  concurrent_stories: 1`;
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
    const configPath = createTempConfig(invalidTypeConfig);

    expect(() => loadConfig(configPath)).toThrow(/max_retries_per_story.*Expected number.*got string/i);
    fs.rmSync(tempDir, { recursive: true });
  });

  it('substitutes environment variables', () => {
    const envVarConfig = 'project:\n  root: /test\n  sprint_status: _bmad-output/sprint-status.yaml\n  stories_dir: _bmad-output/implementation-artifacts\n\nnotification:\n  channel: telegram\n  telegram:\n    bot_token: "${TEST_BOT_TOKEN}"\n    chat_id: "${TEST_CHAT_ID}"\n\nworkflows:\n  create_story:\n    harness: codex\n    model: gpt-5.4\n    timeout_ms: 300000\n  dev_story:\n    harness: codex\n    model: o3\n    timeout_ms: 1800000\n  code_review:\n    harness: opencode\n    model: anthropic/claude-sonnet-4-6\n    timeout_ms: 600000\n\nmodel_pool:\n  create_story: []\n  dev_story: []\n  code_review: []\n\nhealth:\n  stuck_timeout_ms: 600000\n  max_retries_per_story: 3\n  circuit_breaker_threshold: 3\n\nsupervisor:\n  poll_interval_ms: 5000\n  concurrent_stories: 1';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
    const configPath = createTempConfig(envVarConfig);

    process.env.TEST_BOT_TOKEN = 'env_bot_token_123';
    process.env.TEST_CHAT_ID = 'env_chat_id_456';

    const config = loadConfig(configPath);
    expect(config.notification.telegram.bot_token).toBe('env_bot_token_123');
    expect(config.notification.telegram.chat_id).toBe('env_chat_id_456');

    delete process.env.TEST_BOT_TOKEN;
    delete process.env.TEST_CHAT_ID;
    fs.rmSync(tempDir, { recursive: true });
  });

  it('supports default values in env vars', () => {
    const defaultValueConfig = 'project:\n  root: /test\n  sprint_status: _bmad-output/sprint-status.yaml\n  stories_dir: _bmad-output/implementation-artifacts\n\nnotification:\n  channel: telegram\n  telegram:\n    bot_token: "${NON_EXISTENT_VAR:-default_bot_token}"\n    chat_id: "${ANOTHER_NON_EXISTENT:-default_chat_id}"\n\nworkflows:\n  create_story:\n    harness: codex\n    model: gpt-5.4\n    timeout_ms: 300000\n  dev_story:\n    harness: codex\n    model: o3\n    timeout_ms: 1800000\n  code_review:\n    harness: opencode\n    model: anthropic/claude-sonnet-4-6\n    timeout_ms: 600000\n\nmodel_pool:\n  create_story: []\n  dev_story: []\n  code_review: []\n\nhealth:\n  stuck_timeout_ms: 600000\n  max_retries_per_story: 3\n  circuit_breaker_threshold: 3\n\nsupervisor:\n  poll_interval_ms: 5000\n  concurrent_stories: 1';
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-test-'));
    const configPath = createTempConfig(defaultValueConfig);

    const config = loadConfig(configPath);
    expect(config.notification.telegram.bot_token).toBe('default_bot_token');
    expect(config.notification.telegram.chat_id).toBe('default_chat_id');

    fs.rmSync(tempDir, { recursive: true });
  });

  it('throws error when config file not found', () => {
    expect(() => loadConfig('/nonexistent/path/config.yaml')).toThrow(/Config file not found/i);
  });
});

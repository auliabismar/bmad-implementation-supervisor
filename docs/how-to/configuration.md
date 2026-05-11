# Configuration Guide

This guide shows you how to configure the BMAD Implementation Supervisor.

## Configuration File

The supervisor reads from `supervisor.config.yaml` in the project root.

## Basic Configuration

```yaml
project:
  root: .
  sprint_status: _bmad-output/implementation-artifacts/sprint-status.yaml
  stories_dir: _bmad-output/implementation-artifacts

notification:
  channel: telegram
  telegram:
    bot_token: "${TELEGRAM_BOT_TOKEN}"
    chat_id: "${TELEGRAM_CHAT_ID}"

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
```

## Agent Harness Options

The supervisor supports three agent harnesses:

| Harness | Description | Models |
|---------|-------------|--------|
| `codex` | Codex agent | gpt-5.4, o3, o4-mini |
| `opencode` | OpenCode agent | anthropic/claude-sonnet-4-6, google/gemini-2.5-pro |
| `commandcode` | CommandCode agent | openai/o4-mini |

## Model Pool Configuration

Configure fallback chain for each workflow:

```yaml
model_pool:
  create_story:
    - { harness: codex, model: gpt-5.4 }
    - { harness: opencode, model: openai/gpt-5.4 }
    - { harness: commandcode, model: openai/o4-mini }

  dev_story:
    - { harness: codex, model: o3 }
    - { harness: opencode, model: google/gemini-2.5-pro }
    - { harness: commandcode, model: anthropic/claude-sonnet-4-6 }

  code_review:
    - { harness: codex, model: anthropic/claude-sonnet-4-6 }
    - { harness: opencode, model: anthropic/claude-sonnet-4-6 }
    - { harness: commandcode, model: openai/o4-mini }
```

## Health Settings

```yaml
health:
  port: 3000
  stuck_timeout_ms: 600000
  max_retries_per_story: 3
  circuit_breaker_threshold: 3
```

| Setting | Description |
|---------|-------------|
| `port` | HTTP health endpoint port |
| `stuck_timeout_ms` | Time before marking story as stalled |
| `max_retries_per_story` | Max attempts per story |
| `circuit_breaker_threshold` | Failures before circuit opens |

## Supervisor Settings

```yaml
supervisor:
  poll_interval_ms: 5000
  concurrent_stories: 1
```

| Setting | Description |
|---------|-------------|
| `poll_interval_ms` | How often to check for new stories |
| `concurrent_stories` | Max concurrent stories (1 = sequential) |

## Environment Variables

Use `${VAR_NAME}` syntax in config for environment variables:

```yaml
telegram:
  bot_token: "${TELEGRAM_BOT_TOKEN}"
  chat_id: "${TELEGRAM_CHAT_ID}"
```

Set defaults with `:-`:

```yaml
bot_token: "${TELEGRAM_BOT_TOKEN:-default_token}"
```

## Validation

Run type check to validate config:

```bash
bun run typecheck
```

## Next Steps

- [Error Recovery](./error-recovery.md) - Handle failures
- [Health Monitoring](./health-monitoring.md) - Monitor status

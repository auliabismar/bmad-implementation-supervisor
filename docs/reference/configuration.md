# Configuration Reference

Complete reference for `supervisor.config.yaml` configuration options.

## Configuration Schema

```yaml
project:
  root: string                    # Project root directory (default: ".")
  sprint_status: string           # Path to sprint-status.yaml
  stories_dir: string             # Directory containing story files

notification:
  channel: "telegram"             # Notification channel (only telegram supported)
  telegram:
    bot_token: string             # Telegram bot token (required if channel=telegram)
    chat_id: string               # Telegram chat ID (required if channel=telegram)

workflows:
  create_story:
    harness: "codex" | "opencode" | "commandcode"
    model: string                 # Model identifier
    timeout_ms: number            # Timeout in milliseconds
  dev_story:
    harness: "codex" | "opencode" | "commandcode"
    model: string
    timeout_ms: number
  code_review:
    harness: "codex" | "opencode" | "commandcode"
    model: string
    timeout_ms: number

model_pool:
  create_story:
    - harness: "codex" | "opencode" | "commandcode"
      model: string
    - harness: "codex" | "opencode" | "commandcode"
      model: string
  dev_story:
    - harness: "codex" | "opencode" | "commandcode"
      model: string
  code_review:
    - harness: "codex" | "opencode" | "commandcode"
      model: string

health:
  port: number                    # HTTP server port (default: 3000)
  stuck_timeout_ms: number        # Stall detection timeout (default: 600000)
  max_retries_per_story: number   # Max retry attempts (default: 3)
  circuit_breaker_threshold: number  # Failures before circuit opens (default: 3)

supervisor:
  poll_interval_ms: number        # Story polling interval (default: 5000)
  concurrent_stories: number      # Max concurrent stories (default: 1)
```

## Required Fields

The following fields must be specified:

- `project.root`
- `project.sprint_status`
- `project.stories_dir`
- `notification.channel`
- `notification.telegram.bot_token` (if channel=telegram)
- `notification.telegram.chat_id` (if channel=telegram)
- `workflows.create_story.harness`
- `workflows.create_story.model`
- `workflows.create_story.timeout_ms`
- `workflows.dev_story.harness`
- `workflows.dev_story.model`
- `workflows.dev_story.timeout_ms`
- `workflows.code_review.harness`
- `workflows.code_review.model`
- `workflows.code_review.timeout_ms`

## Environment Variable Substitution

Use `${VAR_NAME}` syntax for environment variables:

```yaml
bot_token: "${TELEGRAM_BOT_TOKEN}"
chat_id: "${TELEGRAM_CHAT_ID}"
```

Provide defaults with `:-`:

```yaml
bot_token: "${TELEGRAM_BOT_TOKEN:-default_token}"
```

## Example Configuration

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

health:
  port: 3000
  stuck_timeout_ms: 600000
  max_retries_per_story: 3
  circuit_breaker_threshold: 3

supervisor:
  poll_interval_ms: 5000
  concurrent_stories: 1
```

## Validation

Run type check to validate configuration:

```bash
bun run typecheck
```

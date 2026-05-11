# Installation Tutorial

This tutorial walks you through installing and running the BMAD Implementation Supervisor for the first time.

## Prerequisites

- **Bun runtime** (v1.0 or higher) - [Install Bun](https://bun.sh)
- **At least one agent harness** - Codex, OpenCode, or CommandCode
- **Telegram bot token** (optional, for notifications)

## Step 1: Clone the Repository

```bash
git clone <repository-url>
cd bmad-implementation-supervisor
```

## Step 2: Install Dependencies

```bash
bun install
```

This installs all required dependencies including:
- `grammy` - Telegram bot framework
- `sql.js` - SQLite database
- `yaml` - YAML parsing
- `zod` - Configuration validation
- `pino` - Logging

## Step 3: Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your Telegram bot credentials:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

> **Note**: Telegram configuration is optional. The supervisor will run without it.

## Step 4: Configure Supervisor

Edit `supervisor.config.yaml` to customize agent harnesses and models:

```yaml
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

## Step 5: Verify Installation

Run the type checker:

```bash
bun run typecheck
```

## Step 6: Start the Supervisor

```bash
bun run start
```

You should see:

```
[Supervisor] BMAD Supervisor v0.1.0 - Starting...
[Supervisor] Configuration loaded
[Supervisor] BMAD Supervisor initialized successfully
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Config file not found | Ensure `supervisor.config.yaml` exists in project root |
| Config validation failed | Check YAML syntax and required fields |
| Harness not found | Ensure agent harness is installed in PATH |
| Bot token invalid | Verify `TELEGRAM_BOT_TOKEN` format |

## Next Steps

- [First Workflow Tutorial](./first-workflow.md) - Run your first story
- [Configuration Guide](../how-to/configuration.md) - Customize settings

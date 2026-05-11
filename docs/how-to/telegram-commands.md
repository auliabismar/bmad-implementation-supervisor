# Telegram Commands Guide

This guide documents all available Telegram bot commands for the BMAD Implementation Supervisor.

## Prerequisites

Ensure Telegram is configured in `supervisor.config.yaml`:

```yaml
notification:
  channel: telegram
  telegram:
    bot_token: "${TELEGRAM_BOT_TOKEN}"
    chat_id: "${TELEGRAM_CHAT_ID}"
```

## Available Commands

### /status

Show current sprint status.

**Response:**
```
📊 Sprint Status

Stories: 5 total
  • In Progress: 2
  • Review: 1
  • Done: 2

Current Story: story-42
Status: in-progress
Workflow: dev-story
```

### /pause

Pause all workflows.

**Response:**
```
⏸️ Supervisor paused
```

### /resume

Resume paused workflows.

**Response:**
```
▶️ Supervisor resumed
```

### /retry

Retry the current story.

**Response:**
```
🔄 Retrying story: story-42
```

### /skip

Skip the current story.

**Response:**
```
⏭️ Skipping story: story-42
```

### /abort

Abort all workflows and exit.

**Response:**
```
🛑 Aborting all workflows
```

### /health

Show supervisor health status.

**Response:**
```
🏥 Supervisor Health

Status: healthy
Uptime: 1h 23m
Stories: 5 total
  • In Progress: 2
  • Done: 2
  • Failed: 1

Circuit Breaker: closed
Last Error: none
```

### /input <text>

Forward input to the agent.

**Usage:**
```
/input Please proceed with the implementation
```

**Response:**
```
✅ Input forwarded to agent
```

## Inline Keyboard Commands

The bot also supports inline keyboard buttons for quick actions:
- Resume/Pause toggle
- Retry current story
- Skip current story
- View status

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Bot not responding | Check `TELEGRAM_BOT_TOKEN` is correct |
| Commands not working | Ensure bot is started in Telegram |
| No notifications | Check `TELEGRAM_CHAT_ID` is correct |

## Next Steps

- [Configuration](./configuration.md) - Customize settings
- [Error Recovery](./error-recovery.md) - Handle failures

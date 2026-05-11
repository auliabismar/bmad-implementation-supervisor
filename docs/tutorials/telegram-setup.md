# Telegram Setup Tutorial

This tutorial shows you how to configure Telegram notifications for the BMAD Implementation Supervisor.

## Why Telegram?

Telegram provides real-time updates about:
- Story workflow progress
- Errors and failures
- Human input requests
- Health status

## Step 1: Create a Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` command
3. Follow the prompts to create your bot
4. Copy the bot token (looks like `123456:ABC-DEF...`)

## Step 2: Get Your Chat ID

1. Search for your bot in Telegram
2. Send any message to the bot
3. Visit: `https://api.telegram.org/bot<TOKEN>/getUpdates`
4. Find your `chat.id` in the response

## Step 3: Configure Environment

Create or edit `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_CHAT_ID=your_chat_id_here
```

## Step 4: Update Supervisor Config

Edit `supervisor.config.yaml`:

```yaml
notification:
  channel: telegram
  telegram:
    bot_token: "${TELEGRAM_BOT_TOKEN}"
    chat_id: "${TELEGRAM_CHAT_ID}"
```

## Step 5: Restart Supervisor

```bash
# Stop supervisor (Ctrl+C)
# Then restart
bun run start
```

## Step 6: Test Notifications

Send a test message to your bot in Telegram. You should receive:
- Supervisor startup notification
- Story workflow updates
- Error alerts

## Telegram Commands

Once configured, use these commands in your chat with the bot:

| Command | Description |
|---------|-------------|
| `/status` | Current sprint status |
| `/pause` | Pause workflows |
| `/resume` | Resume workflows |
| `/retry` | Retry current story |
| `/skip` | Skip current story |
| `/abort` | Abort all and exit |
| `/health` | Supervisor health |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No notifications | Verify token and chat ID in `.env` |
| Bot not responding | Check bot is started and reachable |
| Messages delayed | Check network connectivity |

## Next Steps

- [First Workflow](./first-workflow.md) - Run stories
- [Configuration](../how-to/configuration.md) - Customize settings

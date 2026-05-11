# CLI Commands Reference

Command-line interface commands for the BMAD Implementation Supervisor.

## Package Scripts

### `bun run start`

Start the supervisor.

```bash
bun run start
```

### `bun run dev`

Start with hot reload for development.

```bash
bun run dev
```

### `bun run typecheck`

Run TypeScript type checking.

```bash
bun run typecheck
```

### `bun run test`

Run tests.

```bash
bun run test
```

### `bun run build`

Build for production.

```bash
bun run build
```

## Supervisor Commands

### start

Start the supervisor with custom config.

```bash
supervisor start --config supervisor-config.yaml
```

**Options:**
- `--config` - Path to config file (default: `supervisor.config.yaml`)

### pause

Pause all workflows.

```bash
supervisor pause
```

### resume

Resume paused workflows.

```bash
supervisor resume
```

### status

Show current sprint status.

```bash
supervisor status
```

### health

Show supervisor health.

```bash
supervisor health
```

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Configuration error |
| 2 | Database error |
| 3 | Agent harness error |
| 4 | Telegram error |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | Environment (development/production) |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token |
| `TELEGRAM_CHAT_ID` | Telegram chat ID |

## Next Steps

- [API Reference](./api.md) - HTTP API
- [Configuration](./configuration.md) - Config options

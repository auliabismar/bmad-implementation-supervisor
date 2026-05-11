# Error Recovery Guide

This guide explains how the BMAD Implementation Supervisor handles errors and how to recover from failures.

## Error Types

The supervisor classifies errors into four categories:

| Type | Description | Recovery Action |
|------|-------------|-----------------|
| `RETRYABLE` | Transient errors (rate limit, timeout) | Retry with exponential backoff |
| `RECOVERABLE` | Model/harness issues (not found) | Switch to next model in pool |
| `FATAL` | System errors (auth failure, permission denied) | Pause story, notify human |
| `HUMAN_INPUT` | Agent requires confirmation | Wait for human response |

## Automatic Recovery

### Retryable Errors

When a rate limit or timeout occurs:
1. Wait 1 second, then retry
2. If fails again, wait 2 seconds
3. Continue doubling until 60 seconds max
4. After 3 retries, switch to next model in pool

### Recoverable Errors

When a model or harness is not found:
1. Log the error
2. Automatically switch to next model in `model_pool`
3. Continue until successful or pool exhausted

### Fatal Errors

When a fatal error occurs:
1. Pause the story
2. Send Telegram notification
3. Wait for human intervention

## Manual Recovery

### Retry a Story

**Via Telegram bot:**
```
/retry
```

**Via HTTP API:**
```bash
curl -X POST http://localhost:3000/control/retry
```

### Skip a Story

**Via Telegram bot:**
```
/skip
```

**Via HTTP API:**
```bash
curl -X POST http://localhost:3000/control/skip
```

### Pause Workflows

**Via Telegram bot:**
```
/pause
```

**Via HTTP API:**
```bash
curl -X POST http://localhost:3000/control/pause
```

### Resume Workflows

**Via Telegram bot:**
```
/resume
```

**Via HTTP API:**
```bash
curl -X POST http://localhost:3000/control/resume
```

### Abort All

**Via Telegram bot:**
```
/abort
```

## Circuit Breaker

The supervisor implements a circuit breaker pattern:

1. After 3 consecutive failures, the circuit opens
2. All workflows pause
3. Telegram notification sent
4. Wait for human intervention

## Monitoring Errors

Check the error log via HTTP API:

```bash
curl http://localhost:3000/stories
```

Or view SQLite database:

```bash
sqlite3 .bmad-supervisor.db "SELECT * FROM errors ORDER BY created_at DESC LIMIT 10;"
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| Rate limit | Wait or switch to model with higher quota |
| Model not found | Check model name in config |
| Auth failure | Verify API keys in environment |
| Permission denied | Check file system permissions |

## Next Steps

- [Configuration](./configuration.md) - Customize error handling
- [Health Monitoring](./health-monitoring.md) - Monitor supervisor

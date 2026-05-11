# Health Monitoring Guide

This guide shows how to monitor the BMAD Implementation Supervisor's health and performance.

## HTTP API Endpoints

The supervisor exposes a REST API on port 3000 (configurable).

### GET /health

Returns supervisor health status.

**Response:**
```json
{
  "status": "healthy",
  "uptime": 3600000,
  "stories": {
    "total": 10,
    "inProgress": 2,
    "done": 5,
    "failed": 1,
    "stalled": 0
  },
  "lastError": null,
  "circuitBreaker": "closed"
}
```

### GET /metrics

Returns Prometheus-compatible metrics.

**Response:**
```
# HELP bmad_stories_total Total stories
# TYPE bmad_stories_total gauge
bmad_stories_total{status="backlog"} 3
bmad_stories_total{status="ready-for-dev"} 2
bmad_stories_total{status="in-progress"} 2
bmad_stories_total{status="review"} 1
bmad_stories_total{status="done"} 5
bmad_stories_total{status="failed"} 1

# HELP bmad_workflow_duration_ms Workflow duration
# TYPE bmad_workflow_duration_ms histogram
bmad_workflow_duration_ms_bucket{workflow="create_story",le="60000"} 5
bmad_workflow_duration_ms_bucket{workflow="create_story",le="120000"} 8
bmad_workflow_duration_ms_bucket{workflow="create_story",le="+Inf"} 10

# HELP bmad_errors_total Error count by type
# TYPE bmad_errors_total counter
bmad_errors_total{type="retryable"} 3
bmad_errors_total{type="recoverable"} 2
bmad_errors_total{type="fatal"} 1
```

### GET /stories

List all stories.

**Response:**
```json
{
  "stories": [
    {
      "key": "story-1",
      "epicNum": 1,
      "title": "Implement login",
      "status": "done",
      "currentWorkflow": "code-review"
    }
  ]
}
```

### GET /stories/:key

Get details for a specific story.

**Response:**
```json
{
  "key": "story-1",
  "epicNum": 1,
  "title": "Implement login",
  "status": "done",
  "currentWorkflow": "code-review",
  "history": [
    {"status": "backlog", "timestamp": "2024-01-01T10:00:00Z"},
    {"status": "ready-for-dev", "timestamp": "2024-01-01T10:05:00Z"},
    {"status": "in-progress", "timestamp": "2024-01-01T10:10:00Z"},
    {"status": "done", "timestamp": "2024-01-01T10:30:00Z"}
  ]
}
```

### POST /control/pause

Pause workflows.

**Response:**
```json
{"status": "paused"}
```

### POST /control/resume

Resume workflows.

**Response:**
```json
{"status": "running"}
```

## Stall Detection

The supervisor automatically detects stalled workflows:

- **Timeout:** 10 minutes (configurable via `health.stuck_timeout_ms`)
- **Action:** Send Telegram notification, mark story as stalled

## Circuit Breaker

The circuit breaker opens after configurable failures:

```yaml
health:
  circuit_breaker_threshold: 3
```

When open:
- All workflows pause
- Telegram notification sent
- Requires manual intervention to resume

## Logging

The supervisor uses Pino for structured logging:

```bash
# View logs
bun run dev

# Or check log files
cat logs/supervisor.log
```

## Next Steps

- [Configuration](./configuration.md) - Customize health settings
- [Error Recovery](./error-recovery.md) - Handle failures

# API Reference

HTTP API endpoints for the BMAD Implementation Supervisor.

## Base URL

```
http://localhost:3000
```

Port is configurable via `health.port` in `supervisor.config.yaml`.

## Endpoints

### GET /health

Returns supervisor health status.

**Response:**
```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "uptime": number,
  "stories": {
    "total": number,
    "inProgress": number,
    "done": number,
    "failed": number,
    "stalled": number
  },
  "lastError": string | null,
  "circuitBreaker": "open" | "closed" | "half-open"
}
```

### GET /metrics

Returns Prometheus-compatible metrics.

**Response:**
```
# HELP bmad_stories_total Total stories by status
# TYPE bmad_stories_total gauge
bmad_stories_total{status="backlog"} 3
bmad_stories_total{status="ready-for-dev"} 2
...

# HELP bmad_workflow_duration_ms Workflow duration histogram
# TYPE bmad_workflow_duration_ms histogram
bmad_workflow_duration_ms_bucket{workflow="create_story",le="60000"} 5
...

# HELP bmad_errors_total Error count by type
# TYPE bmad_errors_total counter
bmad_errors_total{type="retryable"} 3
...
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

**Path Parameters:**
- `key` - Story key (e.g., `story-1`)

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
    {"status": "ready-for-dev", "timestamp": "2024-01-01T10:05:00Z"}
  ]
}
```

### POST /control/pause

Pause all workflows.

**Response:**
```json
{"status": "paused"}
```

### POST /control/resume

Resume paused workflows.

**Response:**
```json
{"status": "running"}
```

### POST /control/retry

Retry the current story.

**Response:**
```json
{"status": "retrying", "story": "story-1"}
```

### POST /control/skip

Skip the current story.

**Response:**
```json
{"status": "skipped", "story": "story-1"}
```

### POST /control/abort

Abort all workflows and exit.

**Response:**
```json
{"status": "aborting"}
```

## Error Responses

### 400 Bad Request

```json
{
  "error": "Invalid request",
  "message": "Story not found"
}
```

### 500 Internal Server Error

```json
{
  "error": "Internal error",
  "message": "Database connection failed"
}
```

## Authentication

No authentication required. In production, use a reverse proxy (e.g., nginx) with auth.

## Next Steps

- [Configuration](./configuration.md) - Configure API port
- [CLI Commands](./cli.md) - CLI reference

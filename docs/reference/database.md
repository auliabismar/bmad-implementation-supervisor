# Database Schema Reference

SQLite database schema for the BMAD Implementation Supervisor.

## Database Location

Default: `.bmad-supervisor.db` in project root

## Tables

### checkpoints

Stores checkpoint data for story recovery.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Unique ID |
| `story_key` | TEXT NOT NULL | Story identifier |
| `workflow` | TEXT NOT NULL | Workflow type |
| `status` | TEXT NOT NULL | Story status |
| `attempt` | INTEGER DEFAULT 1 | Attempt number |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | Timestamp |

### errors

Stores error log entries.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Unique ID |
| `story_key` | TEXT | Story identifier (nullable) |
| `workflow` | TEXT | Workflow type (nullable) |
| `error_type` | TEXT NOT NULL | Error classification |
| `error_message` | TEXT | Error message |
| `stack_trace` | TEXT | Stack trace (nullable) |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | Timestamp |

### notifications

Stores notification queue entries.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Unique ID |
| `story_key` | TEXT | Story identifier (nullable) |
| `event_type` | TEXT NOT NULL | Event type |
| `message` | TEXT NOT NULL | Notification message |
| `priority` | INTEGER DEFAULT 2 | Priority (1-5) |
| `sent` | INTEGER DEFAULT 0 | Sent flag (0/1) |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | Timestamp |

### invocations

Stores agent invocation history.

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | Unique ID |
| `story_key` | TEXT | Story identifier |
| `workflow` | TEXT | Workflow type |
| `harness` | TEXT NOT NULL | Agent harness |
| `model` | TEXT NOT NULL | Model name |
| `exit_code` | INTEGER | Exit code |
| `duration_ms` | INTEGER | Duration in milliseconds |
| `success` | INTEGER NOT NULL | Success flag (0/1) |
| `created_at` | DATETIME DEFAULT CURRENT_TIMESTAMP | Timestamp |

## Queries

### Get all errors

```sql
SELECT * FROM errors ORDER BY created_at DESC LIMIT 10;
```

### Get story history

```sql
SELECT * FROM checkpoints 
WHERE story_key = 'story-1' 
ORDER BY created_at DESC;
```

### Get failed invocations

```sql
SELECT * FROM invocations 
WHERE success = 0 
ORDER BY created_at DESC;
```

### Get pending notifications

```sql
SELECT * FROM notifications 
WHERE sent = 0 
ORDER BY priority DESC, created_at ASC;
```

## Migration

Database is created automatically on first run. Schema changes are handled via versioning.

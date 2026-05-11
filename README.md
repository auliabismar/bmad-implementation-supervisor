# BMAD Implementation Supervisor

Automates the Implementation Phase (Phase 4) of the BMAD Method. Orchestrates create-story → dev-story → code-review workflows for each story in sprint-status.yaml, notifies via Telegram, and recovers from errors automatically.

## Features

- **Automated Workflow Orchestration** - Runs BMAD skills (create-story, dev-story, code-review) sequentially
- **Multi-Harness Support** - Invokes Codex, OpenCode, or CommandCode with automatic fallback
- **Error Recovery** - Automatic retry with exponential backoff, circuit breaker, human escalation
- **SQLite Checkpointing** - Survives restarts, resumes from exact position
- **Telegram Notifications** - Real-time status updates with inline keyboard commands
- **Stall Detection** - Alerts when no progress for 10 minutes
- **Git Automation** - Branch-per-story, auto-commit, squash-merge to main

## Prerequisites

- [Bun](https://bun.sh) runtime
- Telegram bot token
- At least one agent harness: Codex, OpenCode, or CommandCode

## Setup

```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your Telegram bot token and chat ID
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID |
| `TELEGRAM_API_ID` | Telegram API ID (if using session-based bot) |
| `TELEGRAM_API_HASH` | Telegram API hash |

## Configuration

Edit `supervisor.config.yaml` to set:
- Project paths (root, sprint-status, stories directory)
- Agent harness and model for each workflow
- Model pool for fallback chain
- Health settings (stall timeout, circuit breaker threshold)

## Usage

```bash
# Start supervisor
bun run start

# Development with hot reload
bun run dev

# Type checking
bun run typecheck
```

### Telegram Commands

| Command | Description |
|----------|-------------|
| `/status` | Show current sprint status |
| `/pause` | Pause all workflows |
| `/resume` | Resume paused workflows |
| `/retry` | Retry current story |
| `/skip` | Skip current story |
| `/abort` | Abort all and exit |
| `/input <text>` | Forward input to agent |
| `/health` | Show supervisor health |

### CLI Commands

```bash
supervisor start --config supervisor-config.yaml
supervisor pause
supervisor resume
supervisor status
supervisor health
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Supervisor (Orchestrator)                │
├─────────────────────────────────────────────────────────────┤
│  AgentInvoker   │  ErrorHandler   │  NotificationMgr         │
│  - Codex       │  - Classifier  │  - Telegram              │
│  - OpenCode    │  - Retry       │  - Queue                 │
│  - CommandCode │  - Circuit Brk │                          │
├─────────────────────────────────────────────────────────────┤
│  HealthMonitor │  GitOps        │  StateStore (SQLite)    │
│  - Stall detect│  - Branch      │  - Checkpoint            │
│  - Timeout     │  - Commit      │  - Recovery              │
│                │  - Merge       │                          │
└─────────────────────────────────────────────────────────────┘
```

### Components

| Component | Responsibility |
|-----------|----------------|
| **Supervisor** | State machine, workflow queue, checkpoint coordination |
| **AgentInvoker** | Execute CLI commands, parse output |
| **ErrorHandler** | Classify errors, determine recovery action |
| **NotificationMgr** | Send Telegram messages, handle commands |
| **HealthMonitor** | Detect stalls, monitor file changes |
| **GitOps** | Branch, commit, merge operations |
| **StateStore** | SQLite persistence, checkpoint recovery |

## Story Lifecycle

```
backlog → ready-for-dev → in-progress → review → done
                 ↑                           │
                 |___________________________| (if changes requested)
```

## Error Recovery

| Error Type | Recovery |
|------------|----------|
| RETRYABLE | Exponential backoff (1s → 2s → 4s → 60s max) |
| RECOVERABLE | Switch to different model/harness |
| FATAL | Pause story, notify human immediately |
| HUMAN_INPUT | Forward to human, wait for response |

## Project Structure

```
bmad-supervisor/
├── docs/                     # Documentation (Diataxis)
│   ├── tutorials/           # Learning-oriented guides
│   ├── how-to/              # Task-oriented guides
│   ├── reference/           # Technical specifications
│   └── explanation/         # Conceptual understanding
├── src/
│   ├── index.ts             # Entry point
│   ├── config.ts            # Config loading with Zod
│   ├── supervisor.ts        # Main orchestrator
│   ├── state/               # State management
│   ├── workflows/           # Workflow implementations
│   ├── agents/              # Agent harnesses
│   ├── errors/              # Error handling
│   ├── notifications/       # Telegram notifications
│   ├── git/                 # Git operations
│   └── http/                # HTTP API
├── supervisor.config.yaml
├── package.json
└── tsconfig.json
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with status |
| `/metrics` | GET | Prometheus metrics |
| `/stories` | GET | List all stories |
| `/stories/:key` | GET | Story details |
| `/control/pause` | POST | Pause supervisor |
| `/control/resume` | POST | Resume supervisor |

## Database Schema

```sql
-- Checkpoints for recovery
CREATE TABLE checkpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_key TEXT NOT NULL,
  workflow TEXT NOT NULL,
  status TEXT NOT NULL,
  attempt INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Error log
CREATE TABLE errors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_key TEXT,
  workflow TEXT,
  error_type TEXT NOT NULL,
  error_message TEXT,
  stack_trace TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Notification queue
CREATE TABLE notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_key TEXT,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  priority INTEGER DEFAULT 2,
  sent INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Agent invocation history
CREATE TABLE invocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  story_key TEXT,
  workflow TEXT,
  harness TEXT NOT NULL,
  model TEXT NOT NULL,
  exit_code INTEGER,
  duration_ms INTEGER,
  success INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Monitoring

### Health Endpoint Response

```json
GET /health
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

### Prometheus Metrics

```
bmad_stories_total{gauge}           # Total stories
bmad_workflow_duration_ms{histo}    # Workflow duration
bmad_errors_total{counter}         # Error count by type
```

## Production Deployment

```bash
# Install dependencies
bun install

# Start with PM2
pm2 start ecosystem.config.js

# View logs
pm2 logs supervisor

# Monitor
pm2 monit
```

## Documentation

The complete documentation is organized using the [Diataxis framework](https://diataxis.fr/):

| Type | Purpose | Location |
|------|---------|----------|
| **Tutorials** | Learning-oriented, step-by-step guides | `docs/tutorials/` |
| **How-to Guides** | Task-oriented, problem-solution format | `docs/how-to/` |
| **Reference** | Technical specifications and API docs | `docs/reference/` |
| **Explanation** | Conceptual understanding and architecture | `docs/explanation/` |

### Quick Start

1. **[Installation](./docs/tutorials/installation.md)** - Get up and running in 5 minutes
2. **[First Workflow](./docs/tutorials/first-workflow.md)** - Run your first story
3. **[Configuration](./docs/how-to/configuration.md)** - Customize supervisor

### Full Documentation Index

- [Diataxis Index](./docs/diataxis-index.md) - Complete documentation navigation

### Additional Resources

- [PRD](./_bmad-output/planning-artifacts/prd.md)
- [Architecture](./_bmad-output/planning-artifacts/architecture.md)
- [Product Brief](./_bmad-output/planning-artifacts/product-brief.md)
- [Sprint Status](./_bmad-output/sprint-status.yaml)

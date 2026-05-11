---
stepsCompleted: ["step-01-init", "step-02-context", "step-03-starter", "step-04-decisions", "step-05-patterns", "step-06-structure", "step-07-validation", "step-08-complete"]
inputDocuments: ["product-brief.md", "prfaq-bmad-supervisor.md", "prd.md", "brainstorming-session-2026-05-09-1209.md"]
---

# Architecture: BMAD Implementation Supervisor

**Author:** Aulia
**Date:** 2026-05-09
**Status:** Complete

---

## 1. System Context

### 1.1 Problem Space

The Supervisor operates in the BMAD Method's Implementation Phase (Phase 4), bridging between:
- **BMAD Skills** (create-story, dev-story, code-review) — the domain logic
- **Agent Harnesses** (Codex, OpenCode, CommandCode) — the execution environment
- **Human Operator** — the decision maker, reachable via Telegram

### 1.2 System Boundaries

```
┌─────────────────────────────────────────────────────────────────┐
│                    BMAD Implementation Supervisor              │
├─────────────────────────────────────────────────────────────────┤
│  Inputs:                        Outputs:                        │
│  - sprint-status.yaml          - Story status updates          │
│  - BMAD skills                 - Telegram notifications         │
│  - Telegram commands            - Git commits/branches          │
│  - Human input                 - Checkpoint state               │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture Decisions

### 2.1 Language & Runtime

**Decision:** Bun with TypeScript

| Alternative | Rationale |
|-------------|-----------|
| Node.js | Mature, but Bun is faster and native TypeScript |
| Python | Good for scripts, less ideal for CLI tools with subprocess handling |
| Go | Fast, but less ergonomic for rapid development |

### 2.2 State Storage

**Decision:** SQLite (better-sqlite3)

| Alternative | Rationale |
|-------------|-----------|
| YAML file only | Risk of corruption, no atomic operations |
| JSON file | Same issues as YAML |
| SQLite | ACID compliant, single file, survives crashes |
| Redis | Overkill for single-machine use |

### 2.3 Process Management

**Decision:** PM2 for production, Bun for development

| Alternative | Rationale |
|-------------|-----------|
| systemd | Linux-only, complex for dev |
| Forever | Less features than PM2 |
| PM2 | Excellent for Node/Bun, log aggregation, auto-restart |

### 2.4 Agent Invocation Strategy

**Decision:** Fresh process per workflow step (no session reuse)

| Alternative | Rationale |
|-------------|-----------|
| Reuse session | Context window grows, slower responses, potential confusion |
| Fresh process | Small context, deterministic, easier to debug |

### 2.5 Error Recovery Strategy

**Decision:** Circuit breaker + checkpointing + exponential backoff

| Component | Implementation |
|-----------|-----------------|
| Circuit breaker | Trip after 3 consecutive failures |
| Checkpointing | SQLite on every state transition |
| Backoff | 1s → 2s → 4s → 60s max |

---

## 3. Component Design

### 3.1 Core Components

```
┌─────────────────────────────────────────────────────────────────┐
│                     Supervisor (Main Orchestrator)              │
│  - State machine for story lifecycle                           │
│  - Workflow queue management                                    │
│  - Checkpoint coordination                                      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
        v                   v                   v
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ AgentInvoker  │  │ ErrorHandler  │  │ NotificationMgr│
│ - Codex       │  │ - Classifier  │  │ - Telegram    │
│ - OpenCode    │  │ - Retry       │  │ - Queue       │
│ - CommandCode │  │ - Circuit Brk │  │ - Commands    │
└───────────────┘  └───────────────┘  └───────────────┘
        │                   │                   │
        v                   v                   v
┌───────────────┐  ┌───────────────┐  ┌───────────────┐
│ HealthMonitor │  │ GitOps        │  │ StateStore    │
│ - File watch  │  │ - Branch      │  │ - SQLite      │
│ - Stall detect│  │ - Commit      │  │ - Checkpoint  │
│ - Timeout     │  │ - Merge       │  │ - Recovery    │
└───────────────┘  └───────────────┘  └───────────────┘
```

### 3.2 Component Responsibilities

| Component | Responsibility | Public API |
|-----------|----------------|------------|
| **Supervisor** | Orchestrate workflow loop | `start()`, `pause()`, `resume()`, `stop()` |
| **AgentInvoker** | Execute CLI commands, parse output | `invoke(config): AgentResult` |
| **ErrorHandler** | Classify errors, determine recovery | `handle(error): ErrorAction` |
| **NotificationMgr** | Send Telegram, queue messages | `notify(event)`, `sendCommand(cmd)` |
| **HealthMonitor** | Detect stalls, monitor process | `check(): HealthReport` |
| **GitOps** | Branch, commit, merge operations | `branch(story)`, `commit(msg)`, `merge(story)` |
| **StateStore** | Persist and recover state | `checkpoint(state)`, `recover(): State` |

---

## 4. Data Flow

### 4.1 Story Processing Flow

```
sprint-status.yaml → Supervisor.pickNextStory()
                          │
                          v
                   AgentInvoker.invoke(create-story)
                          │
                          v (story file created)
                   StateStore.checkpoint()
                          │
                          v
                   NotificationMgr.notify(story started)
                          │
                          v
                   AgentInvoker.invoke(dev-story)
                          │
                          v (code + tests)
                   StateStore.checkpoint()
                          │
                          v
                   NotificationMgr.notify(implementation complete)
                          │
                          v
                   AgentInvoker.invoke(code-review)
                          │
                          v (approved/changes requested)
                   StateStore.checkpoint()
                          │
              ┌────────────┴────────────┐
              │                         │
         [approved]              [changes]
              │                         │
              v                         v
         GitOps.merge()         AgentInvoker.invoke(dev-story)
              │                         │
              v                         v (retry loop)
         NotificationMgr.notify(story done)
              │
              v
         Update sprint-status.yaml
              │
              v
         Supervisor.nextStory()
```

### 4.2 Error Recovery Flow

```
AgentInvoker.invoke() throws error
         │
         v
ErrorHandler.classify(error)
         │
    ┌────┴────┬─────────┬─────────┐
    │         │         │         │
RETRYABLE RECOVERABLE  FATAL  HUMAN_INPUT
    │         │         │         │
    v         v         v         v
 Backoff   Switch    Pause   Forward
 retry     model    story   to human
    │         │         │         │
    └─────────┴─────────┴─────────┘
              │
              v
      Update checkpoint
              │
              v
      Continue or escalate
```

---

## 5. API Design

### 5.1 Internal Interfaces

```typescript
interface AgentConfig {
  harness: 'codex' | 'opencode' | 'commandcode';
  model: string;
  prompt: string;
  timeoutMs: number;
  workdir: string;
}

interface AgentResult {
  status: 'completed' | 'failed' | 'timeout' | 'needs_input';
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  artifacts: string[];
}

interface ErrorContext {
  story: string;
  workflow: string;
  attempt: number;
  error: Error;
  timestamp: Date;
}

interface ErrorAction {
  action: 'RETRY' | 'SWITCH_MODEL' | 'PAUSE' | 'ESCALATE' | 'CONTINUE';
  backoffMs?: number;
  reason: string;
}

interface Checkpoint {
  storyKey: string;
  workflow: string;
  status: StoryStatus;
  timestamp: Date;
}
```

### 5.2 CLI Commands

```bash
# Start supervisor
supervisor start --config supervisor-config.yaml

# Pause/resume
supervisor pause
supervisor resume

# Manual control
supervisor status
supervisor retry <story>
supervisor skip <story>
supervisor abort

# Debug
supervisor health
supervisor checkpoint list
supervisor logs --follow
```

### 5.3 HTTP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check with status |
| `/metrics` | GET | Prometheus metrics |
| `/stories` | GET | List all stories |
| `/stories/:key` | GET | Story details |
| `/control/pause` | POST | Pause supervisor |
| `/control/resume` | POST | Resume supervisor |

---

## 6. Database Schema

### 6.1 SQLite Tables

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

-- Error log for debugging
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

---

## 7. Configuration Schema

### 7.1 supervisor-config.yaml

```yaml
project:
  root: /path/to/project
  sprint_status: _bmad-output/sprint-status.yaml
  stories_dir: _bmad-output/stories

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
  dev_story:
    - { harness: codex, model: o3 }
    - { harness: opencode, model: google/gemini-2.5-pro }
  code_review:
    - { harness: opencode, model: anthropic/claude-sonnet-4-6 }

health:
  stuck_timeout_ms: 600000
  max_retries_per_story: 3
  circuit_breaker_threshold: 3

supervisor:
  poll_interval_ms: 5000
  concurrent_stories: 1
```

---

## 8. Security

### 8.1 Secrets Management

- Telegram bot token: Environment variable `TELEGRAM_BOT_TOKEN`
- Telegram chat ID: Environment variable `TELEGRAM_CHAT_ID`
- API keys: Stored in harness config (Codex, OpenCode, CommandCode各自管理)

### 8.2 File Permissions

- Config files: User read/write only (0600)
- SQLite database: User read/write only (0600)
- Logs: Rotate daily, keep 30 days

### 8.3 Network

- Telegram API: Outbound HTTPS only
- No incoming network exposure (local operation only)

---

## 9. Deployment

### 9.1 Development

```bash
# Run directly
bun run src/index.ts

# Or with hot reload
bun --watch src/index.ts
```

### 9.2 Production (PM2)

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

### 9.3 ecosystem.config.js

```javascript
module.exports = {
  apps: [{
    name: 'bmad-supervisor',
    script: 'src/index.ts',
    interpreter: 'bun',
    watch: false,
    instances: 1,
    env: {
      NODE_ENV: 'production'
    }
  }]
}
```

---

## 10. Testing Strategy

### 10.1 Unit Tests

- ErrorHandler classification
- State machine transitions
- Configuration validation
- GitOps branch/commit logic

### 10.2 Integration Tests

- Agent invoker with mock harnesses
- Notification queue behavior
- Checkpoint/recovery cycle
- Telegram command handling

### 10.3 Chaos Testing

- Inject errors, verify recovery
- Kill process mid-workflow, verify restart
- Corrupt SQLite, verify recovery
- Network timeout simulation

---

## 11. Monitoring

### 11.1 Health Endpoint

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

### 11.2 Prometheus Metrics

```
# HELP bmad_stories_total Total stories
# TYPE bmad_stories_total gauge
bmad_stories_total 10

# HELP bmad_workflow_duration_ms Workflow duration
# TYPE bmad_workflow_duration_ms histogram
bmad_workflow_duration_ms_bucket{le="60000"} 5
bmad_workflow_duration_ms_bucket{le="300000"} 20

# HELP bmad_errors_total Error count
# TYPE bmad_errors_total counter
bmad_errors_total{type="retryable"} 10
bmad_errors_total{type="fatal"} 1
```

---

## 12. File Structure

```
bmad-supervisor/
├── src/
│   ├── index.ts              # Entry point
│   ├── config.ts             # Config loading
│   ├── supervisor.ts         # Main orchestrator
│   ├── state/
│   │   ├── store.ts          # SQLite operations
│   │   └── checkpoint.ts     # Checkpoint management
│   ├── workflows/
│   │   ├── create-story.ts
│   │   ├── dev-story.ts
│   │   └── code-review.ts
│   ├── agents/
│   │   ├── invoker.ts        # Agent invocation
│   │   ├── harness/
│   │   │   ├── codex.ts
│   │   │   ├── opencode.ts
│   │   │   └── commandcode.ts
│   │   └── validator.ts
│   ├── errors/
│   │   ├── handler.ts
│   │   └── classifier.ts
│   ├── notifications/
│   │   ├── telegram.ts
│   │   └── queue.ts
│   ├── git/
│   │   ├── ops.ts
│   │   └── branch.ts
│   └── http/
│       └── server.ts
├── supervisor.config.yaml
├── package.json
├── tsconfig.json
└── README.md
```

---

## 13. Appendix

### A. Reference Documents

- PRD: `_bmad-output/prd.md`
- Product Brief: `_bmad-output/product-brief.md`
- PRFAQ: `_bmad-output/prfaq-bmad-supervisor.md`

### B. Related BMAD Artifacts

- Sprint status: `_bmad-output/sprint-status.yaml`
- Stories: `_bmad-output/stories/`
- Epics: `_bmad-output/epics.md`
---
stepsCompleted: ["step-01-validate-prerequisites", "step-02-design-epics", "step-03-create-stories", "step-04-final-validation"]
inputDocuments: ["product-brief.md", "prfaq-bmad-supervisor.md", "prd.md", "architecture.md", "brainstorming-session-2026-05-09-1209.md"]
---

# BMAD Implementation Supervisor - Epics

**Author:** Aulia
**Date:** 2026-05-09
**Status:** Complete

---

## Epic 1: Core Supervisor Foundation

**Goal:** Build the foundation for the Supervisor — project scaffold, config loading, sprint-status parser, state machine

**Priority:** P0 (Prerequisite for everything else)

**Estimated Stories:** 4

### Description

Set up the core infrastructure:
- Project initialization with Bun/TypeScript
- Configuration loading with Zod validation
- Sprint-status.yaml parser
- Story lifecycle state machine
- Basic CLI entry point

### Stories

| Story | Description | Priority |
|-------|-------------|----------|
| E1-1: Project Setup | Initialize Bun + TypeScript project with dependencies | P0 |
| E1-2: Config Loading | Implement YAML config loading with Zod validation | P0 |
| E1-3: Sprint Status Parser | Parse and validate sprint-status.yaml | P0 |
| E1-4: State Machine | Implement story lifecycle state transitions | P0 |

### Dependencies

- None (this is the foundation)

---

## Epic 2: Agent Integration Layer

**Goal:** Build the agent invoker with harness abstraction for Codex, OpenCode, and CommandCode

**Priority:** P0 (Core functionality)

**Estimated Stories:** 5

### Description

Implement the ability to invoke BMAD skills via CLI:
- Agent harness abstraction interface
- Codex invoker (JSONL parsing)
- OpenCode invoker (JSON parsing)
- CommandCode invoker (stdout parsing)
- Fallback chain logic

### Stories

| Story | Description | Priority |
|-------|-------------|----------|
| E2-1: Harness Interface | Define AgentInvoker interface with harness abstraction | P0 |
| E2-2: Codex Invoker | Implement codex exec invocation with JSONL parsing | P0 |
| E2-3: OpenCode Invoker | Implement opencode run invocation with JSON parsing | P0 |
| E2-4: CommandCode Invoker | Implement cmd invocation with stdout parsing | P0 |
| E2-5: Fallback Chain | Implement model/harness fallback on failure | P1 |

### Dependencies

- Epic 1: Core Supervisor Foundation

---

## Epic 3: Error Handling & Reliability

**Goal:** Implement error classification, stall detection, circuit breaker, and checkpointing

**Priority:** P0 (Your #1 Fear)

**Estimated Stories:** 6

### Description

Make the supervisor reliable:
- Error classification (RETRYABLE, RECOVERABLE, FATAL, HUMAN_INPUT)
- Stall detector with progress fingerprinting
- Exponential backoff retry
- Circuit breaker pattern
- SQLite checkpointing
- Recovery from checkpoints

### Stories

| Story | Description | Priority |
|-------|-------------|----------|
| E3-1: Error Classification | Define and implement error taxonomy | P0 |
| E3-2: Retry Logic | Implement exponential backoff retry | P0 |
| E3-3: Stall Detector | Detect stuck workflows via file change monitoring | P0 |
| E3-4: Circuit Breaker | Trip after N consecutive failures | P0 |
| E3-5: SQLite Checkpointing | Save state on every transition | P0 |
| E3-6: Recovery Logic | Resume from last checkpoint on restart | P0 |

### Dependencies

- Epic 2: Agent Integration Layer

---

## Epic 4: Notification System

**Goal:** Build Telegram bot for notifications and commands

**Priority:** P1

**Estimated Stories:** 4

### Description

Keep the human informed:
- Telegram bot setup
- Event notifications (started, completed, failed, needs input)
- Command handling (/status, /pause, /resume, /retry, /skip, /abort)
- Notification queue (buffer when offline)

### Stories

| Story | Description | Priority |
|-------|-------------|----------|
| E4-1: Telegram Bot Setup | Initialize Telegram bot with grammY | P1 |
| E4-2: Event Notifications | Send notifications for story lifecycle events | P1 |
| E4-3: Command Handling | Process /status, /pause, /resume, /retry commands | P1 |
| E4-4: Notification Queue | Buffer notifications when Telegram unavailable | P2 |

### Dependencies

- Epic 3: Error Handling & Reliability

---

## Epic 5: Git Automation

**Goal:** Implement branch-per-story workflow with auto-commit and squash merge

**Priority:** P1

**Estimated Stories:** 4

### Description

Automate git operations:
- Branch-per-story workflow (feat/{story-slug})
- Auto-commit at checkpoints
- Squash merge on approval
- Conflict detection

### Stories

| Story | Description | Priority |
|-------|-------------|----------|
| E5-1: Branch Creation | Create feature branch for each story | P1 |
| E5-2: Auto Commit | Auto-commit at workflow checkpoints | P1 |
| E5-3: Squash Merge | Squash merge approved stories to main | P1 |
| E5-4: Conflict Detection | Detect and handle git conflicts | P2 |

### Dependencies

- Epic 4: Notification System

---

## Epic 6: Observability

**Goal:** Build health endpoint, metrics, and structured logging

**Priority:** P2

**Estimated Stories:** 3

### Description

Make the supervisor visible:
- Health endpoint (GET /health)
- Prometheus metrics
- Structured JSON logging

### Stories

| Story | Description | Priority |
|-------|-------------|----------|
| E6-1: Health Endpoint | Implement /health with status info | P2 |
| E6-2: Metrics Export | Expose Prometheus metrics | P2 |
| E6-3: Structured Logging | Implement Pino JSON logging | P2 |

### Dependencies

- Epic 5: Git Automation

---

## Dependencies Graph

```
E1 (Foundation)
  ↓
E2 (Agent Integration)
  ↓
E3 (Error Handling) ← Your #1 Fear
  ↓
E4 (Notifications)
  ↓
E5 (Git Automation)
  ↓
E6 (Observability)
```

---

## Implementation Order

Recommended sequence based on your reliability constraint:

1. **Epic 1** → **Epic 2** → **Epic 3** (Your focus: error handling)
2. Then Epic 4, Epic 5, Epic 6

---

## Appendix

### Reference Documents

- Architecture: `_bmad-output/architecture.md`
- PRD: `_bmad-output/prd.md`
- Product Brief: `_bmad-output/product-brief.md`
- PRFAQ: `_bmad-output/prfaq-bmad-supervisor.md`
- Brainstorming: `_bmad-output/brainstorming/brainstorming-session-2026-05-09-1209.md`

### Notes

- Epic 3 is your priority (error handling is your biggest fear)
- All epics build on each other sequentially
- Each epic has 3-6 stories for manageable implementation
- Total estimated: ~26 stories
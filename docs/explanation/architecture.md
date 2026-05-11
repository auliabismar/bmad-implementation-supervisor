# Architecture Overview

This document explains the BMAD Implementation Supervisor's architecture.

## High-Level Architecture

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

## Components

### Supervisor

The main orchestrator that:
- Manages story state machine transitions
- Coordinates workflow execution
- Handles pause/resume/abort commands
- Coordinates checkpointing

### AgentInvoker

Invokes agent harnesses with automatic fallback:
- Executes CLI commands for Codex, OpenCode, CommandCode
- Manages model pool fallback chain
- Handles timeouts and retries

### ErrorHandler

Classifies errors and determines recovery:
- Categorizes errors as RETRYABLE, RECOVERABLE, FATAL
- Implements exponential backoff for retries
- Manages circuit breaker state

### NotificationMgr

Sends notifications via Telegram:
- Sends workflow progress updates
- Alerts on errors and failures
- Handles Telegram commands

### HealthMonitor

Monitors supervisor health:
- Detects stalled workflows
- Tracks story progress
- Exposes health metrics

### GitOps

Manages Git operations:
- Creates branches per story
- Commits changes
- Squash-merges to main

### StateStore

Persists state in SQLite:
- Story checkpoints
- Error logs
- Notification queue
- Invocation history

## Data Flow

1. **Story Detection**: Supervisor polls sprint-status.yaml for new stories
2. **State Transition**: Story transitions from backlog → ready-for-dev
3. **Workflow Execution**: AgentInvoker runs create-story workflow
4. **Checkpointing**: StateStore saves checkpoint after each workflow
5. **Notification**: NotificationMgr sends progress updates
6. **Error Handling**: ErrorHandler classifies and recovers from errors

## State Machine

Stories progress through states:
```
backlog → ready-for-dev → in-progress → review → done
```

Each transition is validated and persisted.

## Error Recovery Flow

```
Error occurs
    ↓
Classify error type
    ↓
    ├─ RETRYABLE → Wait + Retry
    ├─ RECOVERABLE → Switch model/harness
    └─ FATAL → Pause + Notify human
```

## Next Steps

- [State Machine](./state-machine.md) - Story lifecycle details
- [Error Classification](./error-classification.md) - Error handling details

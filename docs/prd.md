---
stepsCompleted: ["step-01-init", "step-02-discovery", "step-03-success", "step-04-journeys", "step-05-domain", "step-06-innovation", "step-07-project-type", "step-08-scoping", "step-09-functional", "step-10-nonfunctional", "step-11-polish", "step-12-complete"]
inputDocuments: ["product-brief.md", "prfaq-bmad-supervisor.md", "brainstorming-session-2026-05-09-1209.md", "brainstorming-report.md"]
workflowType: 'prd'
---

# Product Requirements Document - BMAD Implementation Supervisor

**Author:** Aulia
**Date:** 2026-05-09

---

## 1. Executive Summary

The BMAD Implementation Supervisor automates the Implementation Phase (Phase 4) of the BMAD Method. It orchestrates create-story → dev-story → code-review workflows for each story in sprint-status.yaml, notifies the human operator via Telegram, and recovers from errors automatically. Built with reliability as the primary constraint.

**Problem Solved:** Manual, repetitive cycling through BMAD workflows for every story, requiring constant human attention and monitoring.

**Target Users:** Developers using BMAD Method who want to automate implementation without losing visibility.

---

## 2. Project Discovery

### 2.1 What is this project?

**Type:** Internal automation tool (non-commercial)

**Core Functionality:** Orchestrates BMAD skill invocations, manages workflow loop, handles errors, notifies via Telegram.

**Category:** Developer productivity / Process automation

### 2.2 What is the existing project?

**Project Status:** Greenfield - New project

**No existing codebase** - this is a new tool built from scratch.

### 2.3 What problem is being solved?

| Pain Point | Impact |
|------------|--------|
| Manual workflow cycling | 5-10 min per story of pure wait time |
| Context window explosion | Sessions grow unbounded, slower responses |
| No error recovery | Unhandled errors stall the entire loop |
| No visibility | Must constantly check terminal for status |
| No mobile notifications | Can't step away from machine |

### 2.4 Why now?

BMAD Method is being used for development. The manual implementation phase is the bottleneck. AI coding agents (Codex, OpenCode, CommandCode) are mature enough to invoke reliably.

---

## 3. Success Criteria

### 3.1 User Success

| Metric | Target |
|--------|--------|
| Error recovery rate | >95% autonomous |
| Human interventions per sprint | <3 |
| Stall detection time | <10 minutes |
| Story completion time | Track but no target |

### 3.2 Project Success

| Milestone | Definition |
|-----------|------------|
| MVP | Can run one story end-to-end automatically |
| v1 Release | All 3 workflows, error handling, Telegram notifications |
| v1.1 | Git automation, observability |

---

## 4. User Journeys

### 4.1 Primary Journey: Automated Story Processing

```
1. Supervisor reads sprint-status.yaml
2. Finds next story (backlog or ready-for-dev)
3. Creates feature branch feat/{story-slug}
4. Invokes create-story → story file updated to ready-for-dev
5. Invokes dev-story → code implemented, status = review
6. Invokes code-review → approved or changes-requested
7. If approved: squash merge to main, delete branch, status = done
8. If changes: retry dev-story on same branch
9. Updates sprint-status.yaml after each transition
10. Sends Telegram notification for each event
11. Repeats for next story
```

### 4.2 Error Recovery Journey

```
1. Agent invocation fails
2. ErrorHandler classifies: RETRYABLE | RECOVERABLE | FATAL | HUMAN_INPUT
3. If RETRYABLE: retry with exponential backoff (1s, 2s, 4s, max 60s)
4. If RECOVERABLE: try different model/harness
5. If FATAL: pause story, notify human via Telegram
6. If HUMAN_INPUT: forward question to human, wait for response
7. Circuit breaker trips after 3 consecutive failures
8. Checkpoint saved to SQLite on every transition
```

### 4.3 Human Interaction Journey

```
1. Human receives Telegram notification
2. Views status via /status command
3. If needed: /pause, /resume, /retry, /skip, /abort
4. If human input needed: /input <response>
5. Supervisor continues from where left off
```

---

## 5. Domain Model

### 5.1 Core Entities

| Entity | Attributes |
|--------|-------------|
| **Story** | key, epic, title, status, last_updated |
| **Workflow** | type, status, attempt, error, duration |
| **Agent** | harness, model, exit_code, output |
| **Checkpoint** | story_key, workflow, state, timestamp |
| **Notification** | type, priority, message, sent_at |

### 5.2 Story Status Lifecycle

```
backlog → ready-for-dev → in-progress → review → done
                 ↑                           |
                 |___________________________| (if changes requested)
```

### 5.3 Error Categories

| Category | Examples | Auto-Retry? |
|----------|----------|-------------|
| RETRYABLE | timeout, rate limit, network | Yes (exponential backoff) |
| RECOVERABLE | bad output, missing artifacts | Yes (different model) |
| FATAL | YAML corruption, disk full | No (escalate immediately) |
| HUMAN_INPUT | agent asks question | No (wait for human) |

---

## 6. Innovation

### 6.1 What's Unique

- **Stall detector with progress fingerprinting** — Unique to this product
- **SQLite checkpointing** — Survives restarts, resumes from exact position
- **Multi-harness fallback** — Codex → OpenCode → CommandCode
- **Error classification taxonomy** — Specific to AI agent failures

### 6.2 Comparison

| Alternative | Why Insufficient |
|-------------|------------------|
| Generic CI/CD | Doesn't understand BMAD workflow patterns |
| Script wrappers | No error recovery, no checkpointing |
| Manual cycling | No automation, no notifications |

### 6.3 Risks

- AI agent behavior is non-deterministic
- New model versions may break invocations
- Telegram API could change

---

## 7. Project Type

### 7.1 Type Classification

**Category:** Internal tool / Developer productivity

**Complexity:** Medium — requires integration with multiple external systems (Codex, OpenCode, CommandCode, Telegram)

### 7.2 Technical Context

- **Runtime:** Bun or Node.js with TypeScript
- **State:** SQLite (single file, ACID)
- **Config:** YAML with Zod validation
- **Output:** Local development machine (not cloud)

---

## 8. Scope

### 8.1 In Scope (v1)

| Feature | Priority |
|---------|----------|
| Sprint-status.yaml parser | P0 |
| Story lifecycle state machine | P0 |
| Agent invoker (Codex/OpenCode/CommandCode) | P0 |
| Fallback chain | P0 |
| Error classification + retry | P0 |
| Stall detector | P0 |
| SQLite checkpointing | P0 |
| Telegram notifications | P1 |
| Telegram commands | P1 |
| Branch-per-story workflow | P1 |
| Auto-commit | P1 |
| Health endpoint | P2 |

### 8.2 Out of Scope (v1)

- Concurrent story processing
- WhatsApp notifications
- Web dashboard
- Cost tracking
- Git worktrees

### 8.3 Future Considerations (v2+)

- Concurrent stories via worktrees
- Cost budgeting
- Multi-project support
- Web UI

---

## 9. Functional Requirements

### 9.1 Core Features

**FR-001:** Supervisor shall read sprint-status.yaml and identify next story in lifecycle

**FR-002:** Supervisor shall invoke BMAD skills via CLI (Codex, OpenCode, or CommandCode)

**FR-003:** Supervisor shall update story status in sprint-status.yaml after each workflow transition

**FR-004:** Supervisor shall send Telegram notifications for: story started, completed, failed, needs input

**FR-005:** Supervisor shall classify errors and apply appropriate recovery strategy

**FR-006:** Supervisor shall detect stalls (no file changes for 10 minutes) and alert human

**FR-007:** Supervisor shall checkpoint state to SQLite on every transition

**FR-008:** Supervisor shall resume from last checkpoint on restart

### 9.2 User Interactions

**FR-009:** Human shall receive notifications via Telegram with inline keyboard buttons

**FR-010:** Human shall send commands: /status, /pause, /resume, /retry, /skip, /abort, /input

**FR-011:** Human shall provide input to agent questions via /input command

### 9.3 Git Operations

**FR-012:** Supervisor shall create feature branch for each story

**FR-013:** Supervisor shall auto-commit at workflow checkpoints

**FR-014:** Supervisor shall squash-merge approved stories to main

**FR-015:** Supervisor shall delete feature branch after merge

---

## 10. Non-Functional Requirements

### 10.1 Reliability

| Requirement | Target |
|-------------|--------|
| Error recovery without human | >95% |
| Stall detection time | <10 minutes |
| Restart recovery | Resume from exact checkpoint |
| Circuit breaker | Trip after 3 consecutive failures |

### 10.2 Performance

| Requirement | Target |
|-------------|--------|
| Story transition time | Log but not measured |
| Checkpoint latency | <100ms |
| Startup time | <5 seconds |

### 10.3 Observability

- Health endpoint at GET /health
- Structured JSON logging
- Prometheus metrics for: invocations, errors, duration

### 10.4 Security

- Telegram bot token via environment variable
- No secrets committed to git
- Supervisor runs on local machine only

---

## 11. Technical Implementation Notes

### 11.1 Agent Harness Invocation

**Codex:**
```
codex exec -m <model> --sandbox workspace-write --ask-for-approval never "prompt"
```

**OpenCode:**
```
opencode run -m <provider/model> --dangerously-skip-permissions "prompt"
```

**CommandCode:**
```
cmd -p "prompt" --yolo --skip-onboarding
```

### 11.2 Checkpoint Schema

```sql
CREATE TABLE checkpoints (
  id INTEGER PRIMARY KEY,
  story_key TEXT,
  workflow TEXT,
  state TEXT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 11.3 Telegram Message Format

```
[STATUS] Story: {slug} | Workflow: {workflow} | Model: {model}
[Buttons: Next Story | View Diff | Pause]
```

---

## 12. Appendix

### A. References

- Product Brief: `_bmad-output/product-brief.md`
- PRFAQ: `_bmad-output/prfaq-bmad-supervisor.md`
- Brainstorming: `_bmad-output/brainstorming/brainstorming-session-2026-05-09-1209.md`

### B. Terminology

| Term | Definition |
|------|------------|
| BMAD | Business Method for AI-Driven Development |
| sprint-status.yaml | BMAD's story tracking file |
| Circuit breaker | Pattern that stops processing after N failures |
| Checkpoint | State saved to SQLite for recovery |
# Product Brief: BMAD Implementation Supervisor

## Executive Summary

The BMAD Implementation Supervisor is an automation tool that orchestrates the Implementation Phase (Phase 4) of the BMAD Method. It automatically cycles through create-story → dev-story → code-review workflows for each story in the sprint, notifies the human operator via Telegram, and manages isolated sessions per workflow to prevent context window explosion. Built with reliability as the primary constraint, it addresses the core pain point of manual, repetitive workflow cycling that currently requires constant human attention.

## The Problem

When using the BMAD Method for AI-driven development, the Implementation Phase requires manually cycling through multiple workflows (`create-story`, `dev-story`, `code-review`) for every story in `sprint-status.yaml`. The human operator must:

- Manually invoke each workflow in the correct sequence
- Monitor each agent session for completion, stalls, or need for human input
- Switch between different CLI tools (Codex, OpenCode, Claude Code) depending on model availability
- Track which stories are done and which need attention
- Context windows grow unbounded when reusing sessions across workflows

**The user's biggest fear:** Unhandled errors stalling the automation loop with no recovery mechanism.

## The Solution

The Supervisor is a Node.js/Bun automation orchestrator that:

1. **Reads sprint-status.yaml** to identify the next story to process
2. **Invokes BMAD skills** (create-story, dev-story, code-review) via Codex, OpenCode, or CommandCode
3. **Manages the workflow loop** — automatically progresses through create → dev → review → merge
4. **Notifies via Telegram** — real-time updates on story progress, failures, and needs-for-human-input
5. **Handles errors gracefully** — classification, retry with backoff, circuit breaker, checkpointing
6. **Maintains isolation** — fresh process per workflow step (no session reuse)

## What Makes This Different

- **Reliability-first design** — Every error scenario handled: retryable (timeout, rate limit), recoverable (bad output), fatal (corruption), human-input (questions)
- **Stall detection** — Progress fingerprinting detects when the loop is stuck (no file changes in 10 minutes)
- **SQLite checkpointing** — Survives restarts, resumes from exact position
- **Circuit breaker pattern** — Trips after 3 consecutive failures to prevent cascade
- **Multi-harness fallback** — Tries Codex → OpenCode → CommandCode if one fails

This is not a generic CI/CD tool — it's purpose-built for the BMAD Method's specific workflow patterns.

## Who This Serves

**Primary User:** Aulia (developer using BMAD Method)

- Currently manually cycles through create-story → dev-story → code-review for each story
- Wants to automate the loop while staying informed via mobile
- Prioritizes reliability over speed

**Secondary:** Teams using BMAD Method who want to automate implementation

## Success Criteria

- Supervisor recovers from errors automatically without human intervention
- Telegram notifications delivered for all story lifecycle events
- No stalled loops — stall detector triggers within 10 minutes of stuck state
- Checkpoint persistence — supervisor resumes from exact position after restart
- Stories automatically progress through create → dev → review → merge

**Metrics to track:**
- Error recovery rate (target: >95%)
- Average time from story start to completion
- Number of human interventions required per sprint
- Stall detection accuracy

## Scope

**In Scope (v1):**
- Sequential story processing (one story at a time)
- Three BMAD skills: create-story, dev-story, code-review
- Three agent harnesses: Codex, OpenCode, CommandCode
- Telegram notifications for story events
- Error handling with retry, circuit breaker, checkpointing
- Branch-per-story git workflow with squash merge

**Out of Scope (v1):**
- Concurrent story processing
- WhatsApp notifications
- Web dashboard
- Cost tracking/budget enforcement

## Vision

If successful, the Supervisor becomes the backbone of BMAD-driven development:

- **Year 1:** Fully automated Implementation Phase with reliable error recovery
- **Year 2:** Concurrent story processing via git worktrees
- **Year 3:** Self-healing — ML model predicts stalls before they happen

The Supervisor transforms BMAD from a manual method to a truly automated development engine.
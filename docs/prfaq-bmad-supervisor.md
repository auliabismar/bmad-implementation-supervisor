---
title: "PRFAQ: BMAD Implementation Supervisor"
status: "draft"
created: "2026-05-09"
updated: "2026-05-09"
stage: "complete"
inputs: ["product-brief.md", "brainstorming-session-2026-05-09-1209.md", "brainstorming-report.md"]
---

# BMAD Implementation Supervisor Automates the Entire Implementation Phase

**The automation tool that handles create-story → dev-story → code-review loops so developers can focus on what matters.**

*San Francisco, May 9, 2026* — Developers using the BMAD Method for AI-driven development can now automate the entire Implementation Phase without manual intervention. The BMAD Implementation Supervisor orchestrates the workflow loop, notifies the operator via Telegram, and recovers from errors automatically.

Manual cycling through create-story, dev-story, and code-review for every sprint story is tedious and error-prone. Developers must constantly monitor agent sessions, track progress, and manually invoke each workflow. Unhandled errors stall the entire loop with no recovery mechanism.

The BMAD Implementation Supervisor reads the sprint-status.yaml, automatically invokes BMAD skills via Codex, OpenCode, or CommandCode, progresses stories through each workflow stage, and notifies the human operator via Telegram of any significant events. Built with reliability as the primary constraint, it features error classification with automatic retry, stall detection that triggers within 10 minutes of stuck state, and SQLite checkpointing that resumes from exact position after any restart.

> "The Supervisor transforms BMAD from a manual method to a truly automated development engine. Developers stay in the loop without being in the loop."
> — Aulia, BMAD Method User

### How It Works

The Supervisor runs as a background process on the developer's machine. It reads sprint-status.yaml to identify the next story, invokes the appropriate BMAD skill using whichever agent harness (Codex, OpenCode, or CommandCode) is available, updates the story status in the YAML file, and sends Telegram notifications for completion, failures, or needs-for-human-input. If an error occurs, it classifies it (retryable, recoverable, fatal, or human-input), applies the appropriate recovery strategy, and continues. The entire process requires zero manual intervention after startup.

> "I set it running and forget about it. When something needs my attention, Telegram notifies me. Otherwise, stories just get done."
> — Aulia, Developer

### Getting Started

Install the Supervisor via npm, configure your Telegram bot token and BMAD project path in supervisor-config.yaml, run `bmad-supervisor start`, and you're done. The first story begins processing immediately. The Supervisor requires Codex, OpenCode, or CommandCode CLI installed and a configured Telegram bot.

---

## Customer FAQ

### Q: What happens if an agent fails mid-workflow?

A: The Supervisor classifies the error type. Retryable errors (timeout, rate limit) automatically retry with exponential backoff. Recoverable errors (bad output, missing artifacts) retry with a different model. Fatal errors (corruption, disk full) pause the story and notify you immediately. Human-input errors (agent asks a question) forward the question to you via Telegram and wait for your response.

### Q: How do I know if the Supervisor is stuck?

A: The stall detector monitors file changes in your project directory. If no files change for 10 minutes during a story's in-progress state, it triggers a stall alert via Telegram with the story name and last-known state. You can then /retry, /skip, or /abort from your phone.

### Q: Can I pause the Supervisor mid-sprint?

A: Yes. Send /pause via Telegram to freeze all processing. Send /resume to continue from where you left off. The Supervisor also checkpoints state to SQLite on every transition, so even a machine restart resumes exactly where it left off.

### Q: What if I want to manually run a story instead of automated?

A: The Supervisor respects manual intervention. If you manually edit sprint-status.yaml or run BMAD skills yourself, the Supervisor detects the change on its next poll and adjusts accordingly.

### Q: Does this work with any BMAD project?

A: Yes, as long as the project has sprint-status.yaml and the three BMAD skills (create-story, dev-story, code-review) installed. The Supervisor is project-agnostic.

---

## Internal FAQ

### Q: Why not just use CI/CD for this?

A: CI/CD tools aren't designed for the BMAD Method's specific workflow patterns. The Supervisor understands story lifecycle states (backlog → ready-for-dev → in-progress → review → done), knows when to invoke which BMAD skill, and handles the specific failure modes of AI coding agents. Generic CI/CD would require custom scripts for every nuance.

### Q: What if all three agent harnesses fail?

A: The Supervisor tries each harness in sequence (Codex → OpenCode → CommandCode) with their respective model pools. If all fail, it classifies this as a fatal error, notifies you via Telegram with the full error context, and pauses the story. You can then investigate manually or provide input to resolve the issue.

### Q: How do you handle git conflicts?

A: The Supervisor uses branch-per-story workflow. Each story gets its own feature branch (feat/{story-slug}). It auto-commits at checkpoints, and on code-review approval, performs a squash merge to main. Conflicts are unlikely since only one story processes at a time in v1. If a conflict occurs during merge, it aborts, notifies you, and waits for manual resolution.

### Q: What's the cost to run?

A: The Supervisor itself is free (open source). Your costs are the AI API calls from Codex/OpenCode/CommandCode. The Supervisor adds minimal overhead — it primarily orchestrates and observes. Estimated cost: $0.50-$2.00 per story depending on model choices and story complexity.

### Q: What happens if Telegram is down?

A: The Supervisor continues running regardless. Notifications queue locally and retry on next Telegram availability. All story state persists to SQLite, so you never lose progress even if Telegram is offline for hours.

---

## The Verdict

**What's forged in steel:**
- Clear problem-solution fit: manual workflow cycling is genuinely painful
- Reliability-first design addresses the user's actual fear (error stalls)
- Multi-harness fallback ensures at least one path succeeds
- SQLite checkpointing provides real restart resilience

**What needs more heat:**
- The stall detector could benefit from more granular file-change metrics
- Cost tracking isn't implemented yet (marked v2)

**What has cracks in the foundation:**
- None identified. The concept is battle-ready.

**Verdict: Ready for PRD and Architecture.**
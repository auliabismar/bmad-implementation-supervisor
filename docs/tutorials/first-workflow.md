# First Workflow Tutorial

This tutorial walks you through running your first story workflow with the BMAD Implementation Supervisor.

## Overview

The supervisor processes stories through three sequential workflows:
1. **create-story** - Generate story details from epic requirements
2. **dev-story** - Implement the story code
3. **code-review** - Review and approve the implementation

## Prerequisites

- Supervisor installed and running (see [Installation](./installation.md))
- Sprint status file at `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Step 1: Create a Story

Add a story to your `sprint-status.yaml`:

```yaml
epics:
  - epicNum: 1
    title: "User Authentication"
    status: backlog

stories:
  story-1:
    epicNum: 1
    title: "Implement login page"
    status: backlog
    description: "Create a login page with username/password fields"
```

## Step 2: Start the Supervisor

```bash
bun run start
```

The supervisor will automatically:
1. Detect the story in `backlog` status
2. Transition it to `ready-for-dev`
3. Start the `create-story` workflow

## Step 3: Monitor Progress

Watch the console output for workflow progress:

```
[Supervisor] Processing story: story-1
[Supervisor] Starting workflow create_story for story story-1
[Supervisor] Story story-1 transitioned to ready-for-dev
```

## Step 4: Review the Output

After `create-story` completes, the supervisor:
1. Transitions story to `in-progress`
2. Starts `dev-story` workflow
3. Generates implementation code

Check the output directory for generated files.

## Step 5: Code Review

The supervisor automatically:
1. Creates a branch for the story
2. Commits changes
3. Starts `code-review` workflow
4. Merges to main after approval

## Expected Timeline

| Workflow | Typical Duration |
|----------|------------------|
| create-story | 5 minutes |
| dev-story | 30 minutes |
| code-review | 10 minutes |

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Story not processed | Check story status is `backlog` or `ready-for-dev` |
| Workflow timeout | Increase `timeout_ms` in config |
| Agent harness error | Check harness installation and API keys |

## Next Steps

- [Telegram Commands](../how-to/telegram-commands.md) - Monitor remotely
- [Error Recovery](../how-to/error-recovery.md) - Handle failures

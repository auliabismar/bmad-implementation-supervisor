# State Machine Reference

The BMAD Implementation Supervisor uses a finite state machine to manage story lifecycles.

## Story States

| State | Description |
|-------|-------------|
| `backlog` | Story is in the backlog, not yet ready for development |
| `ready-for-dev` | Story is ready to start the workflow |
| `in-progress` | Story is currently being developed |
| `review` | Story implementation is ready for review |
| `failed` | Story workflow failed, requires intervention |
| `stalled` | Story workflow has stalled (no progress for 10 min) |
| `done` | Story workflow completed successfully |

## Valid Transitions

```
backlog → ready-for-dev
ready-for-dev → in-progress
in-progress → review
in-progress → failed
in-progress → stalled
review → done
review → in-progress (if changes requested)
review → failed
failed → ready-for-dev (after fix)
stalled → ready-for-dev (after fix)
```

## Epic States

Epics track groups of related stories:

| State | Description |
|-------|-------------|
| `backlog` | Epic not yet started |
| `in-progress` | At least one story in epic is in progress |
| `done` | All stories in epic are done |

## State Machine API

### canTransition(current, next)

Check if a transition is valid.

```typescript
const canTransition = stateMachine.canTransition('backlog', 'ready-for-dev');
// true
```

### transition(story, newStatus)

Perform a state transition.

```typescript
const result = stateMachine.transition(story, 'ready-for-dev');
```

### startWorkflow(story, workflow)

Start a workflow for a story.

```typescript
const context = stateMachine.startWorkflow(story, 'create-story');
```

## Story Context

Each story has a context object:

```typescript
interface StoryContext {
  story: StoryInfo;
  currentWorkflow: WorkflowType | null;
  attempt: number;
  lastError: string | null;
  lastCheckpoint: Date | null;
}
```

## Workflow Types

| Workflow | Description |
|----------|-------------|
| `create-story` | Generate story details from epic requirements |
| `dev-story` | Implement the story code |
| `code-review` | Review and approve the implementation |

## Next Steps

- [Architecture](./architecture.md) - System design
- [Error Classification](./error-classification.md) - Error handling

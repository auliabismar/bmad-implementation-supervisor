# Fallback Mechanism

This document explains the automatic fallback mechanism for agent harnesses and models.

## Why Fallback?

Agent harnesses and models can fail for various reasons:
- Rate limits exceeded
- Model not found
- API key invalid
- Network issues
- Model unavailable

Fallback ensures resilience by automatically trying alternatives.

## Fallback Chain

Each workflow has a model pool ordered by preference:

```yaml
model_pool:
  create_story:
    - { harness: codex, model: gpt-5.4 }
    - { harness: opencode, model: openai/gpt-5.4 }
    - { harness: commandcode, model: openai/o4-mini }
```

## Fallback Logic

1. **Try first model** from pool
2. **If error occurs:**
   - RETRYABLE → Retry up to 3 times with backoff
   - RECOVERABLE → Try next model in pool
   - FATAL → Stop, notify human
3. **Continue** until:
   - Success, or
   - Pool exhausted, or
   - Max attempts reached

## Configuration

```yaml
health:
  max_retries_per_story: 3  # Max attempts per story
```

## Example Flow

```
Story: story-1
Workflow: create_story

Attempt 1: codex/gpt-5.4 → Rate limit (RETRYABLE)
  → Wait 1s, retry
Attempt 2: codex/gpt-5.4 → Rate limit (RETRYABLE)
  → Wait 2s, retry
Attempt 3: codex/gpt-5.4 → Rate limit (RETRYABLE)
  → Wait 4s, retry
Attempt 4: codex/gpt-5.4 → Still failing
  → Switch to opencode/gpt-5.4
Attempt 5: opencode/gpt-5.4 → Success! ✓
```

## Pool Order Enforcement

The supervisor enforces pool order:
- codex → opencode → commandcode

This ensures consistent fallback behavior.

## Monitoring

Track fallbacks via HTTP API:

```bash
curl http://localhost:3000/metrics | grep bmad_errors_total
```

## Next Steps

- [Error Classification](./error-classification.md) - Error types
- [Error Recovery](../how-to/error-recovery.md) - Manual recovery

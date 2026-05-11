# Error Classification

This document explains how the BMAD Implementation Supervisor classifies errors.

## Error Categories

### RETRYABLE

Transient errors that can be retried with the same model/harness.

**Patterns:**
- `timeout` / `timed out`
- `rate limit` / `429` / `too many requests`
- `network error` / `ECONNREFUSED` / `ETIMEDOUT`
- `quota exceeded` / `insufficient credits`

**Recovery:**
1. Wait with exponential backoff (1s → 2s → 4s → 60s max)
2. Retry up to 3 times
3. If still failing, switch to next model in pool

### RECOVERABLE

Errors that require switching to a different model/harness.

**Patterns:**
- `model not found` / `unknown model` / `unsupported model`
- `cli not found` / `command not found`
- `parse error` / `invalid json`
- `missing artifact` / `incomplete output`

**Recovery:**
1. Log the error
2. Switch to next model in `model_pool`
3. Continue until successful or pool exhausted

### FATAL

System errors that require human intervention.

**Patterns:**
- `disk full` / `no space left` / `ENOSPC`
- `permission denied` / `EACCES`
- `authentication failed` / `invalid api key`
- `invalid yaml` / `yaml parse error`

**Recovery:**
1. Pause the story
2. Send Telegram notification
3. Wait for human intervention

### HUMAN_INPUT

Agent requires human confirmation.

**Patterns:**
- `please confirm`
- `should i proceed`
- `do you want me to`
- Questions ending with `?`

**Recovery:**
1. Forward to human via Telegram
2. Wait for response
3. Resume with input

## Error Classifier API

```typescript
import { classifier, ErrorType } from './errors/classifier';

// Classify an error
const classification = classifier.classify(error, context);

// Check error type
if (classification.category === ErrorType.RETRYABLE) {
  // Retry with backoff
}
```

## Fallback Chain

The supervisor tries models in order from `model_pool`:

```yaml
model_pool:
  create_story:
    - { harness: codex, model: gpt-5.4 }
    - { harness: opencode, model: openai/gpt-5.4 }
    - { harness: commandcode, model: openai/o4-mini }
```

**Fallback logic:**
1. Try first model (codex/gpt-5.4)
2. If RETRYABLE error, retry up to 3 times
3. If still failing, try next model (opencode/gpt-5.4)
4. Continue until successful or pool exhausted
5. If all fail, FATAL error

## Circuit Breaker

After configurable failures, the circuit opens:

```yaml
health:
  circuit_breaker_threshold: 3
```

**Behavior:**
1. After 3 consecutive failures, circuit opens
2. All workflows pause
3. Telegram notification sent
4. Requires manual intervention to resume

## Next Steps

- [Architecture](./architecture.md) - System design
- [Error Recovery](../how-to/error-recovery.md) - Manual recovery

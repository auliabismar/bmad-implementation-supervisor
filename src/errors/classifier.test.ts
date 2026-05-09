import { describe, it, expect } from 'bun:test';
import {
  classifyError,
  classifyFromStatus,
  shouldFallback,
  ErrorType,
  FallbackExhaustedError,
  ErrorClassifier,
} from './classifier';
import type { ErrorContext, ErrorClassification, WorkflowType } from './types';
import type { AgentResult, AgentStatus } from '../agents/harness/interface';

function createMockError(message: string): Error {
  return new Error(message);
}

function createMockContext(overrides?: Partial<ErrorContext>): ErrorContext {
  return {
    storyKey: '1-1-test',
    workflow: 'dev-story' as WorkflowType,
    attempt: 1,
    error: null,
    timestamp: new Date(),
    ...overrides,
  } as ErrorContext;
}

function createMockAgentResult(overrides: {
  status?: AgentStatus;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  retryAfterMs?: number;
}): AgentResult {
  return {
    status: 'failed' as AgentStatus,
    exitCode: 1,
    stdout: '',
    stderr: '',
    durationMs: 0,
    artifacts: [],
    retryAfterMs: undefined,
    ...overrides,
  } as AgentResult;
}

describe('Error Classifier', () => {
  describe('classifyError', () => {
    describe('RETRYABLE patterns', () => {
      it('classifies rate limit errors as RETRYABLE', () => {
        const err = createMockError('Rate limited by API');
        expect(classifyError(err, 'rate limit exceeded')).toBe(ErrorType.RETRYABLE);
        expect(classifyError(err, '429 Too Many Requests')).toBe(ErrorType.RETRYABLE);
      });

      it('classifies timeout errors as RETRYABLE', () => {
        const err = createMockError('Operation timed out');
        expect(classifyError(err, 'timed out after 30000ms')).toBe(ErrorType.RETRYABLE);
        expect(classifyError(err, 'timeout while waiting')).toBe(ErrorType.RETRYABLE);
      });

      it('classifies quota errors as RETRYABLE', () => {
        const err = createMockError('Quota exceeded');
        expect(classifyError(err, 'insufficient credits')).toBe(ErrorType.RETRYABLE);
        expect(classifyError(err, 'too many requests today')).toBe(ErrorType.RETRYABLE);
      });

      it('classifies network errors as RETRYABLE', () => {
        expect(classifyError(createMockError('ECONNREFUSED'), '')).toBe(ErrorType.RETRYABLE);
        expect(classifyError(createMockError('ETIMEDOUT'), '')).toBe(ErrorType.RETRYABLE);
        expect(classifyError(createMockError('ENOTFOUND'), '')).toBe(ErrorType.RETRYABLE);
        expect(classifyError(createMockError('Network error'), '')).toBe(ErrorType.RETRYABLE);
      });
    });

    describe('RECOVERABLE patterns', () => {
      it('classifies model not found as RECOVERABLE', () => {
        const err = createMockError('Model not available');
        expect(classifyError(err, 'model not found: gpt-99')).toBe(ErrorType.RECOVERABLE);
        expect(classifyError(err, 'unknown model: nonexistent')).toBe(ErrorType.RECOVERABLE);
      });

      it('classifies CLI/harness not found as RECOVERABLE', () => {
        const err = createMockError('Codex CLI not found');
        expect(classifyError(err, 'codex: command not found')).toBe(ErrorType.RECOVERABLE);
        expect(classifyError(err, 'failed to spawn cmd: ENOENT')).toBe(ErrorType.RECOVERABLE);
      });

      it('classifies spawn failures as RECOVERABLE', () => {
        const err = createMockError('Failed to spawn process');
        expect(classifyError(err, 'executable not found')).toBe(ErrorType.RECOVERABLE);
      });

      it('classifies parse errors as RECOVERABLE', () => {
        expect(classifyError(createMockError('Parse error'), '')).toBe(ErrorType.RECOVERABLE);
        expect(classifyError(createMockError('JSON error'), '')).toBe(ErrorType.RECOVERABLE);
      });

      it('classifies context window errors as RECOVERABLE', () => {
        expect(classifyError(createMockError('context window exceeded'), '')).toBe(ErrorType.RECOVERABLE);
      });
    });

    describe('FATAL patterns', () => {
      it('classifies disk full as FATAL', () => {
        expect(classifyError(createMockError('disk full'), '')).toBe(ErrorType.FATAL);
        expect(classifyError(createMockError('no space left'), '')).toBe(ErrorType.FATAL);
        expect(classifyError(createMockError('ENOSPC'), '')).toBe(ErrorType.FATAL);
      });

      it('classifies authentication failures as FATAL', () => {
        const err = createMockError('Auth failed');
        expect(classifyError(err, 'authentication failed: invalid API key')).toBe(ErrorType.FATAL);
        expect(classifyError(err, 'unauthorized: token expired')).toBe(ErrorType.FATAL);
        expect(classifyError(err, 'invalid token')).toBe(ErrorType.FATAL);
      });

      it('classifies permission errors as FATAL', () => {
        const err = createMockError('Permission denied');
        expect(classifyError(err, 'permission denied: read-only filesystem')).toBe(ErrorType.FATAL);
        expect(classifyError(err, 'access denied to resource')).toBe(ErrorType.FATAL);
        expect(classifyError(err, 'EACCES')).toBe(ErrorType.FATAL);
      });

      it('classifies YAML parse errors as FATAL', () => {
        expect(classifyError(createMockError('yaml parse error'), '')).toBe(ErrorType.FATAL);
        expect(classifyError(createMockError('invalid yaml'), '')).toBe(ErrorType.FATAL);
      });
    });

    describe('Unknown/Fallback to FATAL', () => {
      it('classifies unclassified errors as FATAL', () => {
        const err = createMockError('Some weird error');
        expect(classifyError(err, 'some unknown stderr')).toBe(ErrorType.FATAL);
      });

      it('classifies empty error as FATAL', () => {
        const err = createMockError('');
        expect(classifyError(err)).toBe(ErrorType.FATAL);
      });
    });

    describe('case-insensitivity', () => {
      it('matches patterns regardless of case', () => {
        const err = createMockError('RATE LIMIT EXCEEDED');
        expect(classifyError(err, '')).toBe(ErrorType.RETRYABLE);
      });
    });
  });

  describe('classifyFromStatus', () => {
    it('maps completed status to FATAL (dead code sentinel)', () => {
      expect(classifyFromStatus('completed')).toBe(ErrorType.FATAL);
    });

    it('maps retryable status to RETRYABLE', () => {
      expect(classifyFromStatus('retryable')).toBe(ErrorType.RETRYABLE);
    });

    it('maps timeout status to RETRYABLE', () => {
      expect(classifyFromStatus('timeout')).toBe(ErrorType.RETRYABLE);
    });

    it('maps failed status to RETRYABLE when stderr shows retryable', () => {
      expect(classifyFromStatus('failed', 'rate limit exceeded')).toBe(ErrorType.RETRYABLE);
      expect(classifyFromStatus('failed', 'network error')).toBe(ErrorType.RETRYABLE);
    });

    it('maps failed status to FATAL when stderr shows fatal', () => {
      expect(classifyFromStatus('failed', 'authentication failed')).toBe(ErrorType.FATAL);
      expect(classifyFromStatus('failed', 'permission denied')).toBe(ErrorType.FATAL);
      expect(classifyFromStatus('failed', 'disk full')).toBe(ErrorType.FATAL);
    });

    it('maps failed status to RECOVERABLE for unknown errors', () => {
      expect(classifyFromStatus('failed', 'syntax error')).toBe(ErrorType.RECOVERABLE);
      expect(classifyFromStatus('failed', 'some random failure')).toBe(ErrorType.RECOVERABLE);
    });

    it('maps needs_input to FATAL (cannot continue without human)', () => {
      expect(classifyFromStatus('needs_input')).toBe(ErrorType.FATAL);
    });
  });

  describe('shouldFallback', () => {
    it('returns true for RETRYABLE', () => {
      expect(shouldFallback(ErrorType.RETRYABLE)).toBe(true);
    });

    it('returns true for RECOVERABLE', () => {
      expect(shouldFallback(ErrorType.RECOVERABLE)).toBe(true);
    });

    it('returns false for FATAL', () => {
      expect(shouldFallback(ErrorType.FATAL)).toBe(false);
    });
  });

  describe('FallbackExhaustedError', () => {
    it('creates error with attempts and lastError', () => {
      const cause = new Error('Rate limit after all retries');
      const exhausted = new FallbackExhaustedError(3, cause);
      expect(exhausted.attempts).toBe(3);
      expect(exhausted.lastError).toBe(cause);
      expect(exhausted.message).toContain('All 3 fallback attempts exhausted');
      expect(exhausted.name).toBe('FallbackExhaustedError');
    });
  });

  describe('ErrorClassifier', () => {
    const classifier = new ErrorClassifier();

    describe('classify with AgentResult', () => {
      it('classifies timeout exit code as RETRYABLE', () => {
        const result = createMockAgentResult({
          status: 'failed',
          exitCode: 124,
          stdout: '',
          stderr: '',
        });
        const ctx = createMockContext();
        const classification = classifier.classify(result, ctx);
        expect(classification.category).toBe('RETRYABLE');
        expect(classification.action).toBe('RETRY');
        expect(classification.shouldRetry).toBe(true);
      });

      it('classifies human confirmation request as HUMAN_INPUT', () => {
        const result = createMockAgentResult({
          status: 'failed',
          stdout: 'Please confirm before proceeding?',
          stderr: '',
        });
        const ctx = createMockContext();
        const classification = classifier.classify(result, ctx);
        expect(classification.category).toBe('HUMAN_INPUT');
        expect(classification.action).toBe('WAIT_FOR_INPUT');
        expect(classification.shouldRetry).toBe(false);
        expect(classification.fallbackPossible).toBe(true);
      });

      it('classifies "should I proceed" as HUMAN_INPUT', () => {
        const result = createMockAgentResult({
          stderr: 'Should I proceed with the deployment?',
        });
        const classification = classifier.classify(result, createMockContext());
        expect(classification.category).toBe('HUMAN_INPUT');
      });

      it('classifies disk full as FATAL', () => {
        const result = createMockAgentResult({
          stderr: 'Error: disk full, cannot write',
        });
        const classification = classifier.classify(result, createMockContext());
        expect(classification.category).toBe('FATAL');
        expect(classification.action).toBe('ESCALATE');
        expect(classification.fallbackPossible).toBe(false);
      });

      it('classifies rate limit as RETRYABLE with backoff', () => {
        const result = createMockAgentResult({
          stderr: 'Rate limit exceeded (429)',
        });
        const classification = classifier.classify(result, createMockContext());
        expect(classification.category).toBe('RETRYABLE');
        expect(classification.retryableWithBackoff).toBe(true);
      });

      it('classifies context window error as RECOVERABLE', () => {
        const result = createMockAgentResult({
          stderr: 'Context window exceeded, model cannot process',
        });
        const classification = classifier.classify(result, createMockContext());
        expect(classification.category).toBe('RECOVERABLE');
        expect(classification.action).toBe('SWITCH_MODEL');
      });

      it('classifies unknown errors as RECOVERABLE', () => {
        const result = createMockAgentResult({
          stderr: 'Something unexpected happened',
        });
        const classification = classifier.classify(result, createMockContext());
        expect(classification.category).toBe('RECOVERABLE');
        expect(classification.action).toBe('SWITCH_MODEL');
        expect(classification.fallbackPossible).toBe(true);
      });

      it('classifies yaml parse error as FATAL', () => {
        const result = createMockAgentResult({
          stderr: 'YAML parse error: bad indentation',
        });
        const classification = classifier.classify(result, createMockContext());
        expect(classification.category).toBe('FATAL');
      });

      it('prioritizes HUMAN_INPUT over other categories', () => {
        const result = createMockAgentResult({
          stderr: 'Please confirm? disk full error also present',
        });
        const classification = classifier.classify(result, createMockContext());
        expect(classification.category).toBe('HUMAN_INPUT');
      });
    });

    describe('classify with Error object', () => {
      it('classifies network errors as RETRYABLE', () => {
        const err = createMockError('ECONNREFUSED: connection refused');
        const classification = classifier.classify(err, createMockContext());
        expect(classification.category).toBe('RETRYABLE');
      });

      it('classifies disk full as FATAL', () => {
        const err = createMockError('ENOSPC: no space left on device');
        const classification = classifier.classify(err, createMockContext());
        expect(classification.category).toBe('FATAL');
      });

      it('includes error message in reason', () => {
        const err = createMockError('timeout exceeded');
        const classification = classifier.classify(err, createMockContext());
        expect(classification.reason).toContain('timeout exceeded');
      });

      it('classifies permission denied as FATAL', () => {
        const err = createMockError('EACCES: permission denied');
        const classification = classifier.classify(err, createMockContext());
        expect(classification.category).toBe('FATAL');
      });

      it('classifies timeout errors with case insensitivity', () => {
        const err = createMockError('TIMEOUT ERROR');
        const classification = classifier.classify(err, createMockContext());
        expect(classification.category).toBe('RETRYABLE');
      });
    });

    describe('classification properties', () => {
      it('sets shouldRetry correctly for each category', () => {
        const retryable = createMockAgentResult({ stderr: 'timeout' });
        const recoverable = createMockAgentResult({ stderr: 'model not found' });
        const fatal = createMockAgentResult({ stderr: 'disk full' });
        const human = createMockAgentResult({ stderr: 'Should I proceed?' });

        expect(classifier.classify(retryable, createMockContext()).shouldRetry).toBe(true);
        expect(classifier.classify(recoverable, createMockContext()).shouldRetry).toBe(false);
        expect(classifier.classify(fatal, createMockContext()).shouldRetry).toBe(false);
        expect(classifier.classify(human, createMockContext()).shouldRetry).toBe(false);
      });

      it('sets fallbackPossible correctly', () => {
        const retryable = createMockAgentResult({ stderr: 'timeout' });
        const fatal = createMockAgentResult({ stderr: 'disk full' });

        expect(classifier.classify(retryable, createMockContext()).fallbackPossible).toBe(true);
        expect(classifier.classify(fatal, createMockContext()).fallbackPossible).toBe(false);
      });
    });

    describe('ErrorContext usage', () => {
      it('includes storyKey in classification reasoning', () => {
        const result = createMockAgentResult({ stderr: 'timeout' });
        const ctx = createMockContext({ storyKey: '3-1-error-classification' });
        const classification = classifier.classify(result, ctx);
        expect(classification.reason).toBeDefined();
      });

      it('includes workflow in context', () => {
        const result = createMockAgentResult({ stderr: 'error' });
        const ctx = createMockContext({ workflow: 'create-story' });
        const classification = classifier.classify(result, ctx);
        expect(classification).toBeDefined();
      });

      it('includes attempt in context', () => {
        const result = createMockAgentResult({ stderr: 'error' });
        const ctx = createMockContext({ attempt: 3 });
        const classification = classifier.classify(result, ctx);
        expect(classification).toBeDefined();
      });
    });
  });
});
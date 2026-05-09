import { describe, it, expect } from 'bun:test';
import {
  classifyError,
  classifyFromStatus,
  shouldFallback,
  ErrorType,
  FallbackExhaustedError,
} from './classifier';

describe('Error Classifier', () => {
  describe('classifyError', () => {
    describe('RETRYABLE patterns', () => {
      it('classifies rate limit errors as RETRYABLE', () => {
        const err = new Error('Rate limited by API');
        expect(classifyError(err, 'rate limit exceeded')).toBe(ErrorType.RETRYABLE);
        expect(classifyError(err, '429 Too Many Requests')).toBe(ErrorType.RETRYABLE);
      });

      it('classifies timeout errors as RETRYABLE', () => {
        const err = new Error('Operation timed out');
        expect(classifyError(err, 'timed out after 30000ms')).toBe(ErrorType.RETRYABLE);
        expect(classifyError(err, 'timeout while waiting')).toBe(ErrorType.RETRYABLE);
      });

      it('classifies quota errors as RETRYABLE', () => {
        const err = new Error('Quota exceeded');
        expect(classifyError(err, 'insufficient credits')).toBe(ErrorType.RETRYABLE);
        expect(classifyError(err, 'too many requests today')).toBe(ErrorType.RETRYABLE);
      });
    });

    describe('RECOVERABLE patterns', () => {
      it('classifies model not found as RECOVERABLE', () => {
        const err = new Error('Model not available');
        expect(classifyError(err, 'model not found: gpt-99')).toBe(ErrorType.RECOVERABLE);
        expect(classifyError(err, 'unknown model: nonexistent')).toBe(ErrorType.RECOVERABLE);
      });

      it('classifies CLI/harness not found as RECOVERABLE', () => {
        const err = new Error('Codex CLI not found');
        expect(classifyError(err, 'codex: command not found')).toBe(ErrorType.RECOVERABLE);
        expect(classifyError(err, 'failed to spawn cmd: ENOENT')).toBe(ErrorType.RECOVERABLE);
        expect(classifyError(err, 'spawn cmd EACCES')).toBe(ErrorType.RECOVERABLE);
      });

      it('classifies spawn failures as RECOVERABLE', () => {
        const err = new Error('Failed to spawn process');
        expect(classifyError(err, 'executable not found')).toBe(ErrorType.RECOVERABLE);
      });
    });

    describe('FATAL patterns', () => {
      it('classifies authentication failures as FATAL', () => {
        const err = new Error('Auth failed');
        expect(classifyError(err, 'authentication failed: invalid API key')).toBe(ErrorType.FATAL);
        expect(classifyError(err, 'unauthorized: token expired')).toBe(ErrorType.FATAL);
        expect(classifyError(err, 'invalid token')).toBe(ErrorType.FATAL);
      });

      it('classifies permission errors as FATAL', () => {
        const err = new Error('Permission denied');
        expect(classifyError(err, 'permission denied: read-only filesystem')).toBe(ErrorType.FATAL);
        expect(classifyError(err, 'access denied to resource')).toBe(ErrorType.FATAL);
      });
    });

    describe('Unknown/Fallback to FATAL', () => {
      it('classifies unclassified errors as FATAL', () => {
        const err = new Error('Some weird error');
        expect(classifyError(err, 'some unknown stderr')).toBe(ErrorType.FATAL);
      });

      it('classifies empty error as FATAL', () => {
        const err = new Error('');
        expect(classifyError(err)).toBe(ErrorType.FATAL);
      });
    });

    describe('case-insensitivity', () => {
      it('matches patterns regardless of case', () => {
        const err = new Error('RATE LIMIT EXCEEDED');
        expect(classifyError(err, '')).toBe(ErrorType.RETRYABLE);
      });
    });
  });

  describe('classifyFromStatus', () => {
    it('maps completed status to FATAL (dead code sentinel)', () => {
      // 'completed' should never reach classifyFromStatus since caller checks first,
      // but returning FATAL ensures no fallback is accidentally triggered
      expect(classifyFromStatus('completed')).toBe(ErrorType.FATAL);
    });

    it('maps retryable status to RETRYABLE', () => {
      expect(classifyFromStatus('retryable')).toBe(ErrorType.RETRYABLE);
    });

    it('maps timeout status to RETRYABLE', () => {
      expect(classifyFromStatus('timeout')).toBe(ErrorType.RETRYABLE);
    });

    it('maps failed status to RECOVERABLE when stderr shows recoverable', () => {
      expect(classifyFromStatus('failed', 'model not found')).toBe(ErrorType.RECOVERABLE);
      expect(classifyFromStatus('failed', 'codex: command not found')).toBe(ErrorType.RECOVERABLE);
    });

    it('maps failed status to FATAL when stderr shows fatal', () => {
      expect(classifyFromStatus('failed', 'authentication failed')).toBe(ErrorType.FATAL);
      expect(classifyFromStatus('failed', 'permission denied')).toBe(ErrorType.FATAL);
    });

    it('maps failed status to RECOVERABLE for unknown errors', () => {
      // Unknown errors (not matching retryable or fatal patterns) should be recoverable to allow fallback
      expect(classifyFromStatus('failed', 'syntax error')).toBe(ErrorType.RECOVERABLE);
      expect(classifyFromStatus('failed', 'some random failure')).toBe(ErrorType.RECOVERABLE);
    });

    it('maps failed status to FATAL for authentication and permission errors', () => {
      expect(classifyFromStatus('failed', 'authentication failed')).toBe(ErrorType.FATAL);
      expect(classifyFromStatus('failed', 'permission denied')).toBe(ErrorType.FATAL);
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
});

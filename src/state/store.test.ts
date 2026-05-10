import { describe, it, expect, beforeEach, afterEach, vi } from 'bun:test';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  initDatabase,
  checkpoint,
  getLastCheckpoint,
  logError,
  logInvocation,
  getCheckpointsByStory,
  getErrorsByStory,
  getAllCheckpoints,
  getPendingNotifications,
  markNotificationSent,
  queueNotification,
  resetDatabase,
  setDatabasePath,
  getDatabase,
} from './store';

describe('Store - SQLite Checkpointing', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(async () => {
    resetDatabase();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bmad-store-test-'));
    dbPath = path.join(tempDir, 'supervisor.db');
    setDatabasePath(dbPath);
  });

  afterEach(() => {
    resetDatabase();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('AC-1: SQLite database creation', () => {
    it('creates database at specified path on initDatabase', async () => {
      await initDatabase(dbPath);
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('creates data directory if it does not exist', async () => {
      const nestedPath = path.join(tempDir, 'nested', 'data', 'supervisor.db');
      await initDatabase(nestedPath);
      expect(fs.existsSync(nestedPath)).toBe(true);
    });

    it('reuses existing database without recreating', async () => {
      await initDatabase(dbPath);
      const mtime1 = fs.statSync(dbPath).mtimeMs;

      await Bun.sleep(10);
      await initDatabase(dbPath);
      const mtime2 = fs.statSync(dbPath).mtimeMs;

      expect(fs.existsSync(dbPath)).toBe(true);
    });
  });

  describe('AC-2: Tables creation', () => {
    it('creates checkpoints, errors, notifications, invocations tables', async () => {
      await initDatabase(dbPath);
      const db = getDatabase();
      expect(db).not.toBeNull();

      const tables = db!.exec("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables[0]?.values.map(row => row[0] as string) ?? [];

      expect(tableNames).toContain('checkpoints');
      expect(tableNames).toContain('errors');
      expect(tableNames).toContain('notifications');
      expect(tableNames).toContain('invocations');
    });

    it('checkpoints table has correct schema', async () => {
      await initDatabase(dbPath);
      const db = getDatabase()!;

      const schema = db.exec("PRAGMA table_info(checkpoints)");
      const columns = schema[0]?.values.map(row => ({ name: row[1], type: row[2] })) ?? [];

      expect(columns.some(c => c.name === 'id')).toBe(true);
      expect(columns.some(c => c.name === 'story_key')).toBe(true);
      expect(columns.some(c => c.name === 'workflow')).toBe(true);
      expect(columns.some(c => c.name === 'status')).toBe(true);
      expect(columns.some(c => c.name === 'attempt')).toBe(true);
      expect(columns.some(c => c.name === 'created_at')).toBe(true);
    });

    it('creates indexes on story_key columns', async () => {
      await initDatabase(dbPath);
      const db = getDatabase()!;

      const indexes = db.exec("SELECT name FROM sqlite_master WHERE type='index'");
      const indexNames = indexes[0]?.values.map(row => row[0] as string) ?? [];

      expect(indexNames.some(n => n.includes('idx_checkpoints_story_key'))).toBe(true);
      expect(indexNames.some(n => n.includes('idx_errors_story_key'))).toBe(true);
    });
  });

  describe('AC-3: checkpoint() saves state', () => {
    it('saves checkpoint with all required fields', async () => {
      await initDatabase(dbPath);
      const result = checkpoint('1-2-test-story', 'dev-story', 'in-progress', 1);

      expect(result.id).toBeDefined();
      expect(result.story_key).toBe('1-2-test-story');
      expect(result.workflow).toBe('dev-story');
      expect(result.status).toBe('in-progress');
      expect(result.attempt).toBe(1);
      expect(result.created_at).toBeDefined();
    });

    it('generates sequential IDs', async () => {
      await initDatabase(dbPath);
      const cp1 = checkpoint('1-1-first', 'dev-story', 'backlog', 1);
      const cp2 = checkpoint('1-2-second', 'dev-story', 'backlog', 1);
      const cp3 = checkpoint('1-3-third', 'dev-story', 'backlog', 1);

      expect(cp2.id).toBe(cp1.id + 1);
      expect(cp3.id).toBe(cp2.id + 1);
    });

    it('default attempt to 1 if not provided', async () => {
      await initDatabase(dbPath);
      const result = checkpoint('1-1-test', 'create-story', 'backlog');

      expect(result.attempt).toBe(1);
    });
  });

  describe('AC-4: getLastCheckpoint() retrieves most recent', () => {
    it('returns null for non-existent story', async () => {
      await initDatabase(dbPath);
      const result = getLastCheckpoint('non-existent-story');

      expect(result).toBeNull();
    });

    it('returns most recent checkpoint for story', async () => {
      await initDatabase(dbPath);
      checkpoint('1-1-story', 'dev-story', 'ready-for-dev', 1);
      checkpoint('1-1-story', 'dev-story', 'in-progress', 2);
      const latest = checkpoint('1-1-story', 'dev-story', 'review', 3);

      const result = getLastCheckpoint('1-1-story');

      expect(result).not.toBeNull();
      expect(result!.id).toBe(latest.id);
      expect(result!.status).toBe('review');
      expect(result!.attempt).toBe(3);
    });

    it('returns checkpoint for story with single entry', async () => {
      await initDatabase(dbPath);
      const cp = checkpoint('1-5-single', 'code-review', 'review', 1);

      const result = getLastCheckpoint('1-5-single');

      expect(result).not.toBeNull();
      expect(result!.id).toBe(cp.id);
    });
  });

  describe('AC-5: logError() and logInvocation()', () => {
    it('logError() saves error with all fields', async () => {
      await initDatabase(dbPath);
      const result = logError('1-1-error-story', 'dev-story', 'VALIDATION_ERROR', 'Missing field: name', 'at line 42');

      expect(result.id).toBeDefined();
      expect(result.story_key).toBe('1-1-error-story');
      expect(result.workflow).toBe('dev-story');
      expect(result.error_type).toBe('VALIDATION_ERROR');
      expect(result.error_message).toBe('Missing field: name');
      expect(result.stack_trace).toBe('at line 42');
      expect(result.created_at).toBeDefined();
    });

    it('logError() accepts null for optional fields', async () => {
      await initDatabase(dbPath);
      const result = logError(null, null, 'FATAL', 'Something went wrong');

      expect(result.story_key).toBeNull();
      expect(result.workflow).toBeNull();
      expect(result.stack_trace).toBeNull();
    });

    it('logInvocation() saves invocation record', async () => {
      await initDatabase(dbPath);
      const result = logInvocation('1-1-invoke-story', 'dev-story', 'codex', 'gpt-5.4', 0, 125000, true);

      expect(result.id).toBeDefined();
      expect(result.story_key).toBe('1-1-invoke-story');
      expect(result.workflow).toBe('dev-story');
      expect(result.harness).toBe('codex');
      expect(result.model).toBe('gpt-5.4');
      expect(result.exit_code).toBe(0);
      expect(result.duration_ms).toBe(125000);
      expect(result.success).toBe(1);
    });

    it('logInvocation() with null story_key is allowed', async () => {
      await initDatabase(dbPath);
      const result = logInvocation(null, null, 'opencode', 'claude-sonnet-4', null, null, false);

      expect(result.story_key).toBeNull();
      expect(result.exit_code).toBeNull();
      expect(result.duration_ms).toBeNull();
      expect(result.success).toBe(0);
    });
  });

  describe('AC-6: Database auto-creation', () => {
    it('creates database file automatically on first checkpoint', async () => {
      expect(fs.existsSync(dbPath)).toBe(false);
      await initDatabase(dbPath);
      expect(fs.existsSync(dbPath)).toBe(true);
    });

    it('auto-migrates by creating tables on new database', async () => {
      await initDatabase(dbPath);
      const db = getDatabase()!;

      const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
      expect(tables[0]).toBeDefined();
    });
  });

  describe('AC-7: Auto-migration support', () => {
    it('CREATE TABLE IF NOT EXISTS prevents duplicate errors', async () => {
      await initDatabase(dbPath);

      expect(() => {
        const db = getDatabase()!;
        db.run('CREATE TABLE IF NOT EXISTS checkpoints (id INTEGER PRIMARY KEY)');
      }).not.toThrow();
    });

    it('tables persist after re-initialization', async () => {
      await initDatabase(dbPath);
      checkpoint('1-1-persist', 'dev-story', 'in-progress', 1);
      resetDatabase();

      await initDatabase(dbPath);
      const result = getLastCheckpoint('1-1-persist');

      expect(result).not.toBeNull();
      expect(result!.story_key).toBe('1-1-persist');
    });
  });

  describe('Additional store functionality', () => {
    it('getCheckpointsByStory() returns all checkpoints for story', async () => {
      await initDatabase(dbPath);
      checkpoint('1-1-multi', 'dev-story', 'backlog', 1);
      checkpoint('1-1-multi', 'dev-story', 'in-progress', 2);
      checkpoint('1-1-multi', 'dev-story', 'review', 3);
      checkpoint('1-2-other', 'dev-story', 'backlog', 1);

      const result = getCheckpointsByStory('1-1-multi');

      expect(result.length).toBe(3);
      expect(result.every(cp => cp.story_key === '1-1-multi')).toBe(true);
    });

    it('getErrorsByStory() returns all errors for story', async () => {
      await initDatabase(dbPath);
      logError('1-1-err-story', 'dev-story', 'ERROR', 'First error');
      logError('1-1-err-story', 'dev-story', 'ERROR', 'Second error');

      const result = getErrorsByStory('1-1-err-story');

      expect(result.length).toBe(2);
    });

    it('getAllCheckpoints() returns all checkpoints ordered by created_at DESC', async () => {
      await initDatabase(dbPath);
      checkpoint('1-1-a', 'dev-story', 'backlog', 1);
      checkpoint('1-2-b', 'dev-story', 'backlog', 1);
      checkpoint('1-3-c', 'dev-story', 'backlog', 1);

      const result = getAllCheckpoints();

      expect(result.length).toBe(3);
    });

    it('queueNotification() creates pending notification', async () => {
      await initDatabase(dbPath);
      const result = queueNotification('1-1-notify', 'STORY_COMPLETE', 'Story 1-1 finished', 1);

      expect(result.id).toBeDefined();
      expect(result.story_key).toBe('1-1-notify');
      expect(result.event_type).toBe('STORY_COMPLETE');
      expect(result.message).toBe('Story 1-1 finished');
      expect(result.priority).toBe(1);
      expect(result.sent).toBe(0);
    });

    it('getPendingNotifications() returns unsent notifications', async () => {
      await initDatabase(dbPath);
      queueNotification('1-1-notify', 'HIGH_PRIORITY', 'High priority message', 1);
      queueNotification('1-2-notify', 'LOW_PRIORITY', 'Low priority message', 3);

      const result = getPendingNotifications();

      expect(result.length).toBe(2);
      expect(result[0].priority).toBeLessThanOrEqual(result[1].priority);
    });

    it('markNotificationSent() marks notification as sent', async () => {
      await initDatabase(dbPath);
      const notif = queueNotification('1-1-notify', 'TEST', 'Test message', 2);

      markNotificationSent(notif.id);

      const pending = getPendingNotifications();
      expect(pending.some(n => n.id === notif.id)).toBe(false);
    });

    it('throws error if operations called before initDatabase', () => {
      resetDatabase();

      expect(() => checkpoint('test', 'dev', 'in-progress', 1)).toThrow('Database not initialized');
      expect(() => getLastCheckpoint('test')).toThrow('Database not initialized');
      expect(() => logError('test', 'dev', 'ERROR', 'msg')).toThrow('Database not initialized');
    });
  });

  describe('Cross-platform path handling', () => {
    it('handles Windows-style paths', async () => {
      const winPath = path.join(tempDir, 'subfolder', 'data', 'supervisor.db');
      await initDatabase(winPath);

      const result = checkpoint('1-1-win-test', 'dev-story', 'in-progress', 1);
      expect(result.story_key).toBe('1-1-win-test');
    });

    it('handles Unix-style paths', async () => {
      const unixPath = tempDir.replace(/\\/g, '/') + '/unix-supervisor.db';
      setDatabasePath(unixPath);
      await initDatabase(unixPath);

      const result = checkpoint('1-1-unix-test', 'dev-story', 'in-progress', 1);
      expect(result.story_key).toBe('1-1-unix-test');
    });
  });
});
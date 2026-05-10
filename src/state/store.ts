import initSqlJs, { type Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';
import { resolveProjectPath } from '../utils/paths';

export interface CheckpointRecord {
  id: number;
  story_key: string;
  workflow: string;
  status: string;
  attempt: number;
  created_at: string;
}

export interface ErrorRecord {
  id: number;
  story_key: string;
  workflow: string;
  error_type: string;
  error_message: string;
  stack_trace: string | null;
  created_at: string;
}

export interface NotificationRecord {
  id: number;
  story_key: string | null;
  event_type: string;
  message: string;
  priority: number;
  sent: number;
  created_at: string;
}

export interface InvocationRecord {
  id: number;
  story_key: string | null;
  workflow: string | null;
  harness: string;
  model: string;
  exit_code: number | null;
  duration_ms: number | null;
  success: number;
  created_at: string;
}

let db: Database | null = null;
let dbPath: string | null = null;

export async function initDatabase(dbFilePath?: string): Promise<Database> {
  if (db && dbPath === (dbFilePath ?? getDefaultDbPath())) {
    return db;
  }

  const targetPath = dbFilePath ?? getDefaultDbPath();
  dbPath = targetPath;

  const SQL = await initSqlJs();

  try {
    if (fs.existsSync(targetPath)) {
      const fileBuffer = fs.readFileSync(targetPath);
      db = new SQL.Database(fileBuffer);
    } else {
      throw new Error('Database file does not exist');
    }
  } catch (error) {
    // Either file doesn't exist, was deleted after existsSync, or is corrupted
    db = new SQL.Database();
    createTables(db);
    createIndexes(db);
    enableWALMode(db);
    
    try {
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    } catch (mkdirErr) {
      console.warn('Failed to create database directory, it might already exist:', mkdirErr);
    }
    saveDatabase();
  }

  return db;
}

function getDefaultDbPath(): string {
  return resolveProjectPath('data', 'supervisor.db');
}

function createTables(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS checkpoints (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_key TEXT NOT NULL,
      workflow TEXT NOT NULL,
      status TEXT NOT NULL,
      attempt INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS errors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_key TEXT,
      workflow TEXT,
      error_type TEXT NOT NULL,
      error_message TEXT,
      stack_trace TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_key TEXT,
      event_type TEXT NOT NULL,
      message TEXT NOT NULL,
      priority INTEGER DEFAULT 2,
      sent INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  database.run(`
    CREATE TABLE IF NOT EXISTS invocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      story_key TEXT,
      workflow TEXT,
      harness TEXT NOT NULL,
      model TEXT NOT NULL,
      exit_code INTEGER,
      duration_ms INTEGER,
      success INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function createIndexes(database: Database): void {
  database.run('CREATE INDEX IF NOT EXISTS idx_checkpoints_story_key ON checkpoints(story_key);');
  database.run('CREATE INDEX IF NOT EXISTS idx_errors_story_key ON errors(story_key);');
  database.run('CREATE INDEX IF NOT EXISTS idx_notifications_story_key ON notifications(story_key);');
  database.run('CREATE INDEX IF NOT EXISTS idx_invocations_story_key ON invocations(story_key);');
}

function enableWALMode(_database: Database): void {
  // sql.js doesn't support WAL mode directly, but the interface is preserved for compatibility
}

export function saveDatabase(): void {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    
    // Write to a temporary file first, then rename for atomic write
    const tempPath = dbPath + '.tmp';
    fs.writeFileSync(tempPath, buffer);
    fs.renameSync(tempPath, dbPath);
  } catch (error) {
    console.error('Failed to save database atomically:', error);
    // Fallback to direct write if rename fails due to cross-device link etc
    try {
      const data = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    } catch (fallbackError) {
      console.error('Fallback database save also failed:', fallbackError);
    }
  }
}

export function getDatabase(): Database | null {
  return db;
}

export function checkpoint(storyKey: string, workflow: string, status: string, attempt: number = 1): CheckpointRecord {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  if (!storyKey || typeof storyKey !== 'string') {
    throw new Error('Invalid storyKey: must be a non-empty string');
  }
  if (!workflow || typeof workflow !== 'string') {
    throw new Error('Invalid workflow: must be a non-empty string');
  }
  if (!status || typeof status !== 'string') {
    throw new Error('Invalid status: must be a non-empty string');
  }
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new Error('Invalid attempt: must be a positive integer');
  }

  db.run(
    'INSERT INTO checkpoints (story_key, workflow, status, attempt) VALUES (?, ?, ?, ?)',
    [storyKey, workflow, status, attempt]
  );

  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result[0]?.values[0]?.[0] as number;

  const record = db.exec(
    `SELECT id, story_key, workflow, status, attempt, created_at FROM checkpoints WHERE id = ${id}`
  );

  saveDatabase();

  if (record[0]) {
    return {
      id: record[0].values[0][0] as number,
      story_key: record[0].values[0][1] as string,
      workflow: record[0].values[0][2] as string,
      status: record[0].values[0][3] as string,
      attempt: record[0].values[0][4] as number,
      created_at: record[0].values[0][5] as string,
    };
  }

  throw new Error('Failed to retrieve checkpoint after insert');
}

export function getLastCheckpoint(storyKey: string): CheckpointRecord | null {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  if (!storyKey || typeof storyKey !== 'string') {
    throw new Error('Invalid storyKey: must be a non-empty string');
  }

  const result = db.exec(
    'SELECT id, story_key, workflow, status, attempt, created_at FROM checkpoints WHERE story_key = ? ORDER BY id DESC LIMIT 1',
    [storyKey]
  );

  if (!result[0] || result[0].values.length === 0) {
    return null;
  }

  const row = result[0].values[0];
  return {
    id: row[0] as number,
    story_key: row[1] as string,
    workflow: row[2] as string,
    status: row[3] as string,
    attempt: row[4] as number,
    created_at: row[5] as string,
  };
}

export function logError(
  storyKey: string | null,
  workflow: string | null,
  errorType: string,
  errorMessage: string,
  stackTrace: string | null = null
): ErrorRecord {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  db.run(
    'INSERT INTO errors (story_key, workflow, error_type, error_message, stack_trace) VALUES (?, ?, ?, ?, ?)',
    [storyKey, workflow, errorType, errorMessage, stackTrace]
  );

  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result[0]?.values[0]?.[0] as number;

  const record = db.exec(
    `SELECT id, story_key, workflow, error_type, error_message, stack_trace, created_at FROM errors WHERE id = ${id}`
  );

  saveDatabase();

  if (record[0]) {
    const row = record[0].values[0];
    return {
      id: row[0] as number,
      story_key: row[1] as string,
      workflow: row[2] as string,
      error_type: row[3] as string,
      error_message: row[4] as string,
      stack_trace: row[5] as string | null,
      created_at: row[6] as string,
    };
  }

  throw new Error('Failed to retrieve error record after insert');
}

export function logInvocation(
  storyKey: string | null,
  workflow: string | null,
  harness: string,
  model: string,
  exitCode: number | null,
  durationMs: number | null,
  success: boolean
): InvocationRecord {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  db.run(
    'INSERT INTO invocations (story_key, workflow, harness, model, exit_code, duration_ms, success) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [storyKey, workflow, harness, model, exitCode, durationMs, success ? 1 : 0]
  );

  const result = db.exec('SELECT last_insert_rowid() as id');
  const id = result[0]?.values[0]?.[0] as number;

  const record = db.exec(
    `SELECT id, story_key, workflow, harness, model, exit_code, duration_ms, success, created_at FROM invocations WHERE id = ${id}`
  );

  saveDatabase();

  if (record[0]) {
    const row = record[0].values[0];
    return {
      id: row[0] as number,
      story_key: row[1] as string,
      workflow: row[2] as string,
      harness: row[3] as string,
      model: row[4] as string,
      exit_code: row[5] as number | null,
      duration_ms: row[6] as number | null,
      success: row[7] as number,
      created_at: row[8] as string,
    };
  }

  throw new Error('Failed to retrieve invocation record after insert');
}

export function getCheckpointsByStory(storyKey: string): CheckpointRecord[] {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  const result = db.exec(
    'SELECT id, story_key, workflow, status, attempt, created_at FROM checkpoints WHERE story_key = ? ORDER BY id DESC',
    [storyKey]
  );

  if (!result[0]) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    story_key: row[1] as string,
    workflow: row[2] as string,
    status: row[3] as string,
    attempt: row[4] as number,
    created_at: row[5] as string,
  }));
}

export function getErrorsByStory(storyKey: string): ErrorRecord[] {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  const result = db.exec(
    'SELECT id, story_key, workflow, error_type, error_message, stack_trace, created_at FROM errors WHERE story_key = ? ORDER BY id DESC',
    [storyKey]
  );

  if (!result[0]) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    story_key: row[1] as string,
    workflow: row[2] as string,
    error_type: row[3] as string,
    error_message: row[4] as string,
    stack_trace: row[5] as string | null,
    created_at: row[6] as string,
  }));
}

export function getAllCheckpoints(): CheckpointRecord[] {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  const result = db.exec('SELECT id, story_key, workflow, status, attempt, created_at FROM checkpoints ORDER BY created_at DESC');

  if (!result[0]) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    story_key: row[1] as string,
    workflow: row[2] as string,
    status: row[3] as string,
    attempt: row[4] as number,
    created_at: row[5] as string,
  }));
}

export function getPendingNotifications(): NotificationRecord[] {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  const result = db.exec(
    'SELECT id, story_key, event_type, message, priority, sent, created_at FROM notifications WHERE sent = 0 ORDER BY priority ASC, id ASC'
  );

  if (!result[0]) return [];

  return result[0].values.map(row => ({
    id: row[0] as number,
    story_key: row[1] as string | null,
    event_type: row[2] as string,
    message: row[3] as string,
    priority: row[4] as number,
    sent: row[5] as number,
    created_at: row[6] as string,
  }));
}

export function markNotificationSent(id: number): void {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid id: must be a positive integer');
  }

  db.run('UPDATE notifications SET sent = 1 WHERE id = ?', [id]);
  saveDatabase();
}

export function queueNotification(
  storyKey: string | null,
  eventType: string,
  message: string,
  priority: number = 2
): NotificationRecord {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }

  db.run(
    'INSERT INTO notifications (story_key, event_type, message, priority) VALUES (?, ?, ?, ?)',
    [storyKey, eventType, message, priority]
  );

  const result = db.exec('SELECT last_insert_rowid() as id');
  const newId = result[0]?.values[0]?.[0] as number;

  const record = db.exec(
    `SELECT id, story_key, event_type, message, priority, sent, created_at FROM notifications WHERE id = ${newId}`
  );

  saveDatabase();

  if (record[0]) {
    const row = record[0].values[0];
    return {
      id: row[0] as number,
      story_key: row[1] as string | null,
      event_type: row[2] as string,
      message: row[3] as string,
      priority: row[4] as number,
      sent: row[5] as number,
      created_at: row[6] as string,
    };
  }

  throw new Error('Failed to retrieve notification record after insert');
}

export function resetDatabase(): void {
  if (db) {
    db.close();
    db = null;
    dbPath = null;
  }
}

export function setDatabasePath(path: string): void {
  dbPath = path;
  db = null;
}
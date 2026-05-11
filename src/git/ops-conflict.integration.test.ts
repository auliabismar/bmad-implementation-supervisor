import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { execFileSync } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

interface ConflictResultSnapshot {
  hasConflicts: boolean;
  files?: Array<{ path: string; oursLines: number; theirsLines: number }>;
  notification?: { event: string; storyKey?: string };
  error?: string;
}

let repoDir = '';
let originalCwd = '';

function git(args: string[]): string {
  return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim();
}

function runDetectConflicts(branchName: string, storyKey?: string): ConflictResultSnapshot {
  const opsUrl = pathToFileURL(join(originalCwd, 'src/git/ops.ts')).href;
  const script = `
    const { detectConflicts } = await import(${JSON.stringify(opsUrl)});
    const result = await detectConflicts(${JSON.stringify(branchName)}, ${JSON.stringify({ storyKey })});
    console.log(JSON.stringify(result));
  `;

  return JSON.parse(execFileSync('bun', ['--eval', script], { cwd: repoDir, encoding: 'utf8' }));
}

async function writeRepoFile(path: string, content: string): Promise<void> {
  await writeFile(join(repoDir, path), content);
}

describe('detectConflicts integration', () => {
  beforeEach(async () => {
    originalCwd = process.cwd();
    repoDir = await mkdtemp(join(tmpdir(), 'bmad-conflict-'));
    git(['init']);
    git(['checkout', '-b', 'main']);
    git(['config', 'user.email', 'test@example.com']);
    git(['config', 'user.name', 'Test User']);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await rm(repoDir, { recursive: true, force: true });
  });

  it('detects real git conflicts, counts marker sections, and restores the feature branch', async () => {
    await writeRepoFile('file.txt', 'base\n');
    git(['add', 'file.txt']);
    git(['commit', '-m', 'base']);

    git(['checkout', '-b', 'feat/conflict']);
    await writeRepoFile('file.txt', 'feature\n');
    git(['commit', '-am', 'feature change']);

    git(['checkout', 'main']);
    await writeRepoFile('file.txt', 'main\n');
    git(['commit', '-am', 'main change']);

    git(['checkout', 'feat/conflict']);
    process.chdir(repoDir);

    const result = runDetectConflicts('feat/conflict', '5-4-conflict-detection');

    expect(result.hasConflicts).toBe(true);
    expect(result.files).toEqual([{ path: 'file.txt', oursLines: 1, theirsLines: 1 }]);
    expect(result.notification?.event).toBe('NEEDS_INPUT');
    expect(result.notification?.storyKey).toBe('5-4-conflict-detection');
    expect(git(['branch', '--show-current'])).toBe('feat/conflict');
    expect(git(['status', '--porcelain'])).toBe('');
  }, 15000);

  it('aborts a clean merge probe and restores the feature branch', async () => {
    await writeRepoFile('base.txt', 'base\n');
    git(['add', 'base.txt']);
    git(['commit', '-m', 'base']);

    git(['checkout', '-b', 'feat/clean']);
    await writeRepoFile('feature.txt', 'feature\n');
    git(['add', 'feature.txt']);
    git(['commit', '-m', 'feature file']);
    process.chdir(repoDir);

    const result = runDetectConflicts('feat/clean');

    expect(result.hasConflicts).toBe(false);
    expect(git(['branch', '--show-current'])).toBe('feat/clean');
    expect(git(['status', '--porcelain'])).toBe('');
  }, 15000);
});

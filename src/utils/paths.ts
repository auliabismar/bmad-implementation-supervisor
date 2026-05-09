import { resolve, join } from 'path';
import { getPlatform } from './platform';

export function normalizePath(p: string): string {
  return p.split(/[/\\]/).join(getPlatform().isWindows ? '\\' : '/');
}

export function safeJoin(...parts: string[]): string {
  const resolved = resolve(...parts);
  return resolved;
}

export function ensureTrailingSlash(p: string): string {
  const sep = getPlatform().isWindows ? '\\' : '/';
  return p.endsWith(sep) ? p : p + sep;
}

export function toUnixPath(p: string): string {
  return p.replace(/\\/g, '/');
}

export function resolveProjectPath(...parts: string[]): string {
  const root = process.cwd();
  return resolve(root, ...parts);
}

export function expandTilde(p: string): string {
  if (p.startsWith('~/') || p.startsWith('~\\')) {
    const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
    return join(home, p.slice(2));
  }
  return p;
}
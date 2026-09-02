import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { minimatch } from 'minimatch';
import type { DiscoveryPattern } from '../services/ruleDiscoveryPatterns';
import { IGNORED_DIRECTORIES } from '../services/ruleDiscoveryPatterns';
import type { WorkspaceAccess, WorkspaceFile } from '../services/workspaceAccess';
import { normalizeRelativePath } from '../utils/paths';

/** Stops a pathological tree from filling memory. */
const MAX_ENTRIES = 200_000;

const MATCH_OPTIONS = { dot: true } as const;

/**
 * Workspace relative path of `candidate`, or `undefined` when it escapes the
 * root. Comparison happens on resolved absolute paths, so `..`, mixed
 * separators and a different Windows drive are all rejected here rather than
 * by string inspection.
 */
export function containedRelativePath(root: string, candidate: string): string | undefined {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, candidate);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.length === 0) {
    return '';
  }
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return undefined;
  }
  return normalizeRelativePath(relative);
}

/** True when the real target of `absolutePath` is still inside the root. */
export async function realPathInside(root: string, absolutePath: string): Promise<boolean> {
  try {
    const realRoot = await fs.realpath(path.resolve(root));
    const real = await fs.realpath(absolutePath);
    return containedRelativePath(realRoot, real) !== undefined;
  } catch {
    return false;
  }
}

function isIgnoredDirectory(name: string): boolean {
  return IGNORED_DIRECTORIES.includes(name);
}

function matchesAny(relativePath: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => minimatch(relativePath, pattern, MATCH_OPTIONS));
}

/**
 * Workspace access backed by the filesystem, used by the local mode. The tree
 * is walked once and reused: every catalog pattern then filters the same list,
 * which keeps a forty pattern catalog at one traversal.
 */
export class NodeWorkspaceAccess implements WorkspaceAccess {
  readonly rootPath: string;
  private entries: WorkspaceFile[] | undefined;

  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
  }

  /** Drops the cached tree so the next lookup walks the filesystem again. */
  invalidate(): void {
    this.entries = undefined;
  }

  /** Every regular file inside the root, ignored folders already skipped. */
  async allFiles(): Promise<readonly WorkspaceFile[]> {
    if (this.entries === undefined) {
      this.entries = await this.walk();
    }
    return this.entries;
  }

  async findFiles(pattern: DiscoveryPattern): Promise<WorkspaceFile[]> {
    const files = await this.allFiles();
    const exclude = pattern.exclude ?? [];
    return files.filter(
      (file) =>
        minimatch(file.relativePath, pattern.include, MATCH_OPTIONS) &&
        !matchesAny(file.relativePath, exclude)
    );
  }

  async readTextFile(file: WorkspaceFile): Promise<string> {
    return fs.readFile(file.fsPath, 'utf8');
  }

  async exists(relativePath: string): Promise<boolean> {
    const relative = containedRelativePath(this.rootPath, relativePath);
    if (relative === undefined || relative.length === 0) {
      return false;
    }
    try {
      await fs.stat(path.join(this.rootPath, ...relative.split('/')));
      return true;
    } catch {
      return false;
    }
  }

  private async walk(): Promise<WorkspaceFile[]> {
    const files: WorkspaceFile[] = [];
    const queue: string[] = [''];

    while (queue.length > 0 && files.length < MAX_ENTRIES) {
      const directory = queue.shift() as string;
      const absolute =
        directory.length === 0 ? this.rootPath : path.join(this.rootPath, ...directory.split('/'));

      let listing;
      try {
        listing = await fs.readdir(absolute, { withFileTypes: true });
      } catch {
        continue;
      }

      for (const entry of listing) {
        const relativePath = directory.length === 0 ? entry.name : `${directory}/${entry.name}`;
        const entryPath = path.join(absolute, entry.name);

        if (entry.isDirectory()) {
          if (!isIgnoredDirectory(entry.name)) {
            queue.push(relativePath);
          }
          continue;
        }

        if (entry.isSymbolicLink()) {
          // Symlinked directories are never descended into, which rules out
          // cycles; a symlinked file is read only when its target stays inside
          // the workspace.
          if (!(await this.isContainedFile(entryPath))) {
            continue;
          }
          files.push({ relativePath, fsPath: entryPath });
          continue;
        }

        if (entry.isFile()) {
          files.push({ relativePath, fsPath: entryPath });
        }
      }
    }

    files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    return files;
  }

  private async isContainedFile(absolutePath: string): Promise<boolean> {
    if (!(await realPathInside(this.rootPath, absolutePath))) {
      return false;
    }
    try {
      return (await fs.stat(absolutePath)).isFile();
    } catch {
      return false;
    }
  }
}

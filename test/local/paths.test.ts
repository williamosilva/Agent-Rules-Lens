import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  NodeWorkspaceAccess,
  containedRelativePath,
  realPathInside
} from '../../src/adapters/nodeWorkspaceAccess';
import { LocalSession } from '../../src/local/session';
import { SAMPLE_ROOT } from '../helpers';

const root = mkdtempSync(join(tmpdir(), 'arl-paths-'));
const outside = mkdtempSync(join(tmpdir(), 'arl-outside-'));

mkdirSync(join(root, 'src', 'a folder'), { recursive: true });
writeFileSync(join(root, 'AGENTS.md'), '# root\n');
writeFileSync(join(root, 'src', 'a folder', 'with space.ts'), 'export {};\n');
writeFileSync(join(outside, 'secret.md'), 'private\n');

/** Symlinks need elevation on some Windows setups; skip only when refused. */
function trySymlink(target: string, link: string, type: 'file' | 'junction'): boolean {
  try {
    symlinkSync(target, link, type);
    return true;
  } catch {
    return false;
  }
}

const internalLink = trySymlink(join(root, 'AGENTS.md'), join(root, 'linked-AGENTS.md'), 'file');
const escapingLink = trySymlink(join(outside, 'secret.md'), join(root, 'escape.md'), 'file');
// A directory junction needs no elevation on Windows, so the escape case is
// still covered on a machine that refuses file symlinks.
const escapingDir = trySymlink(outside, join(root, 'escape-dir'), 'junction');

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

describe('path containment', () => {
  it('accepts a plain relative path', () => {
    expect(containedRelativePath(root, 'src/index.ts')).toBe('src/index.ts');
  });

  it('accepts a path with spaces', () => {
    expect(containedRelativePath(root, 'src/a folder/with space.ts')).toBe(
      'src/a folder/with space.ts'
    );
  });

  it('normalizes mixed separators', () => {
    expect(containedRelativePath(root, 'src\\a folder/with space.ts')).toBe(
      'src/a folder/with space.ts'
    );
  });

  it.each([
    ['..'],
    ['../secret.md'],
    ['src/../../secret.md'],
    ['./../../etc/passwd']
  ])('rejects traversal: %s', (candidate) => {
    expect(containedRelativePath(root, candidate)).toBeUndefined();
  });

  it('rejects an absolute path outside the root', () => {
    expect(containedRelativePath(root, join(outside, 'secret.md'))).toBeUndefined();
  });

  it.runIf(process.platform === 'win32')('rejects another Windows drive', () => {
    const other = root.startsWith('Z:') ? 'Y:\\secret.md' : 'Z:\\secret.md';
    expect(containedRelativePath(root, other)).toBeUndefined();
  });

  it.runIf(process.platform === 'win32')('rejects a UNC path', () => {
    expect(containedRelativePath(root, '\\\\server\\share\\secret.md')).toBeUndefined();
  });

  it('resolves an absolute path that is inside the root', () => {
    expect(containedRelativePath(root, join(root, 'AGENTS.md'))).toBe('AGENTS.md');
  });

  it('treats the root itself as empty, never as a file', () => {
    expect(containedRelativePath(root, '.')).toBe('');
  });
});

describe('session file resolution', () => {
  const session = new LocalSession(root);

  it('accepts a regular file inside the workspace', async () => {
    await expect(session.resolveFile('AGENTS.md')).resolves.toBe('AGENTS.md');
  });

  it.each([
    ['../secret.md'],
    ['..%2Fsecret.md'],
    ['%2e%2e/secret.md'],
    ['....//secret.md']
  ])('refuses traversal shaped input: %s', async (candidate) => {
    await expect(session.resolveFile(candidate)).resolves.toBeUndefined();
  });

  it('refuses an absolute path from outside', async () => {
    await expect(session.resolveFile(join(outside, 'secret.md'))).resolves.toBeUndefined();
  });

  it('refuses a file that does not exist', async () => {
    await expect(session.resolveFile('nope.md')).resolves.toBeUndefined();
  });

  it('refuses a directory used as a file', async () => {
    await expect(session.resolveFile('src')).resolves.toBeUndefined();
  });

  it('refuses an unknown artifact handle', async () => {
    await expect(session.preview('deadbeefdeadbeefdeadbeef')).resolves.toBe('unknown-handle');
  });
});

describe('symlinks', () => {
  it.runIf(internalLink)('keeps a symlink whose target is inside the root', async () => {
    expect(await realPathInside(root, join(root, 'linked-AGENTS.md'))).toBe(true);
    const files = await new NodeWorkspaceAccess(root).allFiles();
    expect(files.map((file) => file.relativePath)).toContain('linked-AGENTS.md');
  });

  it.runIf(escapingLink)('drops a symlink that escapes the root', async () => {
    expect(await realPathInside(root, join(root, 'escape.md'))).toBe(false);
    const files = await new NodeWorkspaceAccess(root).allFiles();
    expect(files.map((file) => file.relativePath)).not.toContain('escape.md');
  });

  it.runIf(escapingDir)('never walks into a linked directory that leaves the root', async () => {
    const files = await new NodeWorkspaceAccess(root).allFiles();
    expect(files.map((file) => file.relativePath)).not.toContain('escape-dir/secret.md');
    expect(await realPathInside(root, join(root, 'escape-dir', 'secret.md'))).toBe(false);
  });

  it('reports a missing target as outside', async () => {
    expect(await realPathInside(root, join(root, 'does-not-exist.md'))).toBe(false);
  });
});

describe('preview limits', () => {
  it('refuses a file larger than the preview cap', async () => {
    const big = mkdtempSync(join(tmpdir(), 'arl-big-'));
    try {
      writeFileSync(join(big, 'AGENTS.md'), 'x'.repeat(600 * 1024));
      const session = new LocalSession(big);
      await session.load();
      const model = session.analyze({ file: 'AGENTS.md' });
      const handle = model.sections[0]?.rules[0]?.fsPath;
      expect(handle).toBeDefined();
      await expect(session.preview(handle as string)).resolves.toBe('too-large');
    } finally {
      rmSync(big, { recursive: true, force: true });
    }
  });

  it('returns a relative path and never an absolute one', async () => {
    const session = new LocalSession(SAMPLE_ROOT);
    await session.load();
    const model = session.analyze({ file: 'src/backend/order.service.ts' });
    const handle = model.sections[0]?.rules[0]?.fsPath as string;
    const result = await session.preview(handle);
    expect(typeof result).not.toBe('string');
    if (typeof result !== 'string') {
      expect(result.relativePath).toBe('AGENTS.md');
      expect(result.content.length).toBeGreaterThan(0);
    }
  });

  it('hands the browser handles, not filesystem paths', async () => {
    const session = new LocalSession(SAMPLE_ROOT);
    await session.load();
    const model = session.analyze({ file: 'src/backend/order.service.ts' });
    for (const section of model.sections) {
      for (const rule of section.rules) {
        expect(rule.fsPath).toMatch(/^[0-9a-f]{24}$/);
      }
    }
  });

  it('invalidates handles from a previous analysis', async () => {
    const session = new LocalSession(SAMPLE_ROOT);
    await session.load();
    const first = session.analyze({ file: 'src/backend/order.service.ts' });
    const stale = first.sections[0]?.rules[0]?.fsPath as string;
    session.analyze({ file: 'src/frontend/OrderCard.tsx' });
    await expect(session.preview(stale)).resolves.toBe('unknown-handle');
  });
});

describe('file search', () => {
  it('caps the number of results', async () => {
    const session = new LocalSession(SAMPLE_ROOT);
    await expect(session.searchFiles('', 5)).resolves.toHaveLength(5);
  });

  it('matches every term of the query', async () => {
    const session = new LocalSession(SAMPLE_ROOT);
    const files = await session.searchFiles('backend order');
    expect(files).toContain('src/backend/order.service.ts');
  });

  it('never lists an ignored directory', async () => {
    const session = new LocalSession(join(SAMPLE_ROOT, '..', '..'));
    const files = await session.searchFiles('node_modules');
    expect(files).toEqual([]);
  });
});

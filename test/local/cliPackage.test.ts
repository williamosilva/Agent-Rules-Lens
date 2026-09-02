import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = resolve(__dirname, '..', '..');
const CLI_DIR = join(REPO_ROOT, 'cli');

const rootManifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
  version: string;
  scripts: Record<string, string>;
  bin?: unknown;
};
const cliManifest = JSON.parse(readFileSync(join(CLI_DIR, 'package.json'), 'utf8')) as Record<
  string,
  unknown
>;

/**
 * The real contents of the tarball `npm run cli:pack` produced, read with the
 * built-in gzip and a tar header walk. No external tool and no shell, so the
 * result is the same on every platform.
 */
function packedFiles(): string[] {
  const tarball = readdirSync(CLI_DIR).find((name) => name.endsWith('.tgz'));
  if (tarball === undefined) {
    throw new Error('No tarball in cli/. Run: npm run cli:pack');
  }
  const tar = gunzipSync(readFileSync(join(CLI_DIR, tarball)));
  const names: string[] = [];

  for (let offset = 0; offset + 512 <= tar.length; ) {
    const name = tar.toString('utf8', offset, offset + 100).replace(/\0.*$/, '');
    if (name.length === 0) {
      break;
    }
    const size = parseInt(tar.toString('ascii', offset + 124, offset + 136).replace(/\0.*$/, '').trim(), 8) || 0;
    const type = tar.toString('ascii', offset + 156, offset + 157);
    if (type === '0' || type === '') {
      names.push(name.split('\\').join('/'));
    }
    // Header block, then the content rounded up to the next 512 boundary.
    offset += 512 + Math.ceil(size / 512) * 512;
  }

  return names
    .filter((name) => name.startsWith('package/'))
    .map((name) => name.slice('package/'.length))
    .sort();
}

describe('cli manifest', () => {
  it('declares everything a published package needs', () => {
    for (const field of [
      'name',
      'version',
      'description',
      'license',
      'repository',
      'bugs',
      'homepage',
      'engines',
      'type',
      'bin',
      'files',
      'keywords'
    ]) {
      expect(cliManifest, field).toHaveProperty(field);
    }
    expect(cliManifest['name']).toBe('agent-rules-lens');
    expect((cliManifest['engines'] as { node: string }).node).toBe('>=18');
  });

  it('is no longer private, and carries no lifecycle hook', () => {
    expect(cliManifest['private']).toBeUndefined();
    const scripts = (cliManifest['scripts'] ?? {}) as Record<string, string>;
    for (const hook of ['postinstall', 'preinstall', 'install', 'prepare', 'prepublish']) {
      expect(scripts[hook], hook).toBeUndefined();
    }
  });

  it('keeps its version in step with the extension', () => {
    expect(cliManifest['version']).toBe(rootManifest.version);
  });

  it('exposes both command names', () => {
    const bin = cliManifest['bin'] as Record<string, string>;
    expect(Object.keys(bin).sort()).toEqual(['agent-rules-lens', 'arl']);
    expect(bin['arl']).toBe(bin['agent-rules-lens']);
  });

  it('leaves the extension manifest without a bin field', () => {
    expect(rootManifest.bin).toBeUndefined();
  });

  it('has build, pack and check scripts', () => {
    expect(rootManifest.scripts['cli:build']).toBeDefined();
    expect(rootManifest.scripts['cli:pack']).toContain('npm pack');
    expect(rootManifest.scripts['cli:check']).toBeDefined();
    // Development linking keeps working.
    expect(rootManifest.scripts['local:link']).toContain('npm link');
  });
});

describe('cli wrapper', () => {
  const wrapper = readFileSync(join(CLI_DIR, 'bin', 'arl.mjs'), 'utf8');

  it('starts with a unix shebang', () => {
    expect(wrapper.startsWith('#!/usr/bin/env node')).toBe(true);
  });

  it('resolves the bundle from its own URL, never from an absolute path', () => {
    expect(wrapper).toContain('import.meta.url');
    expect(wrapper).not.toMatch(/[A-Za-z]:\\\\/);
    expect(wrapper).not.toContain(REPO_ROOT);
  });

  it('accepts both the packaged and the development layout', () => {
    expect(wrapper).toContain("join(here, '..', 'dist', 'cli.cjs')");
    expect(wrapper).toContain("join(here, '..', '..', 'out', 'local', 'cli.js')");
  });
});

describe('cli tarball', () => {
  const files = packedFiles();

  it('ships the executable, the bundle and the dashboard assets', () => {
    for (const required of [
      'bin/arl.mjs',
      'dist/cli.cjs',
      'media/local/index.html',
      'media/local/local.css',
      'media/local/local.js',
      'media/shared/rulesRenderer.js',
      'media/rules.css',
      'media/agent-rules-lens.svg',
      'package.json',
      'LICENSE',
      'README.md',
      'THIRD_PARTY_NOTICES.md'
    ]) {
      expect(files, required).toContain(required);
    }
    expect(files.some((file) => file.startsWith('media/icons/agents/'))).toBe(true);
  });

  it('ships nothing outside the allow-list', () => {
    for (const file of files) {
      expect(
        file === 'package.json' ||
          file === 'LICENSE' ||
          file === 'README.md' ||
          file === 'THIRD_PARTY_NOTICES.md' ||
          file === 'bin/arl.mjs' ||
          file === 'dist/cli.cjs' ||
          file.startsWith('media/'),
        file
      ).toBe(true);
    }
  });

  it.each([
    ['src/'],
    ['test/'],
    ['fixtures'],
    ['.vscode'],
    ['.vsix'],
    ['.map'],
    ['.tgz'],
    ['examples/'],
    ['scripts/'],
    ['docs/']
  ])('excludes %s', (fragment) => {
    expect(files.filter((file) => file.includes(fragment))).toEqual([]);
  });

  it('carries no absolute path inside its own files', () => {
    for (const file of ['bin/arl.mjs', 'package.json']) {
      const content = readFileSync(join(CLI_DIR, file), 'utf8');
      expect(content, file).not.toContain(REPO_ROOT);
      expect(content, file).not.toMatch(/C:\\\\Users/);
    }
  });

  it('bakes the version into the bundle so --version reads no file', () => {
    const bundle = readFileSync(join(CLI_DIR, 'dist', 'cli.cjs'), 'utf8');
    expect(bundle).toContain(`"${rootManifest.version}"`);
    expect(bundle).not.toContain(REPO_ROOT);
  });

  it('serves every icon the inventory expects', () => {
    const packaged = new Set(
      files
        .filter((file) => file.startsWith('media/icons/agents/'))
        .map((file) => file.slice('media/icons/agents/'.length))
    );
    const source = readdirSync(join(REPO_ROOT, 'media', 'icons', 'agents'));
    for (const name of source) {
      expect(packaged, name).toContain(name);
    }
  });
});

describe('the built cli package', () => {
  it('has a bundle and assets inside its own directory', () => {
    expect(existsSync(join(CLI_DIR, 'dist', 'cli.cjs'))).toBe(true);
    expect(existsSync(join(CLI_DIR, 'media', 'local', 'index.html'))).toBe(true);
    expect(statSync(join(CLI_DIR, 'dist', 'cli.cjs')).size).toBeGreaterThan(1000);
  });

  it('answers --version and --help without a server', () => {
    const run = (args: string[]): string =>
      execFileSync(process.execPath, [join(CLI_DIR, 'bin', 'arl.mjs'), ...args], {
        encoding: 'utf8',
        shell: false
      });
    expect(run(['--version']).trim()).toMatch(/^(\d+\.\d+\.\d+|dev)$/);
    expect(run(['--help'])).toContain('arl <directory>');
  });
});

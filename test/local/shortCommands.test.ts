import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseArgs, resolveTarget } from '../../src/local/cli';
import { SAMPLE_ROOT } from '../helpers';

const REPO_ROOT = resolve(__dirname, '..', '..');

/** A project whose path contains a space, like a real Windows checkout. */
const spaced = mkdtempSync(join(tmpdir(), 'arl short '));
mkdirSync(join(spaced, 'src', 'a folder'), { recursive: true });
writeFileSync(join(spaced, 'AGENTS.md'), '# rules');
writeFileSync(join(spaced, 'src', 'a folder', 'app one.ts'), 'export {};');

const elsewhere = mkdtempSync(join(tmpdir(), 'arl-elsewhere-'));
writeFileSync(join(elsewhere, 'stray.ts'), 'export {};');

afterAll(() => {
  rmSync(spaced, { recursive: true, force: true });
  rmSync(elsewhere, { recursive: true, force: true });
});

const target = (argv: string[], cwd: string): ReturnType<typeof resolveTarget> =>
  resolveTarget(parseArgs(argv), cwd);

describe('arl with no arguments', () => {
  it('analyzes the directory the terminal is in', async () => {
    await expect(target([], spaced)).resolves.toEqual({ workspace: realish(spaced) });
  });

  it('defaults to process.cwd() when no directory is given', async () => {
    const resolved = await resolveTarget(parseArgs([]));
    expect(resolved.workspace.toLowerCase()).toBe(realish(process.cwd()).toLowerCase());
    expect(resolved.file).toBeUndefined();
  });

  it('needs no --workspace', () => {
    expect(parseArgs([]).workspace).toBeUndefined();
  });
});

describe('positional argument', () => {
  it('reads a file as the file, with the terminal directory as the project', async () => {
    await expect(target(['src/a folder/app one.ts'], spaced)).resolves.toEqual({
      workspace: realish(spaced),
      file: join('src', 'a folder', 'app one.ts')
    });
  });

  it('reads a directory as the project', async () => {
    await expect(target([spaced], elsewhere)).resolves.toEqual({ workspace: realish(spaced) });
  });

  it('reads "." as the current directory', async () => {
    await expect(target(['.'], spaced)).resolves.toEqual({ workspace: realish(spaced) });
  });

  it('accepts an absolute file inside the current directory', async () => {
    await expect(
      target([join(spaced, 'AGENTS.md')], spaced)
    ).resolves.toEqual({ workspace: realish(spaced), file: 'AGENTS.md' });
  });

  it('refuses a file from another project instead of guessing a root', async () => {
    await expect(target([join(elsewhere, 'stray.ts')], spaced)).rejects.toThrow(
      /is outside the current directory[\s\S]*arl --workspace/
    );
  });

  it('reports a path that does not exist', async () => {
    await expect(target(['nope.ts'], spaced)).rejects.toThrow(/^Not found: /);
  });

  it('refuses two bare arguments', async () => {
    await expect(target(['a.ts', 'b.ts'], spaced)).rejects.toThrow(
      /Too many arguments[\s\S]*arl <file> or arl <directory>/
    );
  });

  it('refuses a file given twice', async () => {
    await expect(target(['AGENTS.md', '--file', 'AGENTS.md'], spaced)).rejects.toThrow(
      'Pass a file either as an argument or with --file, not both.'
    );
  });
});

describe('advanced flags still work', () => {
  it('keeps --workspace and --file', async () => {
    await expect(
      target(['--workspace', spaced, '--file', 'AGENTS.md'], elsewhere)
    ).resolves.toEqual({ workspace: realish(spaced), file: 'AGENTS.md' });
  });

  it('takes a bare file as the file when --workspace is given', async () => {
    await expect(target(['--workspace', spaced, 'AGENTS.md'], elsewhere)).resolves.toEqual({
      workspace: realish(spaced),
      file: 'AGENTS.md'
    });
  });

  it('keeps --port, --no-open, --locale and --json', () => {
    const options = parseArgs(['--port', '4317', '--no-open', '--locale', 'pt-BR', '--json']);
    expect(options).toMatchObject({ port: 4317, open: false, locale: 'pt-BR', json: true });
  });

  it('still rejects an unknown flag but not a bare path', () => {
    expect(() => parseArgs(['--nope'])).toThrow('Unknown option: --nope');
    expect(parseArgs(['src/app.ts']).positional).toEqual(['src/app.ts']);
  });
});

describe('command aliases and scripts', () => {
  const cliManifest = JSON.parse(
    readFileSync(join(REPO_ROOT, 'cli', 'package.json'), 'utf8')
  ) as { name: string; bin: Record<string, string>; private?: boolean };
  const rootManifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    scripts: Record<string, string>;
    bin?: unknown;
  };

  it('exposes both aliases from the CLI package', () => {
    expect(Object.keys(cliManifest.bin).sort()).toEqual(['agent-rules-lens', 'arl']);
    expect(cliManifest.bin['arl']).toBe(cliManifest.bin['agent-rules-lens']);
  });

  it('links under the name the README tells you to unlink', () => {
    expect(cliManifest.name).toBe('agent-rules-lens');
  });

  it('ships a wrapper with a unix shebang and no absolute path', () => {
    const wrapper = readFileSync(join(REPO_ROOT, 'cli', 'bin', 'arl.mjs'), 'utf8');
    expect(wrapper.startsWith('#!/usr/bin/env node')).toBe(true);
    // Located from the wrapper's own URL, so npm can link it anywhere.
    expect(wrapper).toContain('import.meta.url');
    expect(wrapper).not.toContain(REPO_ROOT);
    expect(wrapper).toContain('npm run cli:build');
  });

  it('keeps bin out of the extension manifest', () => {
    // A bin entry would ship a dangling reference inside the VSIX, because the
    // bundle it points at is excluded from the package.
    expect(rootManifest.bin).toBeUndefined();
  });

  it('defines the short scripts', () => {
    expect(rootManifest.scripts['dev']).toContain('out/local/cli.js');
    expect(rootManifest.scripts['local:link']).toContain('npm link');
    expect(rootManifest.scripts['install:local']).toContain('scripts/install-local.mjs');
  });

  it('points demo at the sample workspace and the backend file', () => {
    const demo = rootManifest.scripts['demo'] ?? '';
    expect(demo).toContain('examples/sample-workspace');
    expect(demo).toContain('src/backend/order.service.ts');
  });
});

describe('demo target resolves', () => {
  it('finds the sample workspace and its backend file', async () => {
    await expect(
      target(
        ['--workspace', 'examples/sample-workspace', '--file', 'src/backend/order.service.ts'],
        REPO_ROOT
      )
    ).resolves.toEqual({
      workspace: realish(SAMPLE_ROOT),
      file: 'src/backend/order.service.ts'
    });
  });
});

/** realpath as the CLI applies it, so temp folder symlinks do not fail a match. */
function realish(value: string): string {
  return require('node:fs').realpathSync(resolve(value));
}

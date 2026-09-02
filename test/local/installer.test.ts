import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findCliEntryPoint,
  installExtension,
  resolveCodeLauncher,
  runInstall,
  vsixNameFor,
  type CommandResult,
  type InstallerHost,
  type RunOptions
} from '../../src/local/installer';
import { createUi, type UiStream } from '../../src/local/installUi';

const REPO_ROOT = resolve(__dirname, '..', '..');

/** Everything a call to the host carried, so nothing is asserted by string. */
interface Recorded {
  command: string;
  args: readonly string[];
  options?: RunOptions;
}

/** A Windows install whose path contains a space, like the reported one. */
const VS_ROOT = 'C:\\Users\\Will\\AppData\\Local\\Programs\\Microsoft VS Code';
const CODE_CMD = `${VS_ROOT}\\bin\\code.cmd`;
const CODE_EXE = `${VS_ROOT}\\Code.exe`;
const BUILD_ID = '08d4889f9e';
const NESTED_ENTRY = `${VS_ROOT}\\${BUILD_ID}\\resources\\app\\out\\cli.js`;
const CLASSIC_ENTRY = `${VS_ROOT}\\resources\\app\\out\\cli.js`;

const REPO = 'C:\\Projects\\Agent Rules Lens';
const VSIX = `${REPO}\\agent-rules-lens-0.1.0.vsix`;
const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const OPTIONS = { repositoryRoot: REPO, name: 'agent-rules-lens', version: '0.1.0' };

/** Which of the four steps a recorded call belongs to. */
type StepKey = 'local-tools' | 'compile' | 'package' | 'lookup' | 'install';

function classify(entry: Recorded): StepKey | undefined {
  const joined = entry.args.join(' ');
  if (entry.command === 'where' || entry.command === 'which') {
    return 'lookup';
  }
  if (joined.includes('esbuild.local.mjs')) {
    return 'local-tools';
  }
  if (joined.includes('esbuild.mjs')) {
    return 'compile';
  }
  if (joined.includes('vsce')) {
    return 'package';
  }
  if (entry.args.includes('--install-extension')) {
    return 'install';
  }
  return undefined;
}

interface FakeOptions {
  platform?: NodeJS.Platform;
  codePath?: string | undefined;
  files?: string[];
  directories?: Record<string, string[]>;
  /** Exit status per step; anything absent succeeds. */
  status?: Partial<Record<StepKey, number>>;
  stdout?: Partial<Record<StepKey, string>>;
  stderr?: Partial<Record<StepKey, string>>;
  spawnError?: Partial<Record<StepKey, string>>;
  env?: NodeJS.ProcessEnv;
  repositoryRoot?: string;
}

/**
 * A host that records instead of executing. Nothing in this suite may reach a
 * real editor, a real build or the user's extensions folder.
 */
function fakeHost(options: FakeOptions = {}): InstallerHost & {
  commands: Recorded[];
  steps: () => (StepKey | undefined)[];
} {
  const commands: Recorded[] = [];
  const platform = options.platform ?? 'win32';
  const codePath = 'codePath' in options ? options.codePath : CODE_CMD;
  const root = options.repositoryRoot ?? REPO;
  const files = new Set(
    options.files ?? [`${root}\\agent-rules-lens-0.1.0.vsix`, CODE_EXE, NESTED_ENTRY]
  );
  const directories = options.directories ?? { [VS_ROOT]: [BUILD_ID, 'bin'] };
  let clock = 1_000;

  return {
    commands,
    steps: () => commands.map(classify),
    platform,
    execPath: NODE,
    env: options.env ?? { PATH: 'C:\\Windows\\System32' },
    exists: (file) => files.has(file),
    listDirectories: (directory) => directories[directory] ?? [],
    realpath: (target) => target,
    now: () => (clock += 100),
    run(command, args, runOptions): CommandResult {
      const entry: Recorded = {
        command,
        args,
        ...(runOptions === undefined ? {} : { options: runOptions })
      };
      commands.push(entry);

      const key = classify(entry);
      if (key === 'lookup') {
        return codePath === undefined ? { status: 1 } : { status: 0, stdout: `${codePath}\n` };
      }
      return {
        status: key === undefined ? 0 : options.status?.[key] ?? 0,
        ...(key !== undefined && options.stdout?.[key] !== undefined
          ? { stdout: options.stdout[key] as string }
          : {}),
        ...(key !== undefined && options.stderr?.[key] !== undefined
          ? { stderr: options.stderr[key] as string }
          : {}),
        ...(key !== undefined && options.spawnError?.[key] !== undefined
          ? { error: options.spawnError[key] as string }
          : {})
      };
    }
  };
}

function captureUi(isTTY = false): { ui: ReturnType<typeof createUi>; text: () => string } {
  const chunks: string[] = [];
  const stream: UiStream = { isTTY, write: (text) => void chunks.push(text) };
  return { ui: createUi({ stream, color: false, animate: false }), text: () => chunks.join('') };
}

/** The install call, which is always the last thing a successful run reaches. */
function installCall(host: { commands: Recorded[] }): Recorded {
  return host.commands.filter((entry) => classify(entry) === 'install')[0] as Recorded;
}

describe('vsix naming', () => {
  it('follows the name and version in package.json', () => {
    expect(vsixNameFor('agent-rules-lens', '0.1.0')).toBe('agent-rules-lens-0.1.0.vsix');
  });

  it('uses the real manifest values', () => {
    const manifest = JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
      name: string;
      version: string;
    };
    expect(vsixNameFor(manifest.name, manifest.version)).toBe('agent-rules-lens-0.1.2.vsix');
  });
});

describe('finding the CLI entry point', () => {
  it('takes the classic layout when it is there', () => {
    const host = fakeHost({ files: [CLASSIC_ENTRY], directories: {} });
    expect(findCliEntryPoint(host, VS_ROOT)).toBe(CLASSIC_ENTRY);
  });

  it('falls back to the build id folder current installers use', () => {
    expect(findCliEntryPoint(fakeHost(), VS_ROOT)).toBe(NESTED_ENTRY);
  });

  it('is deterministic when several build folders exist', () => {
    const host = fakeHost({
      files: [`${VS_ROOT}\\aaa\\resources\\app\\out\\cli.js`, NESTED_ENTRY],
      directories: { [VS_ROOT]: ['zzz', BUILD_ID, 'aaa'] }
    });
    // Sorted by name, so the same folder wins on every run.
    expect(findCliEntryPoint(host, VS_ROOT)).toBe(NESTED_ENTRY);
  });

  it('reports nothing when no layout matches', () => {
    expect(findCliEntryPoint(fakeHost({ files: [], directories: {} }), VS_ROOT)).toBeUndefined();
  });
});

describe('resolving the launcher on Windows', () => {
  it('derives Code.exe and the entry point from a shim path with spaces', () => {
    expect(resolveCodeLauncher(fakeHost())).toMatchObject({
      kind: 'ready',
      executable: CODE_EXE,
      args: [NESTED_ENTRY]
    });
  });

  it('sets ELECTRON_RUN_AS_NODE and clears VSCODE_DEV, like code.cmd does', () => {
    const host = fakeHost({ env: { PATH: 'p', VSCODE_DEV: '1', OTHER: 'keep' } });
    const launcher = resolveCodeLauncher(host);
    if (launcher.kind !== 'ready') {
      throw new Error('expected a ready launcher');
    }
    expect(launcher.env['ELECTRON_RUN_AS_NODE']).toBe('1');
    expect('VSCODE_DEV' in launcher.env).toBe(false);
    expect(launcher.env['OTHER']).toBe('keep');
  });

  it('reports a missing Code.exe', () => {
    expect(resolveCodeLauncher(fakeHost({ files: [VSIX, NESTED_ENTRY] }))).toEqual({
      kind: 'missing-executable',
      expected: CODE_EXE
    });
  });

  it('reports a missing entry point using the documented path', () => {
    const host = fakeHost({ files: [VSIX, CODE_EXE], directories: {} });
    expect(resolveCodeLauncher(host)).toEqual({
      kind: 'missing-entry-point',
      expected: CLASSIC_ENTRY
    });
  });

  it('reports nothing when the lookup fails', () => {
    expect(resolveCodeLauncher(fakeHost({ codePath: undefined }))).toEqual({ kind: 'not-found' });
  });

  it('runs the binary directly on other platforms', () => {
    const host = fakeHost({ platform: 'darwin', codePath: '/usr/local/bin/code' });
    expect(resolveCodeLauncher(host)).toMatchObject({
      kind: 'ready',
      executable: '/usr/local/bin/code',
      args: []
    });
  });
});

describe('the install step', () => {
  it('passes the four arguments separately, with no shell', () => {
    const host = fakeHost();
    const result = installExtension(host, VSIX);

    expect(result.code).toBe(0);
    const call = installCall(host);
    expect(call.command).toBe(CODE_EXE);
    expect(call.args).toEqual([NESTED_ENTRY, '--install-extension', VSIX, '--force']);
    expect(call.options?.shell).toBe(false);
    expect(call.options?.env?.['ELECTRON_RUN_AS_NODE']).toBe('1');
  });

  it('never goes through cmd', () => {
    const host = fakeHost();
    installExtension(host, VSIX);
    for (const entry of host.commands) {
      expect(entry.command).not.toBe('cmd');
      expect(entry.command).not.toBe('cmd.exe');
      expect(entry.args).not.toContain('/c');
    }
  });

  it('reports a missing VSIX without running anything', () => {
    const host = fakeHost({ files: [CODE_EXE, NESTED_ENTRY] });
    expect(installExtension(host, VSIX)).toMatchObject({
      code: 1,
      problem: 'missing-vsix',
      detail: VSIX
    });
    expect(host.commands).toEqual([]);
  });

  it('keeps the exit code and the output of a refused install', () => {
    const host = fakeHost({
      status: { install: 3 },
      stderr: { install: 'Unable to install extension: invalid manifest' },
      stdout: { install: 'Installing extensions...' }
    });
    const result = installExtension(host, VSIX);
    expect(result.code).toBe(3);
    expect(result.output).toContain('Unable to install extension: invalid manifest');
    expect(result.output).toContain('Installing extensions...');
  });
});

describe('the four steps', () => {
  it('runs local tools, compile, package and install, in that order', () => {
    const host = fakeHost();
    const { ui } = captureUi();
    expect(runInstall(host, ui, OPTIONS)).toBe(0);
    expect(host.steps()).toEqual(['local-tools', 'compile', 'package', 'lookup', 'install']);
  });

  it('runs every build step through Node, never through npm or a shell', () => {
    const host = fakeHost();
    const { ui } = captureUi();
    runInstall(host, ui, OPTIONS);
    for (const entry of host.commands) {
      expect(entry.command).not.toMatch(/npm/);
      expect(entry.options?.shell).not.toBe(true);
    }
    const build = host.commands.filter((entry) =>
      ['local-tools', 'compile', 'package'].includes(classify(entry) as string)
    );
    expect(build).toHaveLength(3);
    for (const entry of build) {
      expect(entry.command).toBe(NODE);
      expect(entry.options?.shell).toBe(false);
    }
  });

  it('prints a compact success report', () => {
    const host = fakeHost();
    const { ui, text } = captureUi();
    runInstall(host, ui, OPTIONS);
    const out = text();

    expect(out).toContain('Agent Rules Lens\nLocal installation');
    expect(out).toContain('✓ [1/4] Local tools built');
    expect(out).toContain('✓ [2/4] Extension compiled');
    expect(out).toContain('✓ [3/4] VSIX packaged');
    expect(out).toContain('✓ [4/4] Installed in VS Code');
    expect(out).toContain('✓ Agent Rules Lens 0.1.0 installed successfully');
    expect(out).toContain('Developer: Reload Window');
    expect(out).toContain(VSIX);
    // Nothing from the subprocesses leaks into a clean run.
    expect(out).not.toContain('esbuild');
    expect(out).not.toContain('vsce');
  });

  it('hides subprocess output on success but captures it', () => {
    const host = fakeHost({
      stdout: {
        'local-tools': '  out\\local\\cli.js  278kb',
        package: 'DONE Packaged: ... (50 files)'
      }
    });
    const { ui, text } = captureUi();
    runInstall(host, ui, OPTIONS);
    expect(text()).not.toContain('278kb');
    expect(text()).not.toContain('50 files');
    for (const entry of host.commands.filter((e) => classify(e) !== 'lookup')) {
      expect(entry.options?.stdio).toBe('pipe');
    }
  });

  it.each([
    ['local-tools' as const, 1, 'Building the local tools'],
    ['compile' as const, 2, 'Compiling the extension'],
    ['package' as const, 3, 'Packaging the VSIX']
  ])('stops at step %s and keeps the exit code', (step, position, label) => {
    const host = fakeHost({
      status: { [step]: 7 },
      stderr: { [step]: 'the real reason it broke' },
      stdout: { [step]: 'some progress output' }
    });
    const { ui, text } = captureUi();

    expect(runInstall(host, ui, OPTIONS)).toBe(7);
    const out = text();
    expect(out).toContain(`✗ [${position}/4] ${label}`);
    expect(out).toContain(`${label} failed.`);
    expect(out).toContain('Exit code:');
    expect(out).toContain('7');
    expect(out).toContain('the real reason it broke');
    expect(out).toContain('some progress output');
    // Later steps never start.
    expect(host.steps()).not.toContain('install');
    expect(out).not.toContain('installed successfully');
  });

  it('names the logical command of a failed step', () => {
    const host = fakeHost({ status: { package: 1 } });
    const { ui, text } = captureUi();
    runInstall(host, ui, OPTIONS);
    expect(text()).toContain('vsce package --no-dependencies');
    expect(text()).toContain('Run the command above on its own to see the full output.');
  });

  it('reports a failure at the install step with everything needed to debug it', () => {
    const host = fakeHost({
      status: { install: 5 },
      stderr: { install: 'extension is not compatible' }
    });
    const { ui, text } = captureUi();

    expect(runInstall(host, ui, OPTIONS)).toBe(5);
    const out = text();
    expect(out).toContain('✗ [4/4] Installation failed');
    expect(out).toContain('VS Code could not install the extension.');
    expect(out).toContain(CODE_EXE);
    expect(out).toContain(NESTED_ENTRY);
    expect(out).toContain('--install-extension');
    expect(out).toContain('--force');
    expect(out).toContain('extension is not compatible');
    expect(out).toContain(VSIX);
  });

  it('keeps a spawn failure message', () => {
    const host = fakeHost({ status: { install: 1 }, spawnError: { install: 'ENOENT Code.exe' } });
    const { ui, text } = captureUi();
    runInstall(host, ui, OPTIONS);
    expect(text()).toContain('ENOENT Code.exe');
  });

  it.each([
    [{ codePath: undefined }, 'VS Code CLI was not found.'],
    [{ files: [VSIX, NESTED_ENTRY] }, 'VS Code executable was not found:'],
    [{ files: [VSIX, CODE_EXE], directories: {} }, 'VS Code CLI entry point was not found:']
  ])('explains a broken VS Code installation (%#)', (overrides, expected) => {
    const host = fakeHost(overrides as FakeOptions);
    const { ui, text } = captureUi();
    expect(runInstall(host, ui, OPTIONS)).not.toBe(0);
    const out = text();
    expect(out).toContain(expected);
    expect(out).toContain('Extensions → ... → Install from VSIX');
  });

  it('says nothing extra when the CLI wrote nothing to stderr', () => {
    const host = fakeHost({ stdout: { install: "Extension 'x.vsix' was successfully installed." } });
    const { ui, text } = captureUi();
    expect(runInstall(host, ui, OPTIONS)).toBe(0);
    const out = text();
    expect(out).toContain('installed successfully');
    expect(out).not.toContain('non-blocking warning');
    expect(out).not.toContain('--verbose');
  });
});

/** A real Node deprecation notice, as the VS Code CLI emits it on success. */
const DEP_WARNING = [
  '(node:9760) [DEP0169] DeprecationWarning: `url.parse()` behavior is not standardized',
  'and prone to errors that have security implications. Use the WHATWG URL API instead.',
  '(Use `node --trace-deprecation ...` to show where the warning was created)'
].join('\n');

describe('a warning on a successful install', () => {
  it('summarises it in two lines instead of reproducing it', () => {
    const host = fakeHost({ stderr: { install: DEP_WARNING } });
    const { ui, text } = captureUi();

    expect(runInstall(host, ui, OPTIONS)).toBe(0);
    const out = text();
    expect(out).toContain('✓ Agent Rules Lens 0.1.0 installed successfully');
    expect(out).toContain('! VS Code CLI emitted a non-blocking warning.');
    expect(out).toContain('  Run with --verbose to see details.');
  });

  it('never leaks the raw notice, the PID or the deprecation code', () => {
    const host = fakeHost({ stderr: { install: DEP_WARNING } });
    const { ui, text } = captureUi();
    runInstall(host, ui, OPTIONS);
    const out = text();
    for (const fragment of [
      'url.parse',
      'DEP0169',
      'node:9760',
      'DeprecationWarning',
      'trace-deprecation',
      'security implications'
    ]) {
      expect(out, fragment).not.toContain(fragment);
    }
  });

  it('reproduces it unchanged under --verbose', () => {
    const host = fakeHost({ stderr: { install: DEP_WARNING } });
    const { ui, text } = captureUi();

    expect(runInstall(host, ui, { ...OPTIONS, verbose: true })).toBe(0);
    const out = text();
    expect(out).toContain(DEP_WARNING);
    expect(out).toContain('url.parse');
    expect(out).toContain('DEP0169');
    expect(out).not.toContain('non-blocking warning');
  });

  it.each([
    ['a single line'],
    ['some\nmultiline\nnote'],
    ['   padded with spaces   '],
    ['nothing about deprecations at all']
  ])('summarises any stderr content, not just DEP0169: %j', (stderr) => {
    const host = fakeHost({ stderr: { install: stderr } });
    const { ui, text } = captureUi();

    expect(runInstall(host, ui, OPTIONS)).toBe(0);
    const out = text();
    expect(out).toContain('! VS Code CLI emitted a non-blocking warning.');
    expect(out).not.toContain(stderr.trim());
  });

  it.each([[''], ['   '], ['\n\n']])('treats blank stderr as no warning: %j', (stderr) => {
    const host = fakeHost({ stderr: { install: stderr } });
    const { ui, text } = captureUi();

    expect(runInstall(host, ui, OPTIONS)).toBe(0);
    expect(text()).not.toContain('non-blocking warning');
  });

  it('still shows everything when the exit code is not zero', () => {
    const host = fakeHost({
      status: { install: 4 },
      stderr: { install: DEP_WARNING },
      stdout: { install: 'Installing extensions...' }
    });
    const { ui, text } = captureUi();

    expect(runInstall(host, ui, OPTIONS)).toBe(4);
    const out = text();
    expect(out).toContain('VS Code could not install the extension.');
    expect(out).toContain('DEP0169');
    expect(out).toContain('url.parse');
    expect(out).toContain('Installing extensions...');
    expect(out).toContain('Exit code:');
    expect(out).toContain(CODE_EXE);
    expect(out).toContain('--install-extension');
    expect(out).not.toContain('non-blocking warning');
  });

  it('keeps the summary free of ANSI when the output is piped', () => {
    const host = fakeHost({ stderr: { install: DEP_WARNING } });
    const { ui, text } = captureUi(false);
    runInstall(host, ui, OPTIONS);
    expect(text()).not.toContain('\u001b');
    expect(text()).not.toContain('\r');
  });

  it('invents no warning during a dry run', () => {
    const host = fakeHost({ stderr: { install: DEP_WARNING } });
    const { ui, text } = captureUi();

    expect(runInstall(host, ui, { ...OPTIONS, dryRun: true })).toBe(0);
    const out = text();
    expect(out).toContain('Dry run complete. Nothing was installed.');
    expect(out).not.toContain('non-blocking warning');
    expect(out).not.toContain('DEP0169');
  });

  it('captures the CLI output rather than inheriting the terminal', () => {
    const host = fakeHost({ stderr: { install: DEP_WARNING } });
    const { ui } = captureUi();
    runInstall(host, ui, { ...OPTIONS, verbose: true });
    expect(installCall(host).options?.stdio).toBe('pipe');
  });
});

describe('verbose mode', () => {
  it('lets the build steps write straight to the terminal', () => {
    const host = fakeHost();
    const { ui } = captureUi();
    runInstall(host, ui, { ...OPTIONS, verbose: true });
    for (const entry of host.commands.filter((e) =>
      ['local-tools', 'compile', 'package'].includes(classify(e) as string)
    )) {
      expect(entry.options?.stdio).toBe('inherit');
    }
  });

  it('captures the build steps in normal mode', () => {
    const host = fakeHost();
    const { ui } = captureUi();
    runInstall(host, ui, OPTIONS);
    for (const entry of host.commands.filter((e) =>
      ['local-tools', 'compile', 'package'].includes(classify(e) as string)
    )) {
      expect(entry.options?.stdio).toBe('pipe');
    }
  });
});

describe('dry run', () => {
  it('builds and packages but installs nothing', () => {
    const host = fakeHost();
    const { ui, text } = captureUi();

    expect(runInstall(host, ui, { ...OPTIONS, dryRun: true })).toBe(0);
    expect(host.steps()).toEqual(['local-tools', 'compile', 'package']);
    const out = text();
    expect(out).toContain('– [4/4] Installation skipped');
    expect(out).toContain('dry run');
    expect(out).toContain('Dry run complete. Nothing was installed.');
    expect(out).toContain(VSIX);
    expect(out).not.toContain('installed successfully');
  });

  it('still fails when a build step fails', () => {
    const host = fakeHost({ status: { compile: 2 } });
    const { ui } = captureUi();
    expect(runInstall(host, ui, { ...OPTIONS, dryRun: true })).toBe(2);
  });
});

describe('paths with spaces and metacharacters', () => {
  it.each([
    ['C:\\Repos\\a & b\\lens'],
    ['C:\\Repos\\lens (2026)\\build'],
    ['C:\\Repos\\100%%\\caret^dir'],
    ['C:\\Repos\\quote"dir'],
    ["C:\\Repos\\it's here"],
    ['C:\\Users\\Will\\Desktop\\Projetos\\Pessoais\\Agent Rules Lens']
  ])('passes %s through untouched', (repositoryRoot) => {
    const host = fakeHost({ repositoryRoot });
    const { ui } = captureUi();
    expect(runInstall(host, ui, { ...OPTIONS, repositoryRoot })).toBe(0);

    const vsix = `${repositoryRoot}\\agent-rules-lens-0.1.0.vsix`;
    const call = installCall(host);
    // Exactly as given: no quoting, no escaping, no splitting.
    expect(call.args).toEqual([NESTED_ENTRY, '--install-extension', vsix, '--force']);
    expect(call.options?.shell).toBe(false);
    for (const entry of host.commands) {
      for (const arg of entry.args) {
        expect(arg).not.toContain('" "');
      }
    }
  });

  it('handles a VS Code installed under a path with metacharacters', () => {
    const root = 'C:\\Program Files (x86)\\VS & Code';
    const exe = `${root}\\Code.exe`;
    const entry = `${root}\\resources\\app\\out\\cli.js`;
    const host = fakeHost({
      codePath: `${root}\\bin\\code.cmd`,
      files: [VSIX, exe, entry],
      directories: {}
    });
    const { ui } = captureUi();
    runInstall(host, ui, OPTIONS);
    const call = installCall(host);
    expect(call.command).toBe(exe);
    expect(call.args).toEqual([entry, '--install-extension', VSIX, '--force']);
  });
});

describe('installer safety', () => {
  const script = readFileSync(join(REPO_ROOT, 'scripts', 'install-local.mjs'), 'utf8');
  const source = readFileSync(join(REPO_ROOT, 'src', 'local', 'installer.ts'), 'utf8');
  const main = readFileSync(join(REPO_ROOT, 'src', 'local', 'installMain.ts'), 'utf8');

  it('never asks for a shell', () => {
    for (const file of [source, script, main]) {
      expect(file).not.toContain('shell: true');
    }
    expect(source).toContain('shell: false');
    expect(script).toContain('shell: false');
  });

  it('never builds a command line by interpolation', () => {
    expect(source).not.toMatch(/`"\$\{/);
    expect(source).not.toMatch(/['"]\/c['"]/);
    expect(source).not.toMatch(/['"]cmd(\.exe)?['"]/);
  });

  it('never runs npm, npm.cmd or a shell wrapper', () => {
    for (const file of [source, main]) {
      expect(file).not.toContain('npm.cmd');
      expect(file).not.toMatch(/powershell|pwsh/i);
    }
  });

  it('never searches the machine for a vsix', () => {
    expect(source).not.toMatch(/glob|\*\.vsix/);
  });

  it('only lists directories inside a resolved VS Code root', () => {
    expect(source.match(/readdirSync\(/g) ?? []).toHaveLength(1);
  });

  it('never deletes anything', () => {
    expect(source).not.toMatch(/\b(unlinkSync|rmSync|rmdirSync|rimraf)\b/);
  });

  it('never edits PATH', () => {
    expect(source).not.toMatch(/env\['PATH'\]\s*=|env\.PATH\s*=/);
  });

  it('never swallows a failure with an empty catch', () => {
    // The three catches that exist all return a value the caller checks.
    expect(source).not.toMatch(/catch\s*\{\s*\}/);
  });

  it('clears the spinner in a finally block, including on Ctrl+C', () => {
    expect(main).toContain('SIGINT');
    expect(main).toContain('} finally {');
    expect(main).toContain('ui.stop()');
  });

  it('is not wired into npm lifecycle hooks', () => {
    const scripts = (
      JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    for (const hook of ['postinstall', 'preinstall', 'prepare', 'prepublish']) {
      expect(scripts[hook]).toBeUndefined();
    }
  });

  it('makes install:local a single entry point and keeps the plain scripts', () => {
    const scripts = (
      JSON.parse(readFileSync(join(REPO_ROOT, 'package.json'), 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts;

    expect(scripts['install:local']).toBe('node scripts/install-local.mjs');
    expect(scripts['install:local:dry']).toBe('node scripts/install-local.mjs --dry-run');
    // The detailed commands stay exactly as they were for direct use.
    expect(scripts['compile']).toBe('node esbuild.mjs');
    expect(scripts['local:build']).toBe('node esbuild.local.mjs');
    expect(scripts['package']).toBe('npm run compile && vsce package --no-dependencies');
    expect(scripts['vscode:prepublish']).toBe('npm run compile');
  });
});

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import * as path from 'node:path';
import { formatDuration, type Ui } from './installUi';

export interface CommandResult {
  status: number;
  stdout?: string;
  stderr?: string;
  /** Set when the process could not be started at all. */
  error?: string;
}

export interface RunOptions {
  env?: NodeJS.ProcessEnv;
  stdio?: 'inherit' | 'pipe';
  shell?: boolean;
  cwd?: string;
}

/** Everything the installer touches, so tests can run it without a real editor. */
export interface InstallerHost {
  run(command: string, args: readonly string[], options?: RunOptions): CommandResult;
  exists(file: string): boolean;
  /** Immediate subdirectory names, used only inside a resolved VS Code root. */
  listDirectories(directory: string): string[];
  realpath(target: string): string;
  platform: NodeJS.Platform;
  env: NodeJS.ProcessEnv;
  /** Node itself, used to run this project's own build scripts. */
  execPath: string;
  now(): number;
}

const MANUAL_INSTALL = `Alternatively, install the generated VSIX from:
Extensions → ... → Install from VSIX`;

/** A resolved way to run the VS Code CLI, or the reason there isn't one. */
export type CodeLauncher =
  | {
      kind: 'ready';
      executable: string;
      /** Leading arguments, before the install flags. */
      args: string[];
      env: NodeJS.ProcessEnv;
    }
  | { kind: 'not-found' }
  | { kind: 'missing-executable'; expected: string }
  | { kind: 'missing-entry-point'; expected: string };

/** Whatever the child process said, without inventing a message when it was quiet. */
export function outputOf(result: CommandResult): string {
  return [result.error, result.stderr, result.stdout]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0)
    .join('\n');
}

function whichCode(host: InstallerHost): string | undefined {
  const finder = host.platform === 'win32' ? 'where' : 'which';
  const found = host.run(finder, ['code']);
  if (found.status !== 0) {
    return undefined;
  }
  const candidates = (found.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  // `where` lists the extensionless shell script before `code.cmd`; the shim is
  // the one that names the installation layout.
  return host.platform === 'win32'
    ? candidates.find((line) => /\.(cmd|exe|bat)$/i.test(line)) ?? candidates[0]
    : candidates[0];
}

/**
 * Entry point `code.cmd` hands to Code.exe. Official builds ship it either
 * directly under `resources` or, on current Windows installers, under a build
 * id folder. Only the resolved installation root is inspected, one level deep.
 */
export function findCliEntryPoint(host: InstallerHost, root: string): string | undefined {
  const classic = path.join(root, 'resources', 'app', 'out', 'cli.js');
  if (host.exists(classic)) {
    return classic;
  }
  for (const child of [...host.listDirectories(root)].sort()) {
    const nested = path.join(root, child, 'resources', 'app', 'out', 'cli.js');
    if (host.exists(nested)) {
      return nested;
    }
  }
  return undefined;
}

/**
 * Resolves how to launch the VS Code CLI.
 *
 * On Windows the `code` shim is a batch file, and handing it to `cmd /c` breaks
 * as soon as the installation path contains a space. Instead the shim is used
 * only to locate the installation, and `Code.exe` is executed directly with the
 * CLI entry point as its first argument — the same thing `code.cmd` does, minus
 * the shell. `ELECTRON_RUN_AS_NODE` and the cleared `VSCODE_DEV` reproduce the
 * environment it sets.
 */
export function resolveCodeLauncher(host: InstallerHost): CodeLauncher {
  const found = whichCode(host);
  if (found === undefined) {
    return { kind: 'not-found' };
  }

  if (host.platform !== 'win32') {
    return { kind: 'ready', executable: found, args: [], env: host.env };
  }

  const shim = host.realpath(found);
  // `<root>\bin\code.cmd` -> `<root>`
  const root = path.dirname(path.dirname(shim));

  const executable = path.join(root, 'Code.exe');
  if (!host.exists(executable)) {
    return { kind: 'missing-executable', expected: executable };
  }

  const entryPoint = findCliEntryPoint(host, root);
  if (entryPoint === undefined) {
    return {
      kind: 'missing-entry-point',
      expected: path.join(root, 'resources', 'app', 'out', 'cli.js')
    };
  }

  const env: NodeJS.ProcessEnv = { ...host.env, ELECTRON_RUN_AS_NODE: '1' };
  delete env['VSCODE_DEV'];

  return { kind: 'ready', executable, args: [entryPoint], env };
}

export function vsixNameFor(name: string, version: string): string {
  return `${name}-${version}.vsix`;
}

export interface InstallExtensionResult {
  code: number;
  /** Present once a launcher was resolved, so a failure can name it. */
  executable?: string;
  args?: readonly string[];
  /** Everything the CLI said, merged. Used to report a failure. */
  output: string;
  /** Kept apart so a successful run can be summarised instead of reproduced. */
  stdout?: string;
  stderr?: string;
  /** Set when the step could not even start. */
  problem?: 'missing-vsix' | 'cli-not-found' | 'missing-executable' | 'missing-entry-point';
  detail?: string;
}

/**
 * Hands an already built VSIX to the VS Code CLI, and reports what happened
 * without printing anything: the caller owns the presentation.
 */
export function installExtension(
  host: InstallerHost,
  vsixPath: string
): InstallExtensionResult {
  if (!host.exists(vsixPath)) {
    return { code: 1, output: '', problem: 'missing-vsix', detail: vsixPath };
  }

  const launcher = resolveCodeLauncher(host);
  if (launcher.kind === 'not-found') {
    return { code: 1, output: '', problem: 'cli-not-found' };
  }
  if (launcher.kind !== 'ready') {
    return { code: 1, output: '', problem: launcher.kind, detail: launcher.expected };
  }

  const args = [...launcher.args, '--install-extension', vsixPath, '--force'];
  const result = host.run(launcher.executable, args, {
    // Separate executable and arguments: nothing is re-parsed by a shell, so a
    // path with spaces or shell metacharacters stays one argument.
    shell: false,
    stdio: 'pipe',
    env: launcher.env
  });

  return {
    code: result.status,
    executable: launcher.executable,
    args,
    output: outputOf(result),
    ...(result.stdout === undefined ? {} : { stdout: result.stdout }),
    ...(result.stderr === undefined ? {} : { stderr: result.stderr })
  };
}

export interface OrchestrationOptions {
  repositoryRoot: string;
  name: string;
  version: string;
  dryRun?: boolean;
  verbose?: boolean;
}

interface StepDefinition {
  running: string;
  done: string;
  /** Shown on the step line and in the report when the step fails. */
  failed: string;
  /** The command as a reader would describe it, for a failure report. */
  logical: string;
  command: string;
  args: string[];
}

const TOTAL_STEPS = 4;

/**
 * Steps 1 to 3 run this project's own build scripts through Node directly.
 * That keeps them off the shell, avoids the npm banner, and — because vsce
 * always runs `vscode:prepublish` itself — means the extension is compiled once
 * here and once inside vsce, rather than a third time by `npm run package`.
 */
function buildSteps(host: InstallerHost, options: OrchestrationOptions): StepDefinition[] {
  const vsce = path.join(options.repositoryRoot, 'node_modules', '@vscode', 'vsce', 'vsce');
  return [
    {
      running: 'Building local tools...',
      done: 'Local tools built',
      failed: 'Building the local tools',
      logical: 'node esbuild.local.mjs',
      command: host.execPath,
      args: [path.join(options.repositoryRoot, 'esbuild.local.mjs')]
    },
    {
      running: 'Compiling the extension...',
      done: 'Extension compiled',
      failed: 'Compiling the extension',
      logical: 'node esbuild.mjs',
      command: host.execPath,
      args: [path.join(options.repositoryRoot, 'esbuild.mjs')]
    },
    {
      running: 'Packaging the VSIX...',
      done: 'VSIX packaged',
      failed: 'Packaging the VSIX',
      logical: 'vsce package --no-dependencies',
      command: host.execPath,
      args: [vsce, 'package', '--no-dependencies']
    }
  ];
}

function reportFailure(
  ui: Ui,
  step: { logical: string; name: string },
  result: CommandResult,
  guidance: string
): void {
  const output = outputOf(result);
  ui.blank();
  ui.error(`${step.name} failed.`);
  ui.blank();
  ui.muted('Command:');
  ui.line(step.logical);
  ui.muted('Exit code:');
  ui.line(String(result.status));
  if (output.length > 0) {
    ui.blank();
    ui.line(output);
  }
  ui.blank();
  ui.muted(guidance);
}

/**
 * The whole of `npm run install:local`: four steps, one compact report, and a
 * non-zero exit code the moment any step fails.
 */
export function runInstall(host: InstallerHost, ui: Ui, options: OrchestrationOptions): number {
  ui.header('Agent Rules Lens', 'Local installation');

  const vsixPath = path.join(options.repositoryRoot, vsixNameFor(options.name, options.version));
  const steps = buildSteps(host, options);

  for (const [index, step] of steps.entries()) {
    const handle = ui.startStep(index + 1, TOTAL_STEPS, step.running);
    const started = host.now();
    const result = host.run(step.command, step.args, {
      shell: false,
      // Verbose lets the child write straight to the terminal; otherwise the
      // output is captured and only shown when something goes wrong.
      stdio: options.verbose === true ? 'inherit' : 'pipe',
      cwd: options.repositoryRoot,
      env: host.env
    });
    const elapsed = formatDuration(host.now() - started);

    if (result.status !== 0) {
      handle.finish('failed', step.failed, elapsed);
      reportFailure(
        ui,
        { logical: step.logical, name: step.failed },
        result,
        'Run the command above on its own to see the full output.'
      );
      ui.stop();
      return result.status === 0 ? 1 : result.status;
    }

    handle.finish('done', step.done, elapsed);
  }

  if (options.dryRun === true) {
    const handle = ui.startStep(TOTAL_STEPS, TOTAL_STEPS, 'Installing in VS Code...');
    handle.finish('skipped', 'Installation skipped', 'dry run');
    ui.blank();
    ui.line('Dry run complete. Nothing was installed.');
    ui.blank();
    ui.muted('VSIX:');
    ui.line(vsixPath);
    ui.stop();
    return 0;
  }

  const handle = ui.startStep(TOTAL_STEPS, TOTAL_STEPS, 'Installing in VS Code...');
  const started = host.now();
  const install = installExtension(host, vsixPath);
  const elapsed = formatDuration(host.now() - started);

  if (install.problem !== undefined) {
    handle.finish('failed', 'Installation failed', elapsed);
    ui.blank();
    if (install.problem === 'missing-vsix') {
      ui.error('VSIX was not found:');
      ui.line(install.detail ?? vsixPath);
      ui.blank();
      ui.muted('Run npm run package and try again.');
    } else if (install.problem === 'cli-not-found') {
      ui.error('VS Code CLI was not found.');
      ui.blank();
      ui.muted(
        host.platform === 'win32'
          ? 'Reinstall VS Code with "Add to PATH" enabled, or add its bin folder to PATH.'
          : "Open the Command Palette in VS Code and run:\nShell Command: Install 'code' command in PATH"
      );
      ui.blank();
      ui.muted(MANUAL_INSTALL);
      ui.muted(`VSIX: ${vsixPath}`);
    } else {
      ui.error(
        install.problem === 'missing-executable'
          ? 'VS Code executable was not found:'
          : 'VS Code CLI entry point was not found:'
      );
      ui.line(install.detail ?? '');
      ui.blank();
      ui.muted(MANUAL_INSTALL);
      ui.muted(`VSIX: ${vsixPath}`);
    }
    ui.stop();
    return install.code === 0 ? 1 : install.code;
  }

  if (install.code !== 0) {
    handle.finish('failed', 'Installation failed', elapsed);
    ui.blank();
    ui.error('VS Code could not install the extension.');
    ui.blank();
    ui.muted('Executable:');
    ui.line(install.executable ?? '');
    ui.muted('Arguments:');
    for (const arg of install.args ?? []) {
      ui.line(arg);
    }
    ui.muted('Exit code:');
    ui.line(String(install.code));
    if (install.output.length > 0) {
      ui.blank();
      ui.line(install.output);
    }
    ui.blank();
    ui.muted(`VSIX: ${vsixPath}`);
    ui.stop();
    return install.code;
  }

  handle.finish('done', 'Installed in VS Code', elapsed);
  ui.blank();
  ui.success(`Agent Rules Lens ${options.version} installed successfully`);

  // A successful CLI run still writes to stderr sometimes — a Node deprecation
  // notice, for instance. It is not the reader's problem, and pasting it raw
  // costs several lines, so a successful step is summarised rather than
  // reproduced. Verbose shows it exactly as the CLI wrote it.
  const warning = (install.stderr ?? '').trim();
  if (warning.length > 0) {
    ui.blank();
    if (options.verbose === true) {
      ui.line(warning);
    } else {
      ui.warning('VS Code CLI emitted a non-blocking warning.');
      ui.muted('  Run with --verbose to see details.');
    }
  }

  ui.blank();
  ui.muted('Next step:');
  ui.line('Open VS Code and run "Developer: Reload Window".');
  ui.blank();
  ui.muted('VSIX:');
  ui.line(vsixPath);
  ui.stop();
  return 0;
}

/** The real host: separate arguments, no shell, no interpolated command line. */
export function nodeInstallerHost(): InstallerHost {
  return {
    run(command, args, options) {
      const result = spawnSync(command, [...args], {
        encoding: 'utf8',
        shell: false,
        ...(options?.stdio === undefined ? {} : { stdio: options.stdio }),
        ...(options?.env === undefined ? {} : { env: options.env }),
        ...(options?.cwd === undefined ? {} : { cwd: options.cwd })
      });
      return {
        status: result.status ?? 1,
        ...(result.stdout ? { stdout: result.stdout } : {}),
        ...(result.stderr ? { stderr: result.stderr } : {}),
        ...(result.error ? { error: result.error.message } : {})
      };
    },
    exists: existsSync,
    listDirectories(directory) {
      try {
        return readdirSync(directory, { withFileTypes: true })
          .filter((entry) => entry.isDirectory())
          .map((entry) => entry.name);
      } catch {
        return [];
      }
    },
    realpath(target) {
      try {
        return realpathSync(target);
      } catch {
        return target;
      }
    },
    platform: process.platform,
    env: process.env,
    execPath: process.execPath,
    now: () => Date.now()
  };
}

import { spawn } from 'node:child_process';
import { existsSync, promises as fs } from 'node:fs';
import * as path from 'node:path';
import { isSupportedLocale, SUPPORTED_LOCALES, type SupportedLocale } from '../ui/i18n';
import { buildReport } from './report';
import { startServer } from './server';
import { LocalSession } from './session';

/** Replaced by the build; `dev` when the bundle is run from source. */
declare const __ARL_VERSION__: string;

const VERSION = typeof __ARL_VERSION__ === 'string' ? __ARL_VERSION__ : 'dev';

export interface CliOptions {
  /** Explicit `--workspace`. Absent means "the directory the terminal is in". */
  workspace?: string;
  file?: string;
  /** Bare arguments, before they are read as a workspace or as a file. */
  positional: string[];
  port?: number;
  open: boolean;
  locale?: SupportedLocale;
  json: boolean;
  help: boolean;
  version: boolean;
}

export class CliError extends Error {
  constructor(
    message: string,
    readonly code = 1
  ) {
    super(message);
  }
}

const HELP = `Agent Rules Lens - local panel

Usage:
  arl                       Analyze the current directory
  arl <file>                Analyze one file of the current directory
  arl <directory>           Analyze another project

Advanced:
  --workspace <path>  Project to analyze. Defaults to the current directory.
  --file <path>       File to select first, relative to the workspace.
  --port <number>     Port to listen on. A free port is chosen when omitted.
  --no-open           Do not open the browser.
  --locale <locale>   Interface language: pt-BR or en.
  --json              Print the analysis as JSON and exit. Requires a file.
  --version           Show the version.
  --help              Show this help.

Examples:
  arl
  arl src/backend/order.service.ts
  arl "C:\\Projects\\other project"
  arl --workspace "C:\\Projects\\other project" --file src/app.ts --json
`;

function readValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    throw new CliError(`Missing value for ${flag}.`);
  }
  return value;
}

export function parseArgs(argv: readonly string[]): CliOptions {
  const options: CliOptions = {
    positional: [],
    open: true,
    json: false,
    help: false,
    version: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    switch (arg) {
      case '--help':
      case '-h':
        options.help = true;
        break;
      case '--version':
      case '-v':
        options.version = true;
        break;
      case '--workspace':
        options.workspace = readValue(argv, ++index, '--workspace');
        break;
      case '--file':
        options.file = readValue(argv, ++index, '--file');
        break;
      case '--port': {
        const raw = readValue(argv, ++index, '--port');
        const port = Number(raw);
        if (!Number.isInteger(port) || port < 0 || port > 65535) {
          throw new CliError(`Invalid port: ${raw}`);
        }
        options.port = port;
        break;
      }
      case '--no-open':
        options.open = false;
        break;
      case '--locale': {
        const raw = readValue(argv, ++index, '--locale');
        if (!isSupportedLocale(raw)) {
          throw new CliError(`Unsupported locale. Use ${SUPPORTED_LOCALES.join(' or ')}.`);
        }
        options.locale = raw;
        break;
      }
      case '--json':
        options.json = true;
        break;
      default:
        if (arg.startsWith('-')) {
          throw new CliError(`Unknown option: ${arg}`);
        }
        options.positional.push(arg);
        break;
    }
  }

  return options;
}

export interface ResolvedTarget {
  /** Canonical absolute path of the analyzed root. */
  workspace: string;
  /** Workspace relative file to select first, when one was asked for. */
  file?: string;
}

async function entryKind(target: string): Promise<'file' | 'directory' | 'missing'> {
  try {
    const stats = await fs.stat(target);
    return stats.isDirectory() ? 'directory' : 'file';
  } catch {
    return 'missing';
  }
}

/** Canonical path of an existing directory, with a short message when it is not. */
async function resolveWorkspace(value: string): Promise<string> {
  const absolute = path.resolve(value);
  const kind = await entryKind(absolute);
  if (kind === 'missing') {
    throw new CliError(`Workspace not found: ${absolute}`);
  }
  if (kind === 'file') {
    throw new CliError(`Workspace is not a directory: ${absolute}`);
  }
  return fs.realpath(absolute);
}

/**
 * Turns the arguments into a root and an optional file. A bare argument is the
 * project when it is a directory and the file when it is one; anything that
 * cannot be read both ways is an error with an example rather than a guess.
 */
export async function resolveTarget(
  options: CliOptions,
  cwd: string = process.cwd()
): Promise<ResolvedTarget> {
  if (options.positional.length > 1) {
    throw new CliError(
      `Too many arguments: ${options.positional.join(' ')}\nUse: arl <file> or arl <directory>`
    );
  }
  const bare = options.positional[0];

  if (options.workspace !== undefined) {
    const workspace = await resolveWorkspace(options.workspace);
    if (bare !== undefined && options.file !== undefined) {
      throw new CliError(`Pass a file either as an argument or with --file, not both.`);
    }
    const file = options.file ?? bare;
    return { workspace, ...(file === undefined ? {} : { file }) };
  }

  if (bare === undefined) {
    const workspace = await resolveWorkspace(cwd);
    return { workspace, ...(options.file === undefined ? {} : { file: options.file }) };
  }

  const absolute = path.resolve(cwd, bare);
  const kind = await entryKind(absolute);

  if (kind === 'missing') {
    throw new CliError(`Not found: ${absolute}`);
  }

  if (kind === 'directory') {
    const workspace = await resolveWorkspace(absolute);
    return { workspace, ...(options.file === undefined ? {} : { file: options.file }) };
  }

  if (options.file !== undefined) {
    throw new CliError(`Pass a file either as an argument or with --file, not both.`);
  }

  // A bare file only says which file, never which project. The terminal's
  // directory answers that, and only when the file is actually inside it.
  const workspace = await resolveWorkspace(cwd);
  const relative = path.relative(workspace, await fs.realpath(absolute));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CliError(
      `${absolute} is outside the current directory.\n` +
        `Name the project explicitly:\n` +
        `  arl --workspace "${path.dirname(absolute)}" --file "${path.basename(absolute)}"`
    );
  }
  return { workspace, file: relative };
}

function openBrowser(url: string): void {
  const command =
    process.platform === 'win32' ? 'cmd' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // Opening a browser is a convenience; the URL is already on screen.
  }
}

/**
 * The dashboard assets. Two layouts are supported, and neither depends on the
 * repository: the published CLI package keeps `media` beside its bundle, while
 * a development build in `out/local` reads the repository's own folder.
 */
function defaultMediaRoot(): string {
  const candidates = [
    path.resolve(__dirname, 'media'),
    path.resolve(__dirname, '..', 'media'),
    path.resolve(__dirname, '..', '..', 'media')
  ];
  return candidates.find((candidate) => existsSync(path.join(candidate, 'local', 'index.html')))
    ?? (candidates[candidates.length - 1] as string);
}

export async function run(argv: readonly string[], cwd: string = process.cwd()): Promise<number> {
  const options = parseArgs(argv);

  if (options.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (options.version) {
    process.stdout.write(`${VERSION}
`);
    return 0;
  }

  const target = await resolveTarget(options, cwd);
  const session = new LocalSession(target.workspace);

  let file: string | undefined;
  if (target.file !== undefined) {
    file = await session.resolveFile(target.file);
    if (file === undefined) {
      throw new CliError('The selected file is outside the workspace.');
    }
  }

  if (options.json) {
    if (file === undefined) {
      throw new CliError('--json needs a file. Example: arl src/app.ts --json');
    }
    await session.load();
    const model = session.analyze({ file, ...(options.locale ? { locale: options.locale } : {}) });
    process.stdout.write(
      `${JSON.stringify(buildReport(session.workspaceName, file, model), null, 2)}\n`
    );
    return 0;
  }

  await session.load();

  const server = await startServer(
    {
      session,
      mediaRoot: defaultMediaRoot(),
      locale: options.locale ?? 'en',
      ...(file === undefined ? {} : { initialFile: file })
    },
    options.port ?? 0
  );

  process.stdout.write(
    `Agent Rules Lens\nWorkspace: ${target.workspace}\nLocal dashboard: ${server.url}\n\nPress Ctrl+C to stop.\n`
  );

  if (options.open) {
    openBrowser(server.url);
  }

  await new Promise<void>((resolve) => {
    const stop = (): void => {
      void server.close().then(resolve);
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });

  return 0;
}

/** Runs the CLI and turns a failure into a short message and an exit code. */
export async function main(argv: readonly string[], cwd?: string): Promise<number> {
  try {
    return await run(argv, cwd);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return error instanceof CliError ? error.code : 1;
  }
}

/* c8 ignore start -- process wiring, exercised by the CLI tests through main() */
if (require.main === module) {
  void main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
/* c8 ignore stop */

import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { nodeInstallerHost, runInstall } from './installer';
import { createUi, shouldAnimate, shouldUseColor } from './installUi';

/** Entry point for `npm run install:local`. */
export function main(argv: readonly string[]): number {
  const repositoryRoot = path.resolve(__dirname, '..', '..');
  const manifest = JSON.parse(
    readFileSync(path.join(repositoryRoot, 'package.json'), 'utf8')
  ) as { name: string; version: string };

  const isTTY = process.stdout.isTTY === true;
  const ui = createUi({
    stream: {
      write: (text) => void process.stdout.write(text),
      isTTY
    },
    color: shouldUseColor(process.env, isTTY),
    animate: shouldAnimate(process.env, isTTY)
  });

  // Ctrl+C must not leave a spinner frame as the last thing on screen.
  const interrupt = (): void => {
    ui.stop();
    process.stdout.write('\nInterrupted. Nothing else was changed.\n');
    process.exit(130);
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);

  try {
    return runInstall(nodeInstallerHost(), ui, {
      repositoryRoot,
      name: manifest.name,
      version: manifest.version,
      dryRun: argv.includes('--dry-run'),
      verbose: argv.includes('--verbose')
    });
  } finally {
    // Whatever happened, no timer is left running.
    ui.stop();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

/* c8 ignore start -- process wiring, covered through runInstall() in tests */
if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
/* c8 ignore stop */

#!/usr/bin/env node
// Entry point for `arl` and `agent-rules-lens`, resolved from this file's own
// URL so npm can link or install it anywhere.
//
// Two layouts are supported. A development checkout keeps the bundle in
// out/local, which lets edits to the dashboard take effect without repacking;
// an installed package carries its own copy in dist/.
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  join(here, '..', '..', 'out', 'local', 'cli.js'),
  join(here, '..', 'dist', 'cli.cjs')
];
const bundle = candidates.find((candidate) => existsSync(candidate));

if (bundle === undefined) {
  process.stderr.write(
    'Agent Rules Lens is not built yet.\nRun this once in the Agent Rules Lens repository:\n  npm run cli:build\n'
  );
  process.exit(1);
}

process.exitCode = await createRequire(import.meta.url)(bundle).main(process.argv.slice(2));

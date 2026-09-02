#!/usr/bin/env node
// Launcher for `npm run install:local`. The four steps live in
// src/local/installer.ts, bundled to out/local/installMain.js.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const bundle = join(repositoryRoot, 'out', 'local', 'installMain.js');

// The installer builds the local tools itself as step 1, but it has to exist
// before it can do that. Bootstrap quietly so nothing prints above the header.
if (!existsSync(bundle)) {
  const build = spawnSync(process.execPath, [join(repositoryRoot, 'esbuild.local.mjs')], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false
  });
  if (build.status !== 0) {
    process.stderr.write(
      `Could not build the local tools.\n\n${build.stderr ?? build.error?.message ?? ''}\n`
    );
    process.exit(build.status ?? 1);
  }
}

process.exitCode = createRequire(import.meta.url)(bundle).main(process.argv.slice(2));

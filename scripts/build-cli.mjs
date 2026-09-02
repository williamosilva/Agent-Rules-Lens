#!/usr/bin/env node
// Builds the publishable CLI package under cli/: the bundle, the dashboard
// assets it serves, and the files npm needs. Everything lands inside cli/ so an
// installed tarball never reaches outside its own directory.
import esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cli = join(root, 'cli');
const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

/** Only what the local server actually serves, plus its attribution. */
const ASSETS = [
  ['media/local/index.html', 'media/local/index.html'],
  ['media/local/local.css', 'media/local/local.css'],
  ['media/local/local.js', 'media/local/local.js'],
  ['media/shared/rulesRenderer.js', 'media/shared/rulesRenderer.js'],
  ['media/rules.css', 'media/rules.css'],
  ['media/agent-rules-lens.svg', 'media/agent-rules-lens.svg'],
  ['media/icons/agents', 'media/icons/agents'],
  ['LICENSE', 'LICENSE'],
  ['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md']
];

rmSync(join(cli, 'dist'), { recursive: true, force: true });
rmSync(join(cli, 'media'), { recursive: true, force: true });
mkdirSync(join(cli, 'dist'), { recursive: true });

await esbuild.build({
  entryPoints: [join(root, 'src/local/cli.ts')],
  bundle: true,
  outfile: join(cli, 'dist', 'cli.cjs'),
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // The version is baked in, so `--version` reads nothing from disk.
  define: { __ARL_VERSION__: JSON.stringify(manifest.version) },
  logLevel: 'warning'
});

for (const [from, to] of ASSETS) {
  const target = join(cli, to);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(root, from), target, { recursive: true });
}

// One version, kept in step with the extension without a second edit.
const cliManifestPath = join(cli, 'package.json');
const cliManifest = JSON.parse(readFileSync(cliManifestPath, 'utf8'));
if (cliManifest.version !== manifest.version) {
  cliManifest.version = manifest.version;
  writeFileSync(cliManifestPath, `${JSON.stringify(cliManifest, null, 2)}\n`);
}

process.stdout.write(`cli package ready: ${cliManifest.name} ${cliManifest.version}\n`);

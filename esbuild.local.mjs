import esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

/** @type {import('esbuild').BuildOptions} */
const options = {
  entryPoints: ['src/local/cli.ts', 'src/local/installMain.ts'],
  bundle: true,
  outdir: 'out/local',
  entryNames: '[name]',
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  sourcemap: watch,
  // The local CLI never runs inside the Extension Host, so `vscode` must not
  // reach this bundle: an accidental import fails the build instead of the run.
  logLevel: 'info'
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}

// Bundles the renderer (src/app.js) into dist/app.js with esbuild.
import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');
const dev = watch || process.argv.includes('--dev');

const options = {
  entryPoints: ['src/app.js'],
  bundle: true,
  outfile: 'dist/app.js',
  format: 'iife',
  target: ['chrome128'],
  sourcemap: dev ? 'inline' : 'linked',
  minify: !dev,
  legalComments: 'none',
  logLevel: 'info',
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching renderer sources…');
} else {
  await esbuild.build(options);
}

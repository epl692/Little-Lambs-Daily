// The ZIP library is only needed when someone exports or imports a backup, so it ships as its own precached file
// (public/zip.js) that the app loads on first use, instead of weighing down every start. The framework's bundler inlines
// ordinary dynamic imports into one file, so this is a separate, pre-built asset the app imports by URL at runtime.
import { build } from 'esbuild';

await build({
  stdin: { contents: "export { zipSync, unzipSync, strFromU8 } from 'fflate';", resolveDir: process.cwd(), loader: 'js' },
  bundle: true,
  format: 'esm',
  minify: true,
  target: 'es2022',
  outfile: 'public/zip.js',
  logLevel: 'error',
});

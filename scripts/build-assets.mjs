// Libraries only needed some of the time ship as their own precached files that the app loads on first use, instead of weighing
// down every start: the ZIP tool (export / restore) and the QR decoder (scanning an invite). The framework's bundler folds ordinary
// dynamic imports into one file, so these are pre-built assets the app imports by URL at runtime.
import { build } from 'esbuild';

const asset = (name, contents) =>
  build({
    stdin: { contents, resolveDir: process.cwd(), loader: 'js' },
    bundle: true,
    format: 'esm',
    minify: true,
    target: 'es2022',
    outfile: `public/${name}.js`,
    logLevel: 'error',
  });

await asset('zip', "export { zipSync, unzipSync, strFromU8 } from 'fflate';");
await asset('qr-decode', "import jsQR from 'jsqr'; export const decode = (data, width, height) => jsQR(data, width, height, { inversionAttempts: 'attemptBoth' })?.data;");

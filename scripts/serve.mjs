// Plain static server for trying dist/ locally: `npm run build && npm run serve`. http://localhost is a secure context.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const dir = join(import.meta.dirname, '..', 'dist');
const port = Number(process.env.PORT ?? 4180);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };

createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let rel = normalize('/' + path).slice(1);
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const file = join(dir, rel);
  if (!existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(file));
}).listen(port, () => console.log(`serving ${dir} at http://localhost:${port}/`));

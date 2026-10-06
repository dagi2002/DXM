// Serves the demo shop on its own origin (a stand-in for a customer's website).
import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./demo-site/', import.meta.url));
const port = Number(process.env.DEMO_PORT ?? 4300);
createServer((req, res) => {
  const path = new URL(req.url ?? '/', 'http://x').pathname;
  const file = normalize(join(root, path === '/' ? 'index.html' : path));
  if (!file.startsWith(root) || !existsSync(file)) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, {
    'content-type': extname(file) === '.html' ? 'text/html; charset=utf-8' : 'application/octet-stream',
  });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`demo site on http://localhost:${port}`));

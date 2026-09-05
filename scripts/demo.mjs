import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sibling = path.resolve(root, '../orbit');
const orbit = process.env.ORBIT_DIR
  ? path.resolve(process.env.ORBIT_DIR)
  : fs.existsSync(path.join(sibling, 'package.json'))
    ? sibling
    : path.join(root, 'node_modules/@zumer/orbit');
const dist = path.join(orbit, 'dist');
for (const name of ['orbit.css', 'orbit.js']) {
  if (!fs.existsSync(path.join(dist, name))) {
    throw new Error(`Missing ${path.join(dist, name)}. Run npm run compile in Orbit first, or set ORBIT_DIR.`);
  }
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const server = http.createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
    const gallery = pathname === '/' || pathname === '/docs/index.html';
    const route = pathname.startsWith('/orbit/') ? [dist, pathname.slice(7)]
      : pathname.startsWith('/src/') ? [path.join(root, 'src'), pathname.slice(5)]
        : null;
    let filename;
    if (gallery) filename = path.join(root, 'docs/index.html');
    else if (route) {
      filename = path.resolve(route[0], route[1]);
      if (!filename.startsWith(route[0] + path.sep)) { response.writeHead(404).end('Not found'); return; }
    } else { response.writeHead(404).end('Not found'); return; }
    let body = await fs.promises.readFile(filename);
    if (gallery) {
      body = Buffer.from(body.toString()
        .replaceAll('https://unpkg.com/@zumer/orbit@latest/dist/', '/orbit/')
        .replaceAll('https://unpkg.com/@zumer/orbit-kit@latest/src/', '/src/'));
    }
    response.writeHead(200, { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    response.end(request.method === 'HEAD' ? undefined : body);
  } catch (error) {
    const status = error.code === 'ENOENT' || error.code === 'EISDIR' ? 404 : error instanceof URIError ? 400 : 500;
    response.writeHead(status).end(status === 404 ? 'Not found' : 'Request failed');
    if (status === 500) console.error(error);
  }
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
server.listen(Number(process.env.PORT || 5173), '127.0.0.1', () => {
  console.log(`Demo: http://127.0.0.1:${server.address().port}`);
  console.log(`Orbit: ${dist}\norbit-kit: ${path.join(root, 'src')}`);
  console.log('Local assets only. Reload after edits; rebuild Orbit after changing its source.');
});

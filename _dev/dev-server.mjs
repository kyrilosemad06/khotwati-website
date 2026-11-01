// Local stand-in for Vercel: serves static files and runs the /api handlers. Usage: node _dev/dev-server.mjs [port]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json', '.apk': 'application/vnd.android.package-archive', '.txt': 'text/plain' };
export function startDevServer(port = 0) {
  const server = http.createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); let p = decodeURIComponent(u.pathname);
    if (p.startsWith('/api/')) {
      const file = path.join(root, p + '.js');
      if (!fs.existsSync(file)) { res.statusCode = 404; return res.end('{"error":"not_found"}'); }
      return (await import(pathToFileURL(file).href)).default(req, res);
    }
    if (p === '/owner') p = '/owner/index.html'; if (p.endsWith('/')) p += 'index.html'; if (p === '') p = '/index.html';
    const f = path.join(root, p);
    if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end('404'); }
    res.setHeader('Content-Type', MIME[path.extname(f)] || 'application/octet-stream'); fs.createReadStream(f).pipe(res);
  });
  return new Promise((ok) => server.listen(port, '127.0.0.1', () => ok({ server, port: server.address().port, close: () => server.close() })));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { const r = await startDevServer(Number(process.argv[2]) || 4300); console.log('dev server on http://127.0.0.1:' + r.port); }

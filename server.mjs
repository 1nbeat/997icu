import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
const publicFiles = new Set(['index.html', 'styles.css', 'app.js', 'favicon.svg', 'robots.txt']);

http.createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const filename = path === '/' ? 'index.html' : path.slice(1);
    const fullPath = resolve(root, filename);
    if (!fullPath.startsWith(root + sep) || !publicFiles.has(filename)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('页面不存在');
    }
    const data = await readFile(fullPath);
    res.writeHead(200, {
      'Content-Type': types[extname(fullPath)] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    });
    res.end(data);
  } catch {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('无法读取页面');
  }
}).listen(port, '0.0.0.0', () => console.log(`997ICU 已启动：http://localhost:${port}`));

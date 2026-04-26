import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize, sep } from 'path';
import { fileURLToPath } from 'url';

const port = process.env.PORT || 3000;
const publicDir = join(fileURLToPath(new URL('.', import.meta.url)), 'public');

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0];
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  const resolved = normalize(join(publicDir, requested));

  if (!resolved.startsWith(publicDir + sep) && resolved !== publicDir) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = await readFile(resolved);
    const type = types[extname(resolved)] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
}).listen(port, () => {
  console.log(`Fading Memories running on http://localhost:${port}`);
});

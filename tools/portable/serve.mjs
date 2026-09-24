#!/usr/bin/env node
/**
 * Zero-dependency static server for the portable build.
 *
 * The renderer is a plain static bundle that stores everything in IndexedDB, so
 * it needs a server only because browsers refuse module imports and IndexedDB
 * from `file://`. Nothing here talks to the network, and no data leaves the
 * machine.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), 'app');
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json; charset=utf-8',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    // Normalise and confine to ROOT: a request for ../../etc/passwd must not
    // escape the bundle even though this only ever listens on loopback.
    const relative = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
    let file = join(ROOT, relative);
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) {
      file = join(file, 'index.html');
      info = await stat(file).catch(() => null);
    }
    // Single-page app: unknown paths fall back to the entry document.
    if (!info) {
      file = join(ROOT, 'index.html');
    }

    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${PORT}`;
  console.log(`\n  Engineering Trainer is running at ${url}`);
  console.log('  Your data stays in this browser profile. Close this window to stop.\n');

  // Best effort: open the default browser. Opening one is a convenience, so
  // every way it can fail is ignored - including the asynchronous 'error' event
  // spawn emits when the opener is not installed, which is NOT caught by a
  // promise rejection handler and takes the whole server down with it.
  const open = process.platform === 'darwin' ? 'open'
    : process.platform === 'win32' ? 'start'
    : 'xdg-open';
  import('node:child_process')
    .then(({ spawn }) => {
      const child = spawn(open, [url], {
        stdio: 'ignore',
        detached: true,
        shell: process.platform === 'win32',
      });
      child.on('error', () => {});
      child.unref();
    })
    .catch(() => {});
});

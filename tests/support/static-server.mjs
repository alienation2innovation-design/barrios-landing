// A self-contained static file server for the website suite.
//
// The suite used to assume a listener already existed on 127.0.0.1:4173. That
// assumption produced at least one entirely spurious 26-failure report, because
// a stale server was still serving another commit's bytes. Nothing here depends
// on an external listener: every run binds its own socket to port 0, lets the
// operating system hand out a free port, and closes it again on the way out.
//
// Two concurrent runs therefore cannot collide - the kernel never assigns the
// same ephemeral port to two live listeners - and a run that crashes leaks
// nothing, because the listener is unref'd and dies with its process.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';

// The MIME table is part of the contract, not a convenience. A missing mapping
// is not a soft failure: tests/meet-gary-section.test.mjs asserts the portrait's
// Content-Type, so an absent `.jpg` entry fails a test that has nothing to do
// with images. Every extension referenced from public/ is listed.
export const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
});

export const DEFAULT_MIME_TYPE = 'application/octet-stream';

export function contentTypeFor(filePath) {
  return MIME_TYPES[extname(filePath).toLowerCase()] ?? DEFAULT_MIME_TYPE;
}

function withinRoot(root, candidate) {
  return candidate === root || candidate.startsWith(root + sep);
}

/**
 * Start a static server rooted at `root` on an operating-system-assigned port.
 *
 * @param {object} options
 * @param {string} options.root Directory to serve.
 * @param {(pathname: string) => Record<string,string>} [options.headersFor]
 *   Extra response headers for a request path. The suite passes the real
 *   next.config.js header rules through here, so a page is served locally with
 *   the same Content-Security-Policy production sends.
 * @returns {Promise<{port:number, origin:string, url:string, stop:() => Promise<void>}>}
 */
export async function startStaticServer({ root, headersFor } = {}) {
  if (!root) throw new TypeError('startStaticServer requires a root directory');
  const base = resolve(root);

  const sockets = new Set();

  const server = createServer(async (req, res) => {
    const extra = {};
    let pathname = '/';
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('bad request');
      return;
    }

    if (typeof headersFor === 'function') {
      try {
        Object.assign(extra, await headersFor(pathname));
      } catch {
        // A header-rule lookup must never turn into a 500 that masks the real
        // assertion; the test that pins the headers will fail on its own.
      }
    }

    let target = resolve(join(base, '.' + pathname));
    if (!withinRoot(base, target)) {
      res.writeHead(403, { ...extra, 'content-type': 'text/plain; charset=utf-8' }).end('forbidden');
      return;
    }

    try {
      const info = await stat(target);
      if (info.isDirectory()) target = join(target, 'index.html');
    } catch {
      // Fall through to the read, which reports the 404.
    }

    try {
      const body = await readFile(target);
      res.writeHead(200, {
        ...extra,
        'content-type': contentTypeFor(target),
        'content-length': body.byteLength,
        'cache-control': 'no-store'
      }).end(body);
    } catch {
      res.writeHead(404, { ...extra, 'content-type': 'text/plain; charset=utf-8' }).end('not found');
    }
  });

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });

  await new Promise((fulfil, reject) => {
    server.once('error', reject);
    // Port 0: the kernel picks a free ephemeral port and never hands the same
    // one to a second live listener, so concurrent runs cannot collide.
    server.listen(0, '127.0.0.1', () => {
      server.removeListener('error', reject);
      fulfil();
    });
  });

  // Belt and braces on teardown: an unref'd listener cannot hold the event loop
  // open, so even a run that skips stop() (a crash, a forced exit) still exits
  // and still releases the port with the process.
  server.unref();

  const { port } = server.address();
  const origin = `http://127.0.0.1:${port}`;

  let stopped = null;
  return {
    port,
    origin,
    url: `${origin}/`,
    stop() {
      if (stopped) return stopped;
      stopped = new Promise((fulfil) => {
        // Node's fetch keeps connections alive; without this, close() waits for
        // the keep-alive timeout and a teardown looks like a hang.
        for (const socket of sockets) socket.destroy();
        sockets.clear();
        server.close(() => fulfil());
      });
      return stopped;
    }
  };
}

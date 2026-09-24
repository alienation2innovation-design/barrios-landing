// The harness's own tests.
//
// The website suite used to require a listener on 127.0.0.1:4173. A stale server
// on that port, serving an older commit's bytes, once produced a confident
// 26-failure report that was entirely spurious. These tests pin the properties
// that make that class of false result impossible: the run starts its own
// server, picks its own port, serves the right MIME types, tears down cleanly,
// and no test file may reintroduce a hard-coded port dependency.

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { connect } from 'node:net';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { MIME_TYPES, contentTypeFor, startStaticServer } from './support/static-server.mjs';
import { PUBLIC_ROOT } from './support/next-headers.mjs';

const TESTS_DIR = fileURLToPath(new URL('./', import.meta.url));

let server;

before(async () => {
  server = await startStaticServer({ root: PUBLIC_ROOT });
});

after(async () => {
  await server?.stop();
});

test('the harness serves the homepage from a port it chose itself, with no external listener', async () => {
  // Port 0 means the kernel assigned it. A hard-coded port would be a fixed
  // number in the 4000s here; an ephemeral assignment never is by construction,
  // but the decisive property is simply that this run created the listener.
  assert.ok(Number.isInteger(server.port) && server.port > 0, 'the server reports a real port');
  assert.notEqual(server.port, 4173, 'the harness must never bind the historical fixed port');

  const response = await fetch(server.url, { redirect: 'manual' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type') ?? '', /text\/html/i);
  assert.match(await response.text(), /id="nexus-panel"/i);
});

test('two harness servers coexist on distinct ports, so concurrent runs cannot collide', async () => {
  const [a, b] = await Promise.all([
    startStaticServer({ root: PUBLIC_ROOT }),
    startStaticServer({ root: PUBLIC_ROOT })
  ]);
  try {
    assert.notEqual(a.port, b.port, 'two live listeners must never share a port');
    assert.notEqual(a.port, server.port);
    assert.notEqual(b.port, server.port);
    for (const instance of [a, b]) {
      const response = await fetch(instance.url);
      assert.equal(response.status, 200);
    }
  } finally {
    await Promise.all([a.stop(), b.stop()]);
  }
});

test('stop() releases the port, and is safe to call twice', async () => {
  const instance = await startStaticServer({ root: PUBLIC_ROOT });
  const { port } = instance;
  assert.equal((await fetch(instance.url)).status, 200);

  await instance.stop();
  await instance.stop(); // idempotent: teardown must never throw on a retry

  const refused = await new Promise((fulfil) => {
    const socket = connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      fulfil(false);
    });
    socket.once('error', () => fulfil(true));
  });
  assert.equal(refused, true, `nothing may still be listening on ${port} after stop()`);
});

test('the MIME table covers every extension the suite and public/ actually request', async () => {
  const required = [
    '.html', '.css', '.js', '.mjs', '.svg', '.png',
    '.jpg', '.jpeg', '.webp', '.gif', '.woff2', '.woff', '.json', '.ico'
  ];
  for (const extension of required) {
    assert.ok(MIME_TYPES[extension], `${extension} must have a MIME mapping`);
  }

  // The specific regression that motivated this: a missing `.jpg` mapping made
  // tests/meet-gary-section.test.mjs fail on the founder portrait's
  // Content-Type, an image assertion broken by a server bug.
  assert.equal(contentTypeFor('/assets/images/gary-barrios-founder.jpg'), 'image/jpeg');
  assert.equal(contentTypeFor('/aura-landing.css'), 'text/css; charset=utf-8');
  assert.equal(contentTypeFor('/js/meet-gary.js'), 'text/javascript; charset=utf-8');

  const portrait = await fetch(new URL('/assets/images/gary-barrios-founder.jpg', server.url));
  assert.equal(portrait.status, 200);
  assert.match(portrait.headers.get('content-type') ?? '', /image\/jpeg/i);
});

test('the harness serves nested paths and refuses to escape its root', async () => {
  assert.equal((await fetch(new URL('/js/meet-gary.js', server.url))).status, 200);
  assert.equal((await fetch(new URL('/privacy-directive.html', server.url))).status, 200);
  assert.equal((await fetch(new URL('/definitely-not-a-real-file.html', server.url))).status, 404);

  // A traversal must not read package.json, which sits one level above public/.
  const escaped = await fetch(`${server.origin}/..%2fpackage.json`);
  assert.ok(escaped.status === 403 || escaped.status === 404, `traversal must not succeed (got ${escaped.status})`);
});

// A port named in prose is history; a port named in code is a dependency. Only
// the latter can make a run depend on someone else's listener, so the scan
// below looks at executable text with the comments removed.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

test('no test file reintroduces a hard-coded 127.0.0.1:4173 dependency', async () => {
  const entries = await readdir(TESTS_DIR, { withFileTypes: true, recursive: true });
  const sources = entries
    .filter((entry) => entry.isFile() && /\.(mjs|js|cjs)$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
  assert.ok(sources.length >= 8, 'the scan must actually find the suite and its support modules');

  const self = fileURLToPath(import.meta.url);
  const offenders = [];
  for (const file of sources) {
    if (file === self) continue; // this file asserts against the port on purpose
    if (/\b4173\b/.test(stripComments(await readFile(file, 'utf8')))) {
      offenders.push(file.slice(TESTS_DIR.length).replace(/\\/g, '/'));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'a test must never depend on a fixed port; take a URL from tests/support/site.mjs instead'
  );

  // The scan is only worth anything if it can actually see a reintroduction.
  assert.match(
    stripComments("const url = process.env.HOMEPAGE_URL ?? 'http://127.0.0.1:4173/';"),
    /\b4173\b/,
    'the scan must still catch the exact line this harness replaced'
  );
  assert.doesNotMatch(stripComments('// a note about 127.0.0.1:4173\ncode();'), /\b4173\b/);
});

test('HOMEPAGE_URL remains the documented escape hatch and starts nothing', async () => {
  const source = await readFile(join(TESTS_DIR, 'support', 'site.mjs'), 'utf8');
  assert.match(source, /process\.env\.HOMEPAGE_URL/, 'the override must still be read');

  // When the override is set, useStaticSite() returns it verbatim and binds no
  // socket; the three HTTP test files read their URL from that one place, so the
  // override reaches all of them.
  assert.match(source, /if \(EXTERNAL_HOMEPAGE_URL\) \{[\s\S]*?site\.external = true;[\s\S]*?return;/);
  for (const file of ['aura-homepage.test.mjs', 'aura-footer.test.mjs', 'meet-gary-section.test.mjs']) {
    const body = await readFile(join(TESTS_DIR, file), 'utf8');
    assert.match(body, /useStaticSite\(\)/, `${file} must take its URL from the shared harness`);
  }
});

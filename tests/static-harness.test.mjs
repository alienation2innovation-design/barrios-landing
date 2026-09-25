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

test('external testing is opt-in only, and starts nothing when opted into', async () => {
  const source = await readFile(join(TESTS_DIR, 'support', 'site.mjs'), 'utf8');
  assert.match(source, /process\.env\.HOMEPAGE_URL/, 'the override must still be readable');

  // When the override IS opted into, useStaticSite() returns it verbatim and
  // binds no socket; the three HTTP test files read their URL from that one
  // place, so the override reaches all of them.
  assert.match(source, /if \(EXTERNAL_HOMEPAGE_URL\) \{[\s\S]*?site\.external = true;[\s\S]*?return;/);
  for (const file of ['aura-homepage.test.mjs', 'aura-footer.test.mjs', 'meet-gary-section.test.mjs']) {
    const body = await readFile(join(TESTS_DIR, file), 'utf8');
    assert.match(body, /useStaticSite\(\)/, `${file} must take its URL from the shared harness`);
  }
});

// ---------------------------------------------------------------------------
// Item 7: `npm test` is hermetic unconditionally.
//
// An inherited HOMEPAGE_URL - left in a shell, exported by a wrapper, set by a
// CI job an hour ago - used to redirect the WHOLE suite at an external server.
// Every assertion would then be about somebody else's bytes while reading
// exactly like a verdict on this working tree: a stale deployment reported as a
// pass, or a dead host reported as this commit's failure. An environment
// variable is not consent, so the default suite now ignores it, and external
// testing needs an explicit second flag that only `npm run test:external` sets.
//
// These tests would fail if the dependency were reintroduced - as a re-read of
// process.env.HOMEPAGE_URL in any test file, or as a site.mjs that honours the
// variable on its own.

test('an ambient HOMEPAGE_URL cannot redirect the default suite (item 7)', async () => {
  const { resolveExternalUrl, EXTERNAL_OPT_IN } = await import('./support/site.mjs');

  // The decisive case: a stale or hostile value present in the environment,
  // with no opt-in. It must resolve to "hermetic", not to that URL.
  for (const ambient of [
    'http://127.0.0.1:9/',
    'http://127.0.0.1:4173/',
    'https://www.barriosa2i.com/',
    'https://some-old-preview.vercel.app/'
  ]) {
    assert.equal(
      resolveExternalUrl({ HOMEPAGE_URL: ambient }),
      null,
      `HOMEPAGE_URL=${ambient} alone must never redirect the suite`
    );
    // Near-miss opt-ins are not opt-ins.
    for (const flag of ['0', '', 'true', 'yes', ' 1', 'TRUE']) {
      assert.equal(resolveExternalUrl({ HOMEPAGE_URL: ambient, [EXTERNAL_OPT_IN]: flag }), null);
    }
  }

  // And the opt-in still works, for the person who meant it.
  assert.equal(
    resolveExternalUrl({ HOMEPAGE_URL: 'https://example.test/', [EXTERNAL_OPT_IN]: '1' }),
    'https://example.test/'
  );
  // The flag without a URL is not an external run either; it is hermetic.
  assert.equal(resolveExternalUrl({ [EXTERNAL_OPT_IN]: '1' }), null);
  assert.equal(resolveExternalUrl({}), null);
});

test('this very run ignored any ambient HOMEPAGE_URL it inherited (item 7)', async () => {
  const site = await import('./support/site.mjs');

  // Proof about THIS process, not about a hypothetical environment. When the
  // suite is run with HOMEPAGE_URL deliberately set to a dead URL, this records
  // the value that arrived and asserts the suite did not adopt it. When it is
  // run without one, both are null and the assertion is trivially true - which
  // is why the pure test above carries the weight.
  assert.equal(site.EXTERNAL_HOMEPAGE_URL, null, 'the default suite must never target an external site');
  if (site.IGNORED_AMBIENT_HOMEPAGE_URL) {
    assert.notEqual(
      site.EXTERNAL_HOMEPAGE_URL,
      site.IGNORED_AMBIENT_HOMEPAGE_URL,
      'an inherited value must not have been adopted'
    );
    // It is also cleared, so nothing downstream - a helper, a child process -
    // can read it either.
    assert.equal(process.env.HOMEPAGE_URL, undefined, 'the ambient value is cleared, not merely unused');
  }
});

test('no test file may reintroduce a dependency on an ambient HOMEPAGE_URL (item 7)', async () => {
  const entries = await readdir(TESTS_DIR, { withFileTypes: true, recursive: true });
  const sources = entries
    .filter((entry) => entry.isFile() && /\.(mjs|js|cjs)$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name));
  assert.ok(sources.length >= 8, 'the scan must actually find the suite and its support modules');

  const self = fileURLToPath(import.meta.url);
  const harness = join(TESTS_DIR, 'support', 'site.mjs');
  const runner = join(TESTS_DIR, 'support', 'run-external.mjs');
  const offenders = [];
  for (const file of sources) {
    // site.mjs owns the variable and gates it; run-external.mjs is the opt-in
    // itself; this file asserts about it on purpose.
    if (file === self || file === harness || file === runner) continue;
    if (/process\.env\.HOMEPAGE_URL/.test(stripComments(await readFile(file, 'utf8')))) {
      offenders.push(file.slice(TESTS_DIR.length).replace(/\\/g, '/'));
    }
  }
  assert.deepEqual(
    offenders,
    [],
    'a test must never read HOMEPAGE_URL itself; take a URL from tests/support/site.mjs instead'
  );

  // The gate in site.mjs is the one thing standing between an inherited value
  // and the whole suite, so pin its shape: the flag is required before the URL
  // is even looked at.
  const source = stripComments(await readFile(harness, 'utf8'));
  assert.match(
    source,
    /if \(env\[EXTERNAL_OPT_IN\] !== '1'\) return null;/,
    'the opt-in must be checked first, and must be an exact match'
  );
  assert.match(source, /delete process\.env\.HOMEPAGE_URL;/, 'a hermetic run also clears the ambient value');

  // And the scan can actually see a reintroduction.
  assert.match(stripComments("const url = process.env.HOMEPAGE_URL ?? 'http://x/';"), /process\.env\.HOMEPAGE_URL/);
  assert.doesNotMatch(stripComments('// a note about process.env.HOMEPAGE_URL\ncode();'), /process\.env\.HOMEPAGE_URL/);
});

test('the external mode is reachable only through its own script, which refuses to run blind (item 7)', async () => {
  const pkg = JSON.parse(await readFile(join(TESTS_DIR, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['test:external'], 'node tests/support/run-external.mjs');
  assert.doesNotMatch(
    pkg.scripts.test,
    /HOMEPAGE_URL|SITE_TEST_EXTERNAL/,
    'the default script must not mention either variable'
  );

  const runner = await readFile(join(TESTS_DIR, 'support', 'run-external.mjs'), 'utf8');
  assert.match(runner, /SITE_TEST_EXTERNAL: '1'/, 'the runner is what sets the opt-in');
  assert.match(runner, /if \(!url\) \{[\s\S]*?process\.exit\(2\);/, 'and it refuses to start without a URL');

  // The runner lives under support/, so the suite's own glob never runs it.
  assert.doesNotMatch('run-external.mjs', /\.test\.(mjs|js)$/);
});

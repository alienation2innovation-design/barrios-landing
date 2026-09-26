// =============================================================================
// tests/nexus-document-gate.test.mjs — the homepage-document gate on BOTH
// /api/nexus/chat and /api/nexus/reset.
//
// Run: node --test tests/nexus-document-gate.test.mjs
//
// The defect this narrows (it does not close it — see below): the Origin gate
// proves a call came from THIS SITE, not from which of the site's pages. So a
// script on any same-origin page — the
// historical pages (terms-of-service.html, founder.html, command-center.html and
// the rest) that still load unpinned off-origin scripts, above all — could
// `fetch('/api/nexus/chat', {credentials:'same-origin'})`, pass the Origin gate,
// and spend the assistant's 100-per-UTC-day provider budget as that visitor.
//
// The gate requires a browser-set `Referer` whose origin is this site's and
// whose pathname is the homepage.
//
// WHAT THIS FILE DOES AND DOES NOT PROVE. Every test below hands the handler a
// `Request` whose `referer` header this file chose, so what it pins is the
// gate's DECISION FUNCTION over header values: which values are admitted, which
// are refused, that the two routes decide identically, and that a refusal costs
// nothing upstream. All of that is real and worth pinning.
//
// It does NOT prove that a page cannot choose the value. `Referer` is a
// forbidden header NAME, so the `headers` option of fetch/XHR cannot set it
// (row `L` of the review below, and the reason a CUSTOM header would have been
// no control at all). But `RequestInit.referrer` can: the Fetch standard honours
// a SAME-ORIGIN referrer verbatim and only downgrades a cross-origin one, so
// `fetch('/api/nexus/chat', { referrer: '/' })` from ANY page of this site is
// admitted. That was measured in real Chromium on 2026-09-25 from
// /terms-of-service.html and /founder.html, on both routes, with an upstream
// recorder showing five real dispatches. No handler-level fixture can catch it,
// because the attacker's referrer is a browser decision and this file's is a
// string its author typed. See the LIMITATION note on `isHomepageDocument` in
// app/api/nexus/chat/route.ts: under controller ruling R44 the gate is kept as
// defence in depth against a naive or accidental same-origin caller, and it is
// NOT a security boundary. The test that would catch the bypass is a real-browser
// one (load a non-homepage page, call fetch with `referrer: '/'`, assert 403 and
// zero upstream hits); it is not in this offline suite.
//
// The real acceptance criterion is not the status code. It is that a refused
// request costs NOTHING: every rejection below is asserted to have made ZERO
// upstream fetches, measured with a fetch spy that is deliberately stubbed to
// SUCCEED. If the gate ever leaked, the spy would record a call and return 200,
// so the failure is loud rather than masked by a throwing stub.
//
// Both routes are exercised from one table on purpose: the rule must be
// identical on both, and a drift would otherwise be a difference nobody reads.
// The core is never contacted; nothing here binds a port or touches the network.
// =============================================================================

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import { after, afterEach, before, beforeEach, test } from 'node:test';

import { PUBLIC_ROOT, headersForPath } from './support/next-headers.mjs';

// The chat route imports the SSE pump with an extensionless relative specifier
// (as Next/TS require); Node ESM needs the extension. Same inline resolve hook
// the chat route's own tests register — no extra files, no project config.
register(
  'data:text/javascript,' +
    encodeURIComponent(`
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (err) {
    if (err?.code === 'ERR_MODULE_NOT_FOUND' && /^\\.{1,2}\\//.test(specifier) && !/\\.[a-z]+$/i.test(specifier)) {
      return next(specifier + '.ts', context);
    }
    throw err;
  }
}
`),
  import.meta.url,
);

const SITE = 'https://barriosa2i.com';
const CORE = 'https://core.example.test';
const SECRET = 'a'.repeat(32);
const CONVERSATION = 'x-nexus-conversation';
const TOKEN = 'v1.SomeConversationId.1758700000000.bWFj';
const HOMEPAGE_REFERER = `${SITE}/`;

const CHAT_SOURCE = new URL('../app/api/nexus/chat/route.ts', import.meta.url);
const RESET_SOURCE = new URL('../app/api/nexus/reset/route.ts', import.meta.url);

/**
 * The two routes, described uniformly so one table can drive both.
 *
 * `reset` needs a conversation token to get past its own tokenless-reset check;
 * the document gate runs BEFORE that check, which is asserted separately below.
 */
const ROUTES = [];

before(async () => {
  const chat = await import('../app/api/nexus/chat/route.ts');
  const reset = await import('../app/api/nexus/reset/route.ts');
  for (const [name, mod, headers] of [
    ['chat', chat, {}],
    ['reset', reset, { [CONVERSATION]: TOKEN }],
  ]) {
    assert.equal(typeof mod.POST, 'function', `${name} must export POST`);
    // The gate must not have added an export to a route file; App Router
    // forbids arbitrary exports and both route tests pin this surface.
    assert.deepEqual(Object.keys(mod).sort(), ['POST', 'dynamic', 'maxDuration', 'runtime']);
    ROUTES.push({ name, POST: mod.POST, url: `${SITE}/api/nexus/${name}`, headers });
  }
  assert.equal(ROUTES.length, 2, 'both routes must be under test, not one');
});

const ENV_KEYS = ['NEXUS_CHAT_ENABLED', 'NEXUS_CORE_URL', 'NEXUS_PROXY_SECRET'];
const savedEnv = {};
const realFetch = globalThis.fetch;
const realLog = console.log;
let logLines = [];
let fetchCalls = [];

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  logLines = [];
  console.log = (...args) => logLines.push(args.map(String).join(' '));
  fetchCalls = [];
  // Deliberately a SUCCEEDING stub, not a throwing one: a leak through the gate
  // then shows up as a recorded call and a 200, never as an incidental error
  // that a rejection assertion would have swallowed.
  spyFetch();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  console.log = realLog;
  globalThis.fetch = realFetch;
});

after(() => {
  console.log = realLog;
  globalThis.fetch = realFetch;
});

function enableEnv(overrides = {}) {
  process.env.NEXUS_CHAT_ENABLED = '1';
  process.env.NEXUS_CORE_URL = CORE;
  process.env.NEXUS_PROXY_SECRET = SECRET;
  Object.assign(process.env, overrides);
}

/** The core's ordinary pre-stream answer: small JSON carrying a string `code`. */
const sentinelUpstream = () =>
  new Response('{"code":"sentinel","message":"THE GATE LEAKED AND REACHED UPSTREAM"}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });

function spyFetch(responder = sentinelUpstream) {
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return responder(url, init);
  };
}

/**
 * A request to `route` carrying an approved Origin. `referer` is passed through
 * verbatim when it is a string (including the empty string, which is what a
 * header present with no value looks like) and omitted entirely when it is
 * `null`. It cannot be `undefined`: that is the default-parameter value, so
 * `undefined` would silently mean "send the homepage Referer" — which is exactly
 * how the first draft of this file managed to assert nothing.
 */
function makeRequest(route, { referer = HOMEPAGE_REFERER, origin = SITE, headers = {}, body = '{"message":"hi"}' } = {}) {
  const h = new Headers({ 'content-type': 'application/json', ...route.headers, ...headers });
  if (origin !== null) h.set('origin', origin);
  if (referer !== null) h.set('referer', referer);
  return new Request(route.url, { method: 'POST', headers: h, body });
}

async function expectJsonError(res, status, code) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
  const body = await res.json();
  assert.equal(body.code, code);
  assert.equal(typeof body.message, 'string');
  return body;
}

/** The full bad-ingress contract, plus the zero-cost property that matters. */
async function expectRefusedAtNoCost(res, label) {
  const body = await expectJsonError(res, 403, 'bad_origin');
  assert.equal(body.message, 'ingress authentication required', label);
  assert.equal(res.headers.has('access-control-allow-origin'), false, `${label}: no CORS header`);
  assert.equal(res.headers.has('access-control-allow-credentials'), false, `${label}: no CORS header`);
  assert.equal(fetchCalls.length, 0, `${label}: a refused request must make ZERO upstream fetches`);
  return body;
}

// ---------------------------------------------------------------------------
// The tables. Every row is exercised against BOTH routes.
// ---------------------------------------------------------------------------

// Accepted: exactly one document, in the spellings a real browser produces.
const ACCEPT = [
  ['the homepage', `${SITE}/`],
  // Controller ruling R43, measured against production: the homepage answers
  // 200 with the panel at BOTH `/` (X-Matched-Path: /) and `/index.html`
  // (X-Matched-Path: /index.html). A literal pathname === '/' would have refused
  // the assistant for every visitor whose document URL is /index.html.
  ['the homepage as /index.html (ruling R43)', `${SITE}/index.html`],
  // A query string or hash must not change the decision: `search` and `hash` are
  // not part of `pathname`, so this needs no stripping code to get right.
  ['the homepage with a query string', `${SITE}/?utm=x`],
  ['the homepage with a hash', `${SITE}/#panel`],
  ['the homepage with both', `${SITE}/?utm=x&b=2#panel`],
  ['/index.html with a query string', `${SITE}/index.html?x=1`],
  ['/index.html with a hash', `${SITE}/index.html#panel`],
  ['/index.html with both', `${SITE}/index.html?x=1#panel`],
  // The default port is not a different origin, and the URL parser drops it.
  ['the homepage on the explicit default port', 'https://barriosa2i.com:443/'],
  // A traversal string that RESOLVES to the homepage denotes the homepage: it is
  // the same document, and it is what the browser would have serialised anyway.
  ['a traversal that resolves to the homepage', `${SITE}/founder.html/../`],
  ['a traversal that resolves to /index.html', `${SITE}/founder.html/../index.html`],
  ['a dot segment that resolves to the homepage', `${SITE}/./`],
  ['a duplicated slash collapsed by the parser', `${SITE}/a/../`],
];

// Refused. Every entry is a same-origin page, a foreign document, or a spelling
// that does not parse to the homepage.
const REJECT = [
  // 1. No Referer at all — the header omitted.
  ['no Referer header', null],
  // A header present but empty is the same absence of a document.
  ['an empty Referer header', ''],

  // 2. Same-origin pages other than the homepage — the naive and accidental
  //    caller, which is what this gate genuinely turns away. A caller that sets
  //    `referrer` instead of sending its own document's URL is not modelled here
  //    and is not refused in a browser; see the header note.
  ['/terms-of-service.html', `${SITE}/terms-of-service.html`],
  ['/founder.html', `${SITE}/founder.html`],
  ['/command-center.html', `${SITE}/command-center.html`],
  ['/privacy-directive.html', `${SITE}/privacy-directive.html`],
  ['/contact.html', `${SITE}/contact.html`],
  ['/nexus-personal.html', `${SITE}/nexus-personal.html`],
  ['an arbitrary other same-origin path', `${SITE}/some/other/page`],
  ['an extensionless route', `${SITE}/founder`],
  ['the API route itself', `${SITE}/api/nexus/chat`],
  ['a static asset', `${SITE}/js/meet-gary.js`],
  ['the site root as a directory listing of another folder', `${SITE}/dashboard/`],

  // 3. Unparseable / non-http documents.
  ['an unparseable Referer', 'not a url'],
  ['a path-only Referer (no base is supplied, so it does not parse)', '/'],
  ['a path-only Referer naming the homepage file', '/index.html'],
  ['a protocol-relative Referer', '//barriosa2i.com/'],
  ['a javascript: URL', 'javascript:alert(1)'],
  ['about:blank', 'about:blank'],
  ['a data: URL', 'data:text/html,<script>fetch("/api/nexus/chat")</script>'],
  ['a bare word', 'homepage'],
  ['an empty-ish whitespace Referer', '   '],

  // 4. Foreign origins — including one whose PATH is the homepage, which is the
  //    case a pathname-only check would have waved through.
  ['a foreign origin', 'https://evil.example/'],
  ['a foreign origin on the homepage path', 'https://evil.example/index.html'],
  ['a foreign origin that merely contains our host', 'https://barriosa2i.com.evil.example/'],
  ['a subdomain of our host', 'https://attacker.barriosa2i.com/'],
  ['our host with a trailing dot', 'https://barriosa2i.com./'],
  ['our host over http', 'http://barriosa2i.com/'],
  ['our host on another port', 'https://barriosa2i.com:8443/'],
  ['our host with embedded credentials', 'https://u:p@barriosa2i.com/'],
  ['our host with an embedded username only', 'https://admin@barriosa2i.com/'],

  // 5. Bypass attempts on the normalization itself. None of these parses to `/`
  //    or `/index.html`, and none is decoded into one.
  ['a percent-encoded first letter', `${SITE}/%69ndex.html`],
  ['a percent-encoded slash before the file', `${SITE}/%2findex.html`],
  ['an upper-case spelling', `${SITE}/INDEX.HTML`],
  ['a mixed-case spelling', `${SITE}/Index.html`],
  ['a trailing slash after the file', `${SITE}/index.html/`],
  ['a dot segment after the file', `${SITE}/index.html/.`],
  ['a NUL escape appended', `${SITE}/index.html%00`],
  ['a semicolon parameter appended', `${SITE}/index.html;x`],
  ['a longer filename with the same prefix', `${SITE}/index.htmlx`],
  ['a backup spelling', `${SITE}/index.html.bak`],
  ['the homepage file nested in a folder', `${SITE}/nexus-panel/index.html`],
  ['a leading duplicated slash', `${SITE}//index.html`],
  ['a space-encoded prefix', `${SITE}/ index.html`],
  // The reverse traversal: a string that LOOKS like the homepage but resolves
  // to another page must be judged by where it actually points.
  ['a traversal out of the homepage into another page', `${SITE}/index.html/../terms-of-service.html`],
  ['an encoded traversal into another page', `${SITE}/%2e%2e/terms-of-service.html`],
  ['a traversal that resolves to another page', `${SITE}/a/b/../../founder.html`],
];

test('the exact accept set: only a homepage Referer VALUE is admitted, on both routes', async () => {
  for (const route of ROUTES) {
    for (const [label, referer] of ACCEPT) {
      enableEnv();
      fetchCalls = [];
      spyFetch();
      const res = await route.POST(makeRequest(route, { referer }));
      assert.equal(res.status, 200, `${route.name}: ${label} must be accepted (Referer: ${referer})`);
      assert.equal(fetchCalls.length, 1, `${route.name}: ${label} must reach upstream exactly once`);
      assert.equal(fetchCalls[0].url, `${CORE}/api/nexus/${route.name}`);
    }
  }
});

test('the exact reject set: every other Referer VALUE is refused with the bad-origin contract, on both routes', async () => {
  for (const route of ROUTES) {
    for (const [label, referer] of REJECT) {
      enableEnv();
      fetchCalls = [];
      spyFetch();
      const res = await route.POST(makeRequest(route, { referer }));
      await expectRefusedAtNoCost(res, `${route.name}: ${label} (Referer: ${String(referer)})`);
    }
  }
});

// ---------------------------------------------------------------------------
// The acceptance criterion, stated once over the whole reject set.
//
// Not "each rejection happened to make no call" checked case by case, but one
// spy across every rejected request on both routes: the total must be zero.
// ---------------------------------------------------------------------------
test('ZERO upstream fetches across every rejected request on both routes (the acceptance criterion)', async () => {
  enableEnv();
  fetchCalls = [];
  spyFetch();
  let refused = 0;
  for (const route of ROUTES) {
    for (const [, referer] of REJECT) {
      const res = await route.POST(makeRequest(route, { referer }));
      assert.equal(res.status, 403);
      refused += 1;
    }
    // A foreign Origin is refused by the gate before this one, and costs nothing
    // either; both refusals belong to the same ledger.
    const foreign = await route.POST(makeRequest(route, { origin: 'https://evil.example' }));
    assert.equal(foreign.status, 403);
    refused += 1;
  }
  assert.equal(refused, REJECT.length * 2 + 2, 'every row ran on both routes');
  assert.equal(
    fetchCalls.length,
    0,
    `${refused} refused requests must have spent NOTHING; the spy recorded ${fetchCalls.length} upstream call(s)`,
  );
  // And the spy is genuinely wired: the same spy records an accepted request.
  const ok = await ROUTES[0].POST(makeRequest(ROUTES[0], { referer: HOMEPAGE_REFERER }));
  assert.equal(ok.status, 200);
  assert.equal(fetchCalls.length, 1, 'the spy must be capable of recording a call at all');
});

// ---------------------------------------------------------------------------
// The refusal is indistinguishable from the pre-existing bad-origin refusal.
// ---------------------------------------------------------------------------
test('a refused document and a refused origin produce byte-identical refusals, on both routes', async () => {
  for (const route of ROUTES) {
    enableEnv();
    const badDoc = await route.POST(makeRequest(route, { referer: `${SITE}/terms-of-service.html` }));
    const badOrg = await route.POST(makeRequest(route, { origin: 'https://evil.example' }));
    assert.equal(badDoc.status, badOrg.status, `${route.name}: same status`);
    assert.equal(await badDoc.text(), await badOrg.text(), `${route.name}: same body bytes`);
    const headerNames = (res) => [...res.headers.keys()].sort();
    assert.deepEqual(headerNames(badDoc), headerNames(badOrg), `${route.name}: same header set`);
    assert.deepEqual(headerNames(badDoc), ['cache-control', 'content-type'], `${route.name}: and nothing else`);
  }
});

test('the refusal log line is the ordinary bounded one: route/status/ms, no Referer, no token, no body', async () => {
  for (const route of ROUTES) {
    enableEnv();
    logLines = [];
    await route.POST(
      makeRequest(route, {
        referer: `${SITE}/terms-of-service.html?leak=SENSITIVE-QUERY`,
        headers: { cookie: 'nexus_sid=SENSITIVE-COOKIE' },
        body: '{"message":"SENSITIVE-BODY"}',
      }),
    );
    assert.equal(logLines.length, 1, `${route.name}: exactly one line`);
    const entry = JSON.parse(logLines[0]);
    assert.deepEqual(Object.keys(entry).sort(), ['ms', 'route', 'status']);
    assert.equal(entry.route, `nexus-${route.name}`);
    assert.equal(entry.status, 403);
    assert.doesNotMatch(logLines[0], /SENSITIVE|terms-of-service|referer|a{32}/i);
  }
});

// ---------------------------------------------------------------------------
// Ordering: where the gate sits, and that nothing later can mask it.
// ---------------------------------------------------------------------------
test('the Origin gate still runs first: a foreign Origin is refused even with a homepage Referer', async () => {
  for (const route of ROUTES) {
    enableEnv();
    fetchCalls = [];
    spyFetch();
    const res = await route.POST(makeRequest(route, { origin: 'https://evil.example', referer: HOMEPAGE_REFERER }));
    await expectRefusedAtNoCost(res, `${route.name}: foreign Origin + homepage Referer`);
  }
});

test('the kill switch still runs before the document gate', async () => {
  for (const route of ROUTES) {
    fetchCalls = [];
    spyFetch();
    const res = await route.POST(makeRequest(route, { referer: `${SITE}/founder.html` }));
    await expectJsonError(res, 503, 'disabled');
    assert.equal(fetchCalls.length, 0);
  }
});

test('the document gate runs before content-type and the body cap, so neither can mask it', async () => {
  for (const route of ROUTES) {
    enableEnv();
    fetchCalls = [];
    spyFetch();
    // Non-JSON content type AND an over-cap declared length AND a body stream
    // that throws if anyone reads it. The answer must still be the 403.
    const h = new Headers({ 'content-type': 'text/plain', origin: SITE, 'content-length': '99999', ...route.headers });
    h.set('referer', `${SITE}/founder.html`);
    const req = new Request(route.url, {
      method: 'POST',
      headers: h,
      body: new ReadableStream({
        pull() {
          throw new Error('the body must never be read on a refused document');
        },
      }),
      duplex: 'half',
    });
    await expectRefusedAtNoCost(await route.POST(req), `${route.name}: refused before content-type/body`);
  }
});

test('reset still refuses a tokenless reset before any upstream call, with the homepage Referer present', async () => {
  const reset = ROUTES.find((r) => r.name === 'reset');
  enableEnv();
  fetchCalls = [];
  spyFetch();
  const h = new Headers({ 'content-type': 'application/json', origin: SITE, referer: HOMEPAGE_REFERER });
  const res = await reset.POST(new Request(reset.url, { method: 'POST', headers: h, body: '{"v":1}' }));
  await expectJsonError(res, 400, 'invalid_input');
  assert.equal(fetchCalls.length, 0, 'a tokenless reset costs nothing');
});

test('an accepted document still forwards nothing new upstream: no Referer is relayed to the core', async () => {
  for (const route of ROUTES) {
    enableEnv();
    fetchCalls = [];
    spyFetch();
    const res = await route.POST(makeRequest(route, { referer: `${SITE}/index.html?utm=leak` }));
    assert.equal(res.status, 200);
    assert.equal(fetchCalls.length, 1);
    const sent = Object.keys(fetchCalls[0].init.headers).map((k) => k.toLowerCase());
    assert.equal(sent.includes('referer'), false, `${route.name}: the visitor's document URL stays on this side`);
    assert.equal(sent.includes('referrer'), false);
  }
});

// ---------------------------------------------------------------------------
// The two routes implement ONE rule, not two that look alike.
// ---------------------------------------------------------------------------
/** Extract a top-level declaration block (`kind name ... \n}`) from a source. */
function extractBlock(source, opening) {
  const start = source.indexOf(opening);
  assert.ok(start >= 0, `source must declare: ${opening}`);
  const end = source.indexOf('\n}', start);
  assert.ok(end > start, `declaration must close: ${opening}`);
  return source.slice(start, end + 2);
}

test('both routes carry the SAME gate implementation, character for character', async () => {
  const [chat, reset] = await Promise.all([readFile(CHAT_SOURCE, 'utf8'), readFile(RESET_SOURCE, 'utf8')]);
  const opening = 'function isHomepageDocument(request: Request): boolean {';
  assert.equal(
    extractBlock(chat, opening),
    extractBlock(reset, opening),
    'a divergence between the two gates is a hole in one of them',
  );
  // And the same single refusal expression.
  const refusal = "const badOrigin = (): Response => jsonError(403, 'bad_origin', 'ingress authentication required');";
  for (const [name, source] of [['chat', chat], ['reset', reset]]) {
    assert.ok(source.includes(refusal), `${name} must refuse through the one shared bad-origin expression`);
  }
});

test('the normalization is an explicit, commented step naming both homepage spellings (ruling R43)', async () => {
  for (const [name, url] of [['chat', CHAT_SOURCE], ['reset', RESET_SOURCE]]) {
    const source = await readFile(url, 'utf8');
    assert.match(source, /const HOMEPAGE_PATHNAME = '\/';/, `${name}: the homepage pathname is named`);
    assert.match(source, /const HOMEPAGE_PATHNAME_ALIAS = '\/index\.html';/, `${name}: and its one alias`);
    assert.match(source, /X-Matched-Path/, `${name}: the production measurement behind the alias is recorded`);
    // The decision is made on the PARSED pathname. A regex or substring match on
    // the raw header would be the bug this pins against.
    assert.match(source, /const pathname = documentUrl.pathname;/, `${name}: derived from the URL parser`);
    assert.doesNotMatch(
      source,
      /referer.*\.(?:startsWith|endsWith|includes)\(/i,
      `${name}: the raw Referer string must never be string-matched`,
    );
  }
});

// ---------------------------------------------------------------------------
// The gate depends on the browser sending a full same-origin Referer. Declaring
// a Referrer-Policy would silently break the assistant, so pin its absence.
// ---------------------------------------------------------------------------
test('no Referrer-Policy is declared for the homepage, so the browser default still sends the full URL', async () => {
  for (const pathname of ['/', '/index.html', '/api/nexus/chat', '/api/nexus/reset']) {
    const headers = await headersForPath(pathname);
    assert.equal(
      headers['referrer-policy'],
      undefined,
      `${pathname} must declare no Referrer-Policy: a stricter one would strip the pathname the gate reads`,
    );
  }
  const home = await readFile(new URL('index.html', `file:///${PUBLIC_ROOT.split('\\').join('/')}/`), 'utf8');
  assert.doesNotMatch(home, /<meta[^>]+name=["']referrer["']/i, 'no referrer meta on the homepage either');
  // And the widget must not opt out per request; `referrerPolicy` on the fetch
  // would defeat the gate just as thoroughly as a header would.
  assert.doesNotMatch(home, /referrerPolicy/i, 'the widget must not set a per-request referrer policy');
});

// ---------------------------------------------------------------------------
// The compensating fact behind the whole gate: the one admitted page runs no
// third-party executable code of its own. That keeps the honest path clean; it
// does not stop another page's script from claiming the homepage's referrer, so
// this test is hygiene for the admitted document, not proof of exclusivity.
// ---------------------------------------------------------------------------
test('the homepage loads no third-party executable script (asserted against public/index.html)', async () => {
  const raw = await readFile(new URL('index.html', `file:///${PUBLIC_ROOT.split('\\').join('/')}/`), 'utf8');
  // A host named in a comment is documentation; a host named in a tag is a
  // dependency. Only the latter can put third-party code on the page.
  const html = raw.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');

  const sources = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1]);
  assert.ok(sources.length > 0, 'the homepage does load at least one script, so the scan is not vacuous');
  const offOrigin = sources.filter((src) => /^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(src));
  assert.deepEqual(offOrigin, [], 'every homepage script must be first-party');
  for (const src of sources) {
    assert.match(src, /^\/[^/]/, `${src} must be a root-relative first-party path`);
  }

  assert.doesNotMatch(html, /<iconify-icon/i, 'no custom element that needs a remote script');
  assert.doesNotMatch(html, /\/\/code\.iconify\.design/, 'no Iconify script host');
  assert.doesNotMatch(html, /import\s*\(\s*['"`]https?:/i, 'no dynamic import of remote code');
  assert.doesNotMatch(html, /createElement\(\s*['"]script['"]\s*\)/i, 'no injected script element');
  assert.doesNotMatch(html, /<script[^>]*\bsrc\s*=\s*["']\s*(?:https?:)?\/\//i, 'no absolute script src at all');
});

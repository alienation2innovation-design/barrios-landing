// =============================================================================
// tests/nexus-reset-route.test.mjs — handler tests for app/api/nexus/reset/route.ts
//
// Run: node --test tests/nexus-reset-route.test.mjs
//
// The reset proxy is the chat proxy's twin: same-origin gate, shared proxy
// secret, forward only the conversation token and the nexus_sid cookie, a small
// body cap, exactly one upstream attempt, a short timeout, no CORS header, and a
// bounded log line with no token, body or IP. These tests assert each of those
// properties against the same fixtures the chat route's tests use, so a drift
// between the two routes shows up as a failure here rather than as a difference
// nobody reads.
//
// Like the chat tests, this runs the real route file: Node 24 strips the
// TypeScript types, `globalThis.fetch` is stubbed per test, and the NEXUS core
// is never contacted.
// =============================================================================

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { after, afterEach, before, beforeEach, test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let POST;
before(async () => {
  const mod = await import('../app/api/nexus/reset/route.ts');
  POST = mod.POST;
  assert.equal(typeof POST, 'function');
  assert.equal(mod.runtime, 'nodejs', 'Node runtime: AbortSignal.any and getSetCookie()');
  assert.equal(mod.dynamic, 'force-dynamic', 'a live proxy is never cacheable');
  // A reset has no stream to unwind, so it must not be allowed to hold a
  // function open for a chat turn's budget.
  assert.equal(mod.maxDuration, 15);
  // App Router forbids arbitrary exports from route files.
  assert.deepEqual(Object.keys(mod).sort(), ['POST', 'dynamic', 'maxDuration', 'runtime']);
});

const SITE = 'https://barriosa2i.com';
const CORE = 'https://core.example.test';
const SECRET = 'a'.repeat(32);
const CONVERSATION = 'x-nexus-conversation';
const TOKEN = 'v1.SomeConversationId.1758700000000.bWFj';

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
  globalThis.fetch = async () => {
    throw new Error('fetch must be stubbed per test');
  };
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

function makeRequest({
  headers = {},
  body = '{"v":1}',
  origin = SITE,
  sameOriginHint = false,
  token = TOKEN
} = {}) {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  if (origin !== null) h.set('origin', origin);
  if (sameOriginHint) h.set('sec-fetch-site', 'same-origin');
  if (token !== null && !('x-nexus-conversation' in headers)) h.set(CONVERSATION, token);
  return new Request(`${SITE}/api/nexus/reset`, { method: 'POST', headers: h, body });
}

function stubFetch(responder) {
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return responder(url, init);
  };
}

/** The core's ordinary answer: small JSON with a string `code`, never a stream. */
const coreOk = (status = 200, extra = {}) =>
  new Response('{"code":"reset","message":"done"}', {
    status,
    headers: { 'content-type': 'application/json', ...extra }
  });

async function expectJsonError(res, status, code) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
  const body = await res.json();
  assert.equal(body.code, code);
  assert.equal(typeof body.message, 'string');
  return body;
}

// ---------------------------------------------------------------------------
// 1. the kill switch — the SAME switch as chat
// ---------------------------------------------------------------------------
test('the chat kill switch also gates reset: unset -> 503 disabled, no upstream call', async () => {
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'disabled');
  assert.equal(fetchCalls.length, 0);
});

test('NEXUS_CHAT_ENABLED set to anything but "1" -> 503 disabled', async () => {
  for (const value of ['0', 'true', 'yes', '', ' 1']) {
    process.env.NEXUS_CHAT_ENABLED = value;
    process.env.NEXUS_CORE_URL = CORE;
    process.env.NEXUS_PROXY_SECRET = SECRET;
    const res = await POST(makeRequest());
    await expectJsonError(res, 503, 'disabled');
  }
  assert.equal(fetchCalls.length, 0, 'a disabled assistant never reaches the core');
});

// ---------------------------------------------------------------------------
// 2. environment — fails closed, names nothing
// ---------------------------------------------------------------------------
test('enabled but missing or unsafe env -> 503 provider_unavailable, message names no variable', async () => {
  const cases = [
    {},
    { NEXUS_CORE_URL: CORE },
    { NEXUS_PROXY_SECRET: SECRET },
    { NEXUS_CORE_URL: 'http://core.example.test', NEXUS_PROXY_SECRET: SECRET },
    { NEXUS_CORE_URL: 'https://user:pw@core.example.test', NEXUS_PROXY_SECRET: SECRET },
    { NEXUS_CORE_URL: 'https://core.example.test/?x=1', NEXUS_PROXY_SECRET: SECRET },
    { NEXUS_CORE_URL: 'https://core.example.test/base', NEXUS_PROXY_SECRET: SECRET },
    { NEXUS_CORE_URL: 'not a url', NEXUS_PROXY_SECRET: SECRET }
  ];
  for (const env of cases) {
    process.env.NEXUS_CHAT_ENABLED = '1';
    delete process.env.NEXUS_CORE_URL;
    delete process.env.NEXUS_PROXY_SECRET;
    Object.assign(process.env, env);
    const res = await POST(makeRequest());
    const body = await expectJsonError(res, 503, 'provider_unavailable');
    assert.doesNotMatch(body.message, /NEXUS_|SECRET|URL/i, 'the body must never name the missing variable');
  }
  assert.equal(fetchCalls.length, 0);
});

test('a secret shorter than 32 after trim -> 503 provider_unavailable', async () => {
  enableEnv({ NEXUS_PROXY_SECRET: `  ${'a'.repeat(31)}  ` });
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'provider_unavailable');
  assert.equal(fetchCalls.length, 0);
});

// ---------------------------------------------------------------------------
// 3. the same-origin gate — the route's only authentication
// ---------------------------------------------------------------------------
test('a foreign Origin -> 403 bad_origin, and sec-fetch-site cannot rescue it', async () => {
  enableEnv();
  const foreign = await POST(makeRequest({ origin: 'https://evil.example' }));
  await expectJsonError(foreign, 403, 'bad_origin');

  const rescued = await POST(makeRequest({ origin: 'https://evil.example', sameOriginHint: true }));
  await expectJsonError(rescued, 403, 'bad_origin');

  const none = await POST(makeRequest({ origin: null }));
  await expectJsonError(none, 403, 'bad_origin');

  const crossSite = await POST(makeRequest({ origin: null, headers: { 'sec-fetch-site': 'cross-site' } }));
  await expectJsonError(crossSite, 403, 'bad_origin');

  assert.equal(fetchCalls.length, 0, 'a cross-origin caller never reaches the core');
});

test('no Origin but sec-fetch-site: same-origin is accepted, like chat', async () => {
  enableEnv();
  stubFetch(() => coreOk());
  const res = await POST(makeRequest({ origin: null, sameOriginHint: true }));
  assert.equal(res.status, 200);
  assert.equal(fetchCalls.length, 1);
});

// ---------------------------------------------------------------------------
// 4. content type and 5. the small body cap
// ---------------------------------------------------------------------------
test('a non-JSON content-type -> 400 invalid_input before the body is read', async () => {
  enableEnv();
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', '']) {
    const res = await POST(makeRequest({ headers: { 'content-type': type } }));
    await expectJsonError(res, 400, 'invalid_input');
  }
  assert.equal(fetchCalls.length, 0);
});

test('the body cap is 512 bytes, enforced on the declared length and on the real stream', async () => {
  enableEnv();
  stubFetch(() => coreOk());

  const declared = await POST(makeRequest({ headers: { 'content-length': '9000' } }));
  await expectJsonError(declared, 413, 'payload_too_large');
  assert.equal(fetchCalls.length, 0, 'an oversize declaration is refused before any of it is read');

  // No content-length: a chunked stream must still be cut off at the cap.
  const oversize = new Uint8Array(513).fill(0x61);
  const streamed = await POST(
    new Request(`${SITE}/api/nexus/reset`, {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json', origin: SITE, [CONVERSATION]: TOKEN }),
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(oversize);
          controller.close();
        }
      }),
      duplex: 'half'
    })
  );
  await expectJsonError(streamed, 413, 'payload_too_large');
  assert.equal(fetchCalls.length, 0);

  // 512 bytes exactly is accepted: the cap is a ceiling, not an off-by-one.
  const exact = `{"v":1,"p":"${'a'.repeat(512 - 12)}"}`.slice(0, 512);
  const accepted = await POST(makeRequest({ body: exact }));
  assert.equal(accepted.status, 200);
  assert.equal(fetchCalls.length, 1);
});

// ---------------------------------------------------------------------------
// 6. the token is required on the wire, and is never inspected
// ---------------------------------------------------------------------------
test('a reset with no conversation token -> 400 invalid_input and no upstream call', async () => {
  enableEnv();
  stubFetch(() => coreOk());
  const res = await POST(makeRequest({ token: null }));
  await expectJsonError(res, 400, 'invalid_input');
  assert.equal(fetchCalls.length, 0, 'there is nothing to revoke, so nothing is asked of the core');
});

test('the proxy validates nothing about the token: any string is forwarded verbatim', async () => {
  enableEnv();
  // Hostile shapes: wrong version, wrong field count, non-ASCII, a very long
  // value, one that looks like a header injection. The core is the only
  // authority, so each one must reach it unaltered and nothing may crash.
  const hostile = [
    'v9.nope.0.zzzz',
    'not-a-token-at-all',
    'v1.ünïcödé.1.mac',
    'v1.' + 'A'.repeat(4096) + '.1.mac',
    // Looks like an attempt at header or query injection; the proxy neither
    // sanitises nor rejects it, because judging tokens is the core's job.
    'v1.a.1.mac; evil=1, other: value'
  ];
  for (const value of hostile) {
    fetchCalls = [];
    stubFetch(() => coreOk());
    const res = await POST(makeRequest({ token: value }));
    assert.equal(res.status, 200, `the proxy must not judge ${JSON.stringify(value.slice(0, 20))}`);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].init.headers[CONVERSATION], value, 'forwarded byte for byte, unparsed and untruncated');
  }
});

// ---------------------------------------------------------------------------
// 7. the upstream request shape
// ---------------------------------------------------------------------------
test('upstream request: reset path, secret, ip precedence, only nexus_sid, one attempt, no redirect', async () => {
  enableEnv();
  stubFetch(() => coreOk());
  const res = await POST(
    makeRequest({
      headers: {
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
        'x-real-ip': '198.51.100.7',
        'x-vercel-forwarded-for': '192.0.2.44',
        cookie: '__session=clerk-secret; nexus_sid=abc123; _ga=GA1.2.3',
        authorization: 'Bearer should-not-be-forwarded'
      }
    })
  );
  assert.equal(res.status, 200);
  assert.equal(fetchCalls.length, 1, 'exactly one upstream attempt, no retry');
  const { url, init } = fetchCalls[0];
  assert.equal(url, `${CORE}/api/nexus/reset`, 'the core endpoint from the contract');
  assert.equal(init.method, 'POST');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.redirect, 'error', 'a misconfigured core can never bounce the secret to a third party');
  assert.ok(init.signal instanceof AbortSignal, 'a short timeout, and the client disconnecting, both abort it');
  assert.ok(init.body instanceof Uint8Array);
  const h = init.headers;
  assert.equal(h['content-type'], 'application/json');
  assert.equal(h['content-length'], String(init.body.byteLength));
  assert.equal(h.accept, 'application/json', 'no SSE: a reset answer is small JSON');
  assert.equal(h['x-nexus-proxy-auth'], SECRET);
  assert.equal(h['x-nexus-client-ip'], '192.0.2.44', 'x-vercel-forwarded-for wins');
  assert.equal(h.cookie, 'nexus_sid=abc123', 'every other cookie is dropped at the website boundary');
  assert.equal(h[CONVERSATION], TOKEN);
  assert.equal('authorization' in h, false);
  assert.equal('x-forwarded-for' in h, false);
  assert.equal('x-nexus-conversation-reset' in h, false, 'the retired ride-along header is not reintroduced here');
  assert.deepEqual(
    Object.keys(h).sort(),
    ['accept', 'content-length', 'content-type', 'cookie', CONVERSATION, 'x-nexus-client-ip', 'x-nexus-proxy-auth'].sort(),
    'the forwarded-header allowlist is exactly this'
  );
});

test('ip fallback order and truncation match chat', async () => {
  enableEnv();
  stubFetch(() => coreOk());
  await POST(makeRequest({ headers: { 'x-real-ip': '198.51.100.7', 'x-forwarded-for': '203.0.113.9' } }));
  assert.equal(fetchCalls[0].init.headers['x-nexus-client-ip'], '198.51.100.7');

  fetchCalls = [];
  stubFetch(() => coreOk());
  await POST(makeRequest({ headers: { 'x-forwarded-for': ' 203.0.113.9 , 10.0.0.1' } }));
  assert.equal(fetchCalls[0].init.headers['x-nexus-client-ip'], '203.0.113.9');

  fetchCalls = [];
  stubFetch(() => coreOk());
  await POST(makeRequest());
  assert.equal(fetchCalls[0].init.headers['x-nexus-client-ip'], '');

  fetchCalls = [];
  stubFetch(() => coreOk());
  await POST(makeRequest({ headers: { 'x-real-ip': 'z'.repeat(200) } }));
  assert.equal(fetchCalls[0].init.headers['x-nexus-client-ip'].length, 45, 'truncated to the longest textual IPv6');
});

test('no nexus_sid cookie -> no cookie header is sent upstream', async () => {
  enableEnv();
  stubFetch(() => coreOk());
  await POST(makeRequest({ headers: { cookie: '__session=clerk-secret; _ga=GA1.2.3' } }));
  assert.equal('cookie' in fetchCalls[0].init.headers, false);

  fetchCalls = [];
  stubFetch(() => coreOk());
  await POST(makeRequest({ headers: { cookie: 'nexus_sid=' } }));
  assert.equal('cookie' in fetchCalls[0].init.headers, false, 'an empty value is not a session');
});

// ---------------------------------------------------------------------------
// 8. the response — no CORS, no token, no stream
// ---------------------------------------------------------------------------
test('the response sets no CORS header and no conversation token, on success or refusal', async () => {
  enableEnv();
  const minted = 'v1.MustNotComeBack.1758700000001.bWFjMg';
  stubFetch(() => coreOk(200, { [CONVERSATION]: minted }));
  const ok = await POST(makeRequest());
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.has('access-control-allow-origin'), false, 'the route sets no CORS headers');
  assert.equal(ok.headers.has('access-control-allow-credentials'), false);
  assert.equal(
    ok.headers.get(CONVERSATION),
    null,
    'a reset mints no credential, and relaying one would resurrect what the visitor destroyed'
  );
  assert.equal(ok.headers.get('cache-control'), 'no-store');

  fetchCalls = [];
  stubFetch(() =>
    new Response('{"code":"rate_limited","message":"slow down"}', {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '30', [CONVERSATION]: minted }
    })
  );
  const refused = await POST(makeRequest());
  assert.equal(refused.status, 429, 'the core\'s abuse limits still apply and are relayed');
  assert.equal(refused.headers.get('retry-after'), '30');
  assert.equal(refused.headers.get(CONVERSATION), null);
  assert.equal(refused.headers.has('access-control-allow-origin'), false);
  assert.equal(await refused.text(), '{"code":"rate_limited","message":"slow down"}');
});

test('Set-Cookie from the core is relayed verbatim, each as its own header', async () => {
  enableEnv();
  const a = 'nexus_sid=fresh; Path=/; HttpOnly; Secure; SameSite=Lax';
  const b = 'other=1; Path=/';
  stubFetch(() => {
    const headers = new Headers({ 'content-type': 'application/json' });
    headers.append('set-cookie', a);
    headers.append('set-cookie', b);
    return new Response('{"code":"reset","message":"done"}', { status: 200, headers });
  });
  const res = await POST(makeRequest());
  assert.deepEqual(res.headers.getSetCookie(), [a, b]);
});

test('a non-2xx upstream still requires the code convention: an unparseable, code-less, or empty-5xx body collapses to the generic 503', async () => {
  enableEnv();

  stubFetch(() => new Response('<html>gateway error</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
  await expectJsonError(await POST(makeRequest()), 503, 'provider_unavailable');

  // A non-2xx body without the error convention's string `code` is not the
  // core speaking either, and still collapses to the generic failure - only a
  // 2xx status is exempt from this requirement now.
  stubFetch(() => new Response('{"message":"no code here"}', { status: 502, headers: { 'content-type': 'application/json' } }));
  await expectJsonError(await POST(makeRequest()), 503, 'provider_unavailable');

  stubFetch(() => new Response('', { status: 500 }));
  await expectJsonError(await POST(makeRequest()), 503, 'provider_unavailable');
});

// ---------------------------------------------------------------------------
// 8b. success is a status code, not a body shape.
//
// The core's successful reset body is `{"ok":true}` and carries no string
// `code` - `code` is the ERROR convention. The original relay required a
// string `code` on every body, success included, which meant the core's own
// success response collapsed to a 503 and the widget then retried a
// revocation that had already happened server-side. The fix: any 2xx status
// is success, full stop, independent of what the body looks like. The core
// is also being changed, in parallel, to add a `code` to its success body
// too, so both shapes are exercised here and neither may become a dependency.
// ---------------------------------------------------------------------------
test('an upstream 200 {"ok":true} (the core\'s actual success body) relays as success, not 503', async () => {
  enableEnv();
  stubFetch(() => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
  const res = await POST(makeRequest());
  assert.equal(res.status, 200, 'a successful reset must never be reported to the browser as a failure');
  assert.equal(await res.text(), '{"ok":true}');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.has('access-control-allow-origin'), false);
  assert.equal(res.headers.has('access-control-allow-credentials'), false);
});

test('an upstream 200 whose body also carries a `code` still relays as success', async () => {
  enableEnv();
  stubFetch(() => new Response('{"ok":true,"code":"reset"}', { status: 200, headers: { 'content-type': 'application/json' } }));
  const res = await POST(makeRequest());
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '{"ok":true,"code":"reset"}');
  assert.equal(res.headers.has('access-control-allow-origin'), false);
});

test('an upstream 200 with an empty or non-JSON body still relays as success', async () => {
  enableEnv();

  stubFetch(() => new Response('', { status: 200 }));
  let res = await POST(makeRequest());
  assert.equal(res.status, 200);
  assert.equal(await res.text(), '');
  assert.equal(res.headers.has('access-control-allow-origin'), false);

  // Not valid JSON at all, and not the core's error shape either - the status
  // code alone must decide, never the body.
  stubFetch(() => new Response('event: done\ndata: {}\n\n', { status: 200, headers: { 'content-type': 'text/event-stream' } }));
  res = await POST(makeRequest());
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'event: done\ndata: {}\n\n');
  assert.equal(res.headers.has('access-control-allow-origin'), false);
});

test('a thrown fetch -> 503 provider_unavailable with exactly one attempt', async () => {
  enableEnv();
  stubFetch(() => {
    throw new Error('ECONNREFUSED');
  });
  await expectJsonError(await POST(makeRequest()), 503, 'provider_unavailable');
  assert.equal(fetchCalls.length, 1, 'no retry: the client owns retry policy');
});

test('an unexpected throw inside the handler still gets the fail-closed contract', async () => {
  enableEnv();
  // A Request whose body read throws mid-stream is the cheapest way to reach a
  // path the handler did not plan for.
  const broken = new Request(`${SITE}/api/nexus/reset`, {
    method: 'POST',
    headers: new Headers({ 'content-type': 'application/json', origin: SITE, [CONVERSATION]: TOKEN }),
    body: new ReadableStream({
      start(controller) {
        controller.error(new Error('boom'));
      }
    }),
    duplex: 'half'
  });
  const res = await POST(broken);
  await expectJsonError(res, 400, 'invalid_input');
  assert.equal(logLines.length, 1, 'even a failure is logged exactly once');
});

// ---------------------------------------------------------------------------
// 9. logging — one bounded line, no token, body, cookie or IP
// ---------------------------------------------------------------------------
test('logging: exactly one line per request, with route/status/ms and nothing else', async () => {
  enableEnv();
  stubFetch(() => coreOk(429));
  await POST(
    makeRequest({
      body: '{"v":1,"note":"SENSITIVE-BODY"}',
      token: 'v1.SENSITIVE-TOKEN.1.mac',
      headers: { cookie: 'nexus_sid=SENSITIVE-COOKIE', 'x-real-ip': '198.51.100.7' }
    })
  );
  assert.equal(logLines.length, 1);
  const entry = JSON.parse(logLines[0]);
  assert.equal(entry.route, 'nexus-reset', 'the line names this route, distinctly from chat');
  assert.equal(entry.status, 429);
  assert.equal(typeof entry.ms, 'number');
  assert.deepEqual(Object.keys(entry).sort(), ['ms', 'route', 'status']);
  assert.doesNotMatch(logLines[0], /SENSITIVE|198\.51\.100\.7|a{32}/, 'no token, body, cookie, IP or secret');
});

// ---------------------------------------------------------------------------
// 10. the two routes stay twins
// ---------------------------------------------------------------------------
test('the reset route exists at the contract path and mirrors the chat route\'s security code', () => {
  const resetPath = path.join(ROOT, 'app/api/nexus/reset/route.ts');
  assert.equal(fs.existsSync(resetPath), true, 'app/api/nexus/reset/route.ts must exist');
  const reset = fs.readFileSync(resetPath, 'utf8');
  const chat = fs.readFileSync(path.join(ROOT, 'app/api/nexus/chat/route.ts'), 'utf8');

  // The gate, the URL parser, the cookie filter and the IP helper are the
  // properties a reviewer has to compare line by line, so they are the same
  // code in both files. A divergence here is a real finding, not a style note.
  for (const shared of [
    'function isSameOrigin(request: Request): boolean {',
    "if (url.protocol !== 'https:') return null;",
    'if (url.username || url.password) return null;',
    "if (name !== SESSION_COOKIE) continue;",
    "redirect: 'error',",
    "cache: 'no-store',",
    'AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)])',
    "if (process.env.NEXUS_CHAT_ENABLED !== '1') {"
  ]) {
    assert.ok(chat.includes(shared), `the chat route should contain: ${shared}`);
    assert.ok(reset.includes(shared), `the reset route must contain the same: ${shared}`);
  }

  // And the differences are the intended, narrowing ones.
  assert.match(reset, /const MAX_BODY_BYTES = 512;/, 'a reset carries no visitor text');
  assert.match(reset, /const UPSTREAM_TIMEOUT_MS = 5_000;/, 'a short timeout: there is no stream to wait for');
  assert.doesNotMatch(reset, /pumpSse|text\/event-stream/, 'no stream pump on the reset path');
  assert.doesNotMatch(reset, /access-control-allow/i, 'no CORS header is ever set');
  assert.doesNotMatch(
    reset,
    /headers\.set\(CONVERSATION_HEADER/,
    'the reset response must never carry a conversation token back'
  );
});

test('build output, when it postdates this route, proves it deploys as an App Router route', (t) => {
  const source = path.join(ROOT, 'app/api/nexus/reset/route.ts');
  const builtChat = path.join(ROOT, '.next/server/app/api/nexus/chat/route.js');
  // A stale .next from before this route existed proves nothing either way, and
  // asserting against it would be a false red. The comparison is deliberate:
  // only a build that is newer than the route's own source can be evidence
  // about it.
  if (!fs.existsSync(builtChat) || fs.statSync(builtChat).mtimeMs < fs.statSync(source).mtimeMs) {
    t.skip('build output absent or older than app/api/nexus/reset/route.ts - run `npm run build` to exercise this check');
    return;
  }
  assert.equal(
    fs.existsSync(path.join(ROOT, '.next/server/app/api/nexus/reset/route.js')),
    true,
    '.next/server/app/api/nexus/reset/route.js must exist after a build'
  );
  assert.equal(fs.existsSync(path.join(ROOT, '.next/server/pages/api/nexus')), false);
});

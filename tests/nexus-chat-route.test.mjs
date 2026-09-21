// =============================================================================
// tests/nexus-chat-route.test.mjs — handler tests for app/api/nexus/chat/route.ts
//
// Run: node --test tests/nexus-chat-route.test.mjs
//
// The route uses only the web Request/Response API and Node built-ins (no
// next/server import), so it can be exercised directly under node --test.
// Two things make that possible without touching project config:
//
//   1. Node 24 strips TypeScript types natively.
//   2. The route imports the pump with an extensionless relative specifier
//      (as Next/TS require); Node ESM needs the extension, so we register a
//      tiny resolve hook (inline data: URL, no extra files) that retries a
//      failed relative resolution with `.ts` appended.
//
// The upstream core is never contacted: `globalThis.fetch` is stubbed per
// test so the happy path, pre-stream JSON relay and failure paths are all
// covered offline.
// =============================================================================

import assert from 'node:assert/strict';
import { register } from 'node:module';
import { after, afterEach, before, beforeEach, test } from 'node:test';

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

let POST;
before(async () => {
  const mod = await import('../app/api/nexus/chat/route.ts');
  POST = mod.POST;
  assert.equal(typeof POST, 'function');
  assert.equal(mod.runtime, 'nodejs');
  assert.equal(mod.dynamic, 'force-dynamic');
  assert.equal(mod.maxDuration, 60);
  // App Router forbids arbitrary exports from route files.
  assert.deepEqual(Object.keys(mod).sort(), ['POST', 'dynamic', 'maxDuration', 'runtime']);
});

const SITE = 'https://barriosa2i.com';
const CORE = 'https://core.example.test';
const SECRET = 'a'.repeat(32);
const enc = new TextEncoder();

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

function makeRequest({ headers = {}, body = '{"message":"hi"}', origin = SITE, sameOriginHint = false } = {}) {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  if (origin !== null) h.set('origin', origin);
  if (sameOriginHint) h.set('sec-fetch-site', 'same-origin');
  return new Request(`${SITE}/api/nexus/chat`, { method: 'POST', headers: h, body });
}

function stubFetch(responder) {
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return responder(url, init);
  };
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

// ---------------------------------------------------------------------------
// 1. kill switch
// ---------------------------------------------------------------------------
test('kill switch off -> 503 disabled', async () => {
  const res = await POST(makeRequest());
  const body = await expectJsonError(res, 503, 'disabled');
  assert.equal(body.message, 'the assistant is not enabled');
  assert.equal(fetchCalls.length, 0);
});

test('kill switch set to anything but "1" -> 503 disabled', async () => {
  process.env.NEXUS_CHAT_ENABLED = 'true';
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'disabled');
});

// ---------------------------------------------------------------------------
// 2. env validation (never names the variable)
// ---------------------------------------------------------------------------
test('enabled but missing env -> 503 provider_unavailable, message names no variable', async () => {
  process.env.NEXUS_CHAT_ENABLED = '1';
  const res = await POST(makeRequest());
  const body = await expectJsonError(res, 503, 'provider_unavailable');
  assert.equal(body.message, 'the assistant is temporarily unavailable');
  assert.doesNotMatch(JSON.stringify(body), /NEXUS_/);
});

for (const [label, url] of [
  ['http scheme', 'http://core.example.test'],
  ['credentials', 'https://user:pw@core.example.test'],
  ['query', 'https://core.example.test/?x=1'],
  ['fragment', 'https://core.example.test/#frag'],
  ['non-root path', 'https://core.example.test/nexus-core'],
  ['unparseable', 'not a url'],
]) {
  test(`core url rejected: ${label} -> 503 provider_unavailable`, async () => {
    enableEnv({ NEXUS_CORE_URL: url });
    // Stub fetch to SUCCEED so this only proves the rejection: if parseCoreUrl
    // ever let a bad URL through, fetchCalls would be non-empty here instead
    // of the default per-test fetch stub (which throws and would mask that).
    stubFetch(() => new Response('{"code":"sentinel","message":"reached upstream"}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const res = await POST(makeRequest());
    await expectJsonError(res, 503, 'provider_unavailable');
    assert.equal(fetchCalls.length, 0);
  });
}

test('secret shorter than 32 after trim -> 503 provider_unavailable', async () => {
  enableEnv({ NEXUS_PROXY_SECRET: '  ' + 'b'.repeat(31) + '  ' });
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'provider_unavailable');
});

// ---------------------------------------------------------------------------
// 3. origin
// ---------------------------------------------------------------------------
test('Origin mismatch -> 403 bad_origin', async () => {
  enableEnv();
  const res = await POST(makeRequest({ origin: 'https://evil.example' }));
  const body = await expectJsonError(res, 403, 'bad_origin');
  assert.equal(body.message, 'ingress authentication required');
  assert.equal(fetchCalls.length, 0);
});

test('Origin mismatch is NOT rescued by sec-fetch-site: same-origin -> 403', async () => {
  enableEnv();
  const res = await POST(makeRequest({ origin: 'https://evil.example', sameOriginHint: true }));
  await expectJsonError(res, 403, 'bad_origin');
});

test('Origin absent and no sec-fetch-site -> 403 bad_origin', async () => {
  enableEnv();
  const res = await POST(makeRequest({ origin: null }));
  await expectJsonError(res, 403, 'bad_origin');
});

test('Origin absent + sec-fetch-site: cross-site -> 403 bad_origin', async () => {
  enableEnv();
  const res = await POST(makeRequest({ origin: null, headers: { 'sec-fetch-site': 'cross-site' } }));
  await expectJsonError(res, 403, 'bad_origin');
});

// ---------------------------------------------------------------------------
// 4. content-type
// ---------------------------------------------------------------------------
test('non-JSON content-type -> 400 invalid_input', async () => {
  enableEnv();
  const res = await POST(makeRequest({ headers: { 'content-type': 'text/plain' } }));
  await expectJsonError(res, 400, 'invalid_input');
  assert.equal(fetchCalls.length, 0);
});

// ---------------------------------------------------------------------------
// 5. body cap
// ---------------------------------------------------------------------------
test('content-length 9000 -> 413 payload_too_large before reading', async () => {
  enableEnv();
  // Build a Request whose declared length exceeds the cap; the real body is
  // never consulted because the header check comes first.
  const req = new Request(`${SITE}/api/nexus/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE, 'content-length': '9000' },
    body: new ReadableStream({
      pull() {
        throw new Error('body must not be read when content-length exceeds the cap');
      },
    }),
    duplex: 'half',
  });
  const res = await POST(req);
  const body = await expectJsonError(res, 413, 'payload_too_large');
  assert.equal(body.message, 'the message is too large');
  assert.equal(fetchCalls.length, 0);
});

test('actual body > 8192 bytes with no content-length -> 413 payload_too_large', async () => {
  enableEnv();
  const big = '{"message":"' + 'x'.repeat(9000) + '"}';
  const req = new Request(`${SITE}/api/nexus/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE },
    body: new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(big));
        c.close();
      },
    }),
    duplex: 'half',
  });
  const res = await POST(req);
  await expectJsonError(res, 413, 'payload_too_large');
  assert.equal(fetchCalls.length, 0);
});

test('body streamed in small chunks past the cap -> 413 without draining the whole stream, upstream cancelled', { timeout: 3000 }, async () => {
  enableEnv();
  let cancelled = false;
  let pulls = 0;
  const chunk = enc.encode('x'.repeat(4096));
  const req = new Request(`${SITE}/api/nexus/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SITE },
    body: new ReadableStream({
      pull(c) {
        // 5 chunks of 4096 bytes (20480 total) if fully drained; the cap
        // (8192) is crossed after the third chunk, so an early-rejecting
        // reader must cancel before ever requesting a fourth or fifth.
        pulls += 1;
        if (pulls > 5) {
          c.close();
          return;
        }
        c.enqueue(chunk);
      },
      cancel() {
        cancelled = true;
      },
    }),
    duplex: 'half',
  });
  const res = await POST(req);
  await expectJsonError(res, 413, 'payload_too_large');
  assert.equal(fetchCalls.length, 0);
  assert.ok(pulls <= 3, `must reject before requesting a 4th chunk, got ${pulls} pulls`);
  assert.equal(cancelled, true, 'the oversize body stream must be cancelled, not drained to completion');
});

test('body of exactly 8192 bytes is accepted', async () => {
  enableEnv();
  stubFetch(() => new Response('{"code":"sentinel","message":"reached upstream"}', { status: 200, headers: { 'content-type': 'application/json' } }));
  const exact = '{"m":"' + 'x'.repeat(8192 - 8) + '"}';
  assert.equal(enc.encode(exact).byteLength, 8192);
  const res = await POST(makeRequest({ body: exact }));
  assert.equal(res.status, 200);
  assert.equal(fetchCalls.length, 1);
});

// ---------------------------------------------------------------------------
// 6-8. upstream request shape (ip, cookie filtering, headers, no redirect)
// ---------------------------------------------------------------------------
test('upstream request: url, headers, secret, ip precedence, only nexus_sid cookie, redirect error, signal, no-store', async () => {
  enableEnv();
  stubFetch(() => new Response('{"code":"sentinel","message":"reached upstream"}', { status: 200, headers: { 'content-type': 'application/json' } }));
  const res = await POST(
    makeRequest({
      headers: {
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
        'x-real-ip': '198.51.100.7',
        'x-vercel-forwarded-for': '192.0.2.44',
        cookie: '__session=clerk-secret; nexus_sid=abc123; _ga=GA1.2.3',
        authorization: 'Bearer should-not-be-forwarded',
      },
    }),
  );
  assert.equal(res.status, 200);
  assert.equal(fetchCalls.length, 1, 'exactly one upstream attempt, no retry');
  const { url, init } = fetchCalls[0];
  assert.equal(url, `${CORE}/api/nexus/chat`);
  assert.equal(init.method, 'POST');
  assert.equal(init.cache, 'no-store');
  assert.equal(init.redirect, 'error');
  assert.ok(init.signal instanceof AbortSignal);
  assert.ok(init.body instanceof Uint8Array);
  const h = init.headers;
  assert.equal(h['content-type'], 'application/json');
  assert.equal(h['content-length'], String(init.body.byteLength));
  assert.equal(h.accept, 'text/event-stream');
  assert.equal(h['x-nexus-proxy-auth'], SECRET);
  assert.equal(h['x-nexus-client-ip'], '192.0.2.44', 'x-vercel-forwarded-for wins');
  assert.equal(h.cookie, 'nexus_sid=abc123', 'every other cookie dropped');
  assert.equal('authorization' in h, false);
  assert.equal('x-forwarded-for' in h, false);
});

test('ip fallback order: x-real-ip, then first x-forwarded-for entry, else empty; truncated to 45', async () => {
  enableEnv();
  stubFetch(() => new Response('{"code":"sentinel","message":"reached upstream"}', { status: 200, headers: { 'content-type': 'application/json' } }));

  await POST(makeRequest({ headers: { 'x-real-ip': ' 198.51.100.7 ', 'x-forwarded-for': '203.0.113.9' } }));
  assert.equal(fetchCalls.at(-1).init.headers['x-nexus-client-ip'], '198.51.100.7');

  await POST(makeRequest({ headers: { 'x-forwarded-for': ' 203.0.113.9 , 10.0.0.1' } }));
  assert.equal(fetchCalls.at(-1).init.headers['x-nexus-client-ip'], '203.0.113.9');

  await POST(makeRequest());
  assert.equal(fetchCalls.at(-1).init.headers['x-nexus-client-ip'], '');

  await POST(makeRequest({ headers: { 'x-real-ip': 'z'.repeat(80) } }));
  assert.equal(fetchCalls.at(-1).init.headers['x-nexus-client-ip'].length, 45);
});

test('no nexus_sid cookie -> no cookie header sent upstream', async () => {
  enableEnv();
  stubFetch(() => new Response('{"code":"sentinel","message":"reached upstream"}', { status: 200, headers: { 'content-type': 'application/json' } }));
  await POST(makeRequest({ headers: { cookie: '__session=abc; other=1' } }));
  assert.equal('cookie' in fetchCalls[0].init.headers, false);
});

test('fetch throws -> 503 provider_unavailable, no retry', async () => {
  enableEnv();
  stubFetch(() => {
    throw new TypeError('fetch failed');
  });
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'provider_unavailable');
  assert.equal(fetchCalls.length, 1);
});

// ---------------------------------------------------------------------------
// 9. relay — SSE happy path
// ---------------------------------------------------------------------------
test('SSE 200 from core -> streamed byte-for-byte, no-store, x-accel-buffering, set-cookie passthrough, status 200', async () => {
  enableEnv();
  const frames = 'event: meta\ndata: {"request_id":"r1"}\n\nevent: delta\ndata: {"text":"hi"}\n\nevent: done\ndata: {}\n\n';
  stubFetch(() => {
    const body = new ReadableStream({
      start(c) {
        c.enqueue(enc.encode(frames.slice(0, 20)));
        c.enqueue(enc.encode(frames.slice(20)));
        c.close();
      },
    });
    const h = new Headers({ 'content-type': 'text/event-stream; charset=utf-8' });
    h.append('set-cookie', 'nexus_sid=new1; Path=/; HttpOnly; Secure; SameSite=Lax');
    h.append('set-cookie', 'nexus_other=2; Path=/');
    return new Response(body, { status: 200, headers: h });
  });
  const res = await POST(makeRequest());
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-accel-buffering'), 'no');
  assert.deepEqual(res.headers.getSetCookie(), [
    'nexus_sid=new1; Path=/; HttpOnly; Secure; SameSite=Lax',
    'nexus_other=2; Path=/',
  ]);
  assert.equal(res.headers.has('access-control-allow-origin'), false, 'route sets no CORS headers');
  assert.equal(await res.text(), frames);
});

test('SSE relay: upstream dies mid-stream without terminal -> exactly one error frame appended', async () => {
  enableEnv();
  const partial = 'event: delta\ndata: {"text":"hi"}\n\n';
  stubFetch(() => {
    let n = 0;
    const body = new ReadableStream({
      pull(c) {
        if (n++ === 0) c.enqueue(enc.encode(partial));
        else throw new Error('core connection reset');
      },
    });
    return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
  });
  const res = await POST(makeRequest());
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.startsWith(partial));
  const tail = text.slice(partial.length);
  assert.ok(tail.startsWith('event: error\n'));
  assert.equal(tail.split('\n\n').filter(Boolean).length, 1, 'exactly one appended frame');
});

// ---------------------------------------------------------------------------
// 9. relay — pre-stream JSON
// ---------------------------------------------------------------------------
test('pre-stream JSON 429 from core -> status, body, content-type and retry-after relayed with no-store', async () => {
  enableEnv();
  const coreBody = '{"code":"rate_limited","message":"slow down","request_id":"r9"}';
  stubFetch(
    () =>
      new Response(coreBody, {
        status: 429,
        headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': '12', 'x-core-internal': 'nope' },
      }),
  );
  const res = await POST(makeRequest());
  assert.equal(res.status, 429);
  assert.equal(res.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res.headers.get('retry-after'), '12');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-core-internal'), null, 'only whitelisted headers are relayed');
  assert.equal(await res.text(), coreBody);
});

test('SSE content-type but non-200 status -> treated as pre-stream response, not pumped', async () => {
  enableEnv();
  stubFetch(() => new Response('{"code":"x","message":"y"}', { status: 401, headers: { 'content-type': 'text/event-stream' } }));
  const res = await POST(makeRequest());
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('x-accel-buffering'), null);
  assert.equal(await res.text(), '{"code":"x","message":"y"}');
});

test('non-JSON upstream body (HTML error page) -> 503 provider_unavailable', async () => {
  enableEnv();
  stubFetch(() => new Response('<html>502 Bad Gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }));
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'provider_unavailable');
});

test('JSON upstream body without a string code (not the core speaking) -> 503 provider_unavailable', async () => {
  enableEnv();
  stubFetch(() => new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } }));
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'provider_unavailable');
});

test('5xx with empty body -> 503 provider_unavailable', async () => {
  enableEnv();
  stubFetch(() => new Response('', { status: 500, headers: { 'content-type': 'application/json' } }));
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'provider_unavailable');
});

test('an unexpected exception inside handle() still gets the fail-closed contract: 503 provider_unavailable, no-store, logged', async () => {
  enableEnv();
  // A stubbed "upstream response" whose header accessors throw simulates a bug
  // that is not one of the already-caught paths. This must never propagate out
  // of POST as a raw, uncontrolled exception.
  stubFetch(() => ({
    status: 200,
    headers: {
      get() {
        throw new Error('boom: not one of the already-caught paths');
      },
      getSetCookie() {
        return [];
      },
    },
    text: async () => '',
  }));
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'provider_unavailable');
  assert.equal(logLines.length, 1);
  assert.equal(JSON.parse(logLines[0]).status, 503);
});

// ---------------------------------------------------------------------------
// 10. logging
// ---------------------------------------------------------------------------
test('logging: exactly one console.log per request with route/status/ms and nothing sensitive', async () => {
  enableEnv();
  stubFetch(() => new Response('{"code":"rate_limited","message":"try again later"}', { status: 429, headers: { 'content-type': 'application/json' } }));
  await POST(
    makeRequest({
      body: '{"message":"SENSITIVE-BODY"}',
      headers: { cookie: 'nexus_sid=SENSITIVE-COOKIE', 'x-real-ip': '198.51.100.7' },
    }),
  );
  assert.equal(logLines.length, 1);
  const entry = JSON.parse(logLines[0]);
  assert.equal(entry.route, 'nexus-chat');
  assert.equal(entry.status, 429);
  assert.equal(typeof entry.ms, 'number');
  assert.deepEqual(Object.keys(entry).sort(), ['ms', 'route', 'status']);
  assert.doesNotMatch(logLines[0], /SENSITIVE|198\.51\.100\.7|a{32}/);
});

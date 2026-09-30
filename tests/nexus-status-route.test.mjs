// =============================================================================
// tests/nexus-status-route.test.mjs — handler tests for app/api/nexus/status/route.ts
//
// Run: node --test tests/nexus-status-route.test.mjs
//
// The status proxy is the reset proxy's twin for its gates (kill switch,
// environment, same-origin, homepage document, JSON, a tiny body cap, exactly
// one upstream attempt, a 5 s timeout) and differs where the status design
// (NEXUS docs/implementation/status-channel.md §4.2) narrows it:
//   - the upstream header set is EXPLICIT: the status capability travels in
//     x-nexus-status, the only cookie is nexus_sid, and x-nexus-conversation /
//     x-nexus-conversation-reset are never forwarded;
//   - the body must be exactly {"v":1} or {"v":1,"m":"r"};
//   - the upstream body is read through a bounded reader (4 KiB);
//   - only a small, well-formed 2xx JSON body is relayed; everything else is
//     a fixed body; set-cookie / x-nexus-conversation / x-nexus-status are
//     never relayed;
//   - one bounded log line, never carrying the capability.
//
// Runs the real route file: Node strips the TypeScript types, globalThis.fetch
// is stubbed per test, and the NEXUS core is never contacted.
// =============================================================================

import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, test } from 'node:test';

let POST;
before(async () => {
  const mod = await import('../app/api/nexus/status/route.ts');
  POST = mod.POST;
  assert.equal(typeof POST, 'function');
  assert.equal(mod.runtime, 'nodejs');
  assert.equal(mod.dynamic, 'force-dynamic');
  assert.equal(mod.maxDuration, 15);
  // App Router forbids arbitrary exports from route files.
  assert.deepEqual(Object.keys(mod).sort(), ['POST', 'dynamic', 'maxDuration', 'runtime']);
});

const SITE = 'https://barriosa2i.com';
const CORE = 'https://core.example.test';
const SECRET = 'a'.repeat(32);
// status-channel.md Rev 2 §1.2: st2.<iat>.<exp>.<iv 16>.<ct 114>.<tag 22> = 186 chars at 13-digit times.
const CAP = `st2.1758700000000.1758701800000.${'I'.repeat(16)}.${'C'.repeat(114)}.${'T'.repeat(22)}`;
const OP_REF = 'O'.repeat(43);
const NONE = '{"v":1,"state":"none","op":null,"version":null,"display":null,"poll":null}';
const FOUND =
  `{"v":1,"state":"pending","op":"${OP_REF}","version":"` +
  'V'.repeat(43) +
  '","display":{"phase":"availability_pending","text":"Checking Gary\'s calendar.","choices":null},"poll":{"after_ms":1000}}';

const ENV_KEYS = ['NEXUS_CHAT_ENABLED', 'NEXUS_CORE_URL', 'NEXUS_PROXY_SECRET'];
const savedEnv = {};
const realFetch = globalThis.fetch;
const realLog = console.log;
const realError = console.error;
const realWarn = console.warn;
let logLines = [];
let fetchCalls = [];

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  logLines = [];
  console.log = (...args) => logLines.push(args.map(String).join(' '));
  console.error = (...args) => logLines.push('ERR ' + args.map(String).join(' '));
  console.warn = (...args) => logLines.push('WARN ' + args.map(String).join(' '));
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
  console.error = realError;
  console.warn = realWarn;
  globalThis.fetch = realFetch;
});

after(() => {
  console.log = realLog;
  console.error = realError;
  console.warn = realWarn;
  globalThis.fetch = realFetch;
});

function enableEnv(overrides = {}) {
  process.env.NEXUS_CHAT_ENABLED = '1';
  process.env.NEXUS_CORE_URL = CORE;
  process.env.NEXUS_PROXY_SECRET = SECRET;
  Object.assign(process.env, overrides);
}

const HOMEPAGE_REFERER = `${SITE}/`;

function makeRequest({
  headers = {},
  body = '{"v":1}',
  origin = SITE,
  sameOriginHint = false,
  cap = CAP,
  referer = HOMEPAGE_REFERER
} = {}) {
  const h = new Headers({ 'content-type': 'application/json', ...headers });
  if (origin !== null) h.set('origin', origin);
  if (referer !== null) h.set('referer', referer);
  if (sameOriginHint) h.set('sec-fetch-site', 'same-origin');
  if (cap !== null && !('x-nexus-status' in headers)) h.set('x-nexus-status', cap);
  return new Request(`${SITE}/api/nexus/status`, { method: 'POST', headers: h, body });
}

function stubFetch(responder) {
  globalThis.fetch = async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return responder(url, init);
  };
}

const coreJson = (text, status = 200, extra = {}) =>
  new Response(text, { status, headers: { 'content-type': 'application/json', ...extra } });

async function expectJsonError(res, status, code) {
  assert.equal(res.status, status);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-type') ?? '', /^application\/json/);
  const body = await res.json();
  assert.equal(body.code, code);
  assert.equal(typeof body.message, 'string');
  return body;
}

/** The exact set of response header names, sorted. */
const headerNames = (res) => [...res.headers.keys()].sort();

// ---------------------------------------------------------------------------
// gates copied from reset
// ---------------------------------------------------------------------------
test('kill switch: anything but NEXUS_CHAT_ENABLED=1 -> 503 disabled, no upstream call', async () => {
  for (const value of [undefined, '0', 'true', '', ' 1']) {
    if (value === undefined) delete process.env.NEXUS_CHAT_ENABLED;
    else process.env.NEXUS_CHAT_ENABLED = value;
    process.env.NEXUS_CORE_URL = CORE;
    process.env.NEXUS_PROXY_SECRET = SECRET;
    await expectJsonError(await POST(makeRequest()), 503, 'disabled');
  }
  assert.equal(fetchCalls.length, 0);
});

test('missing or unsafe environment -> 503 provider_unavailable naming nothing', async () => {
  const cases = [
    {},
    { NEXUS_CORE_URL: CORE },
    { NEXUS_PROXY_SECRET: SECRET },
    { NEXUS_CORE_URL: 'http://core.example.test', NEXUS_PROXY_SECRET: SECRET },
    { NEXUS_CORE_URL: 'https://u:p@core.example.test', NEXUS_PROXY_SECRET: SECRET },
    { NEXUS_CORE_URL: 'https://core.example.test/base', NEXUS_PROXY_SECRET: SECRET },
    { NEXUS_CORE_URL: CORE, NEXUS_PROXY_SECRET: 'a'.repeat(31) }
  ];
  for (const env of cases) {
    process.env.NEXUS_CHAT_ENABLED = '1';
    delete process.env.NEXUS_CORE_URL;
    delete process.env.NEXUS_PROXY_SECRET;
    Object.assign(process.env, env);
    const body = await expectJsonError(await POST(makeRequest()), 503, 'provider_unavailable');
    assert.doesNotMatch(body.message, /NEXUS_|SECRET|URL/i);
  }
  assert.equal(fetchCalls.length, 0);
});

test('same-origin gate: foreign or missing Origin -> 403 bad_origin; sec-fetch-site same-origin is accepted', async () => {
  enableEnv();
  stubFetch(() => coreJson(NONE));
  await expectJsonError(await POST(makeRequest({ origin: 'https://evil.example' })), 403, 'bad_origin');
  await expectJsonError(await POST(makeRequest({ origin: 'https://evil.example', sameOriginHint: true })), 403, 'bad_origin');
  await expectJsonError(await POST(makeRequest({ origin: null })), 403, 'bad_origin');
  assert.equal(fetchCalls.length, 0);
  const ok = await POST(makeRequest({ origin: null, sameOriginHint: true }));
  assert.equal(ok.status, 200);
  assert.equal(fetchCalls.length, 1);
});

test('document gate: only the homepage (/ or /index.html) is admitted', async () => {
  enableEnv();
  stubFetch(() => coreJson(NONE));
  for (const page of ['/terms-of-service.html', '/founder.html', '/x']) {
    await expectJsonError(await POST(makeRequest({ referer: SITE + page })), 403, 'bad_origin');
  }
  await expectJsonError(await POST(makeRequest({ referer: null })), 403, 'bad_origin');
  assert.equal(fetchCalls.length, 0);
  for (const referer of [`${SITE}/`, `${SITE}/index.html`, `${SITE}/?utm=x`]) {
    assert.equal((await POST(makeRequest({ referer }))).status, 200);
  }
  assert.equal(fetchCalls.length, 3);
});

test('the gate functions are character-for-character the reset route’s', async () => {
  const { readFile } = await import('node:fs/promises');
  const reset = await readFile(new URL('../app/api/nexus/reset/route.ts', import.meta.url), 'utf8');
  const status = await readFile(new URL('../app/api/nexus/status/route.ts', import.meta.url), 'utf8');
  const block = (source, opening) => {
    const start = source.indexOf(opening);
    assert.ok(start >= 0, `missing: ${opening}`);
    const end = source.indexOf('\n}\n', start);
    return source.slice(start, end + 2);
  };
  for (const opening of [
    'function parseCoreUrl(',
    'function isSameOrigin(',
    'function isHomepageDocument(',
    'function clientIp(',
    'function sessionCookie('
  ]) {
    assert.equal(block(status, opening), block(reset, opening), `${opening} must not drift from reset`);
  }
});

test('non-JSON content-type -> 400 invalid_input, no upstream call', async () => {
  enableEnv();
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', '']) {
    await expectJsonError(await POST(makeRequest({ headers: { 'content-type': type } })), 400, 'invalid_input');
  }
  assert.equal(fetchCalls.length, 0);
});

test('body cap is 256 bytes on the declared length and on the stream', async () => {
  enableEnv();
  stubFetch(() => coreJson(NONE));
  await expectJsonError(await POST(makeRequest({ headers: { 'content-length': '257' } })), 413, 'payload_too_large');
  const streamed = await POST(
    new Request(`${SITE}/api/nexus/status`, {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json', origin: SITE, referer: HOMEPAGE_REFERER, 'x-nexus-status': CAP }),
      body: new ReadableStream({
        start(c) {
          c.enqueue(new Uint8Array(257).fill(0x61));
          c.close();
        }
      }),
      duplex: 'half'
    })
  );
  await expectJsonError(streamed, 413, 'payload_too_large');
  assert.equal(fetchCalls.length, 0);
});

test('the body must be exactly {"v":1} or {"v":1,"m":"r"}; anything else is 400 with no upstream call', async () => {
  enableEnv();
  stubFetch(() => coreJson(NONE));
  for (const body of [
    '',
    '{}',
    '{"v":2}',
    '{ "v":1}',
    '{"v":1} ',
    '{"v":1,"m":"x"}',
    '{"m":"r","v":1}',
    '{"v":1,"message":"book it"}',
    '{"v":1,"select":"A"}',
    '{"v":1,"consent":true}',
    'null'
  ]) {
    await expectJsonError(await POST(makeRequest({ body })), 400, 'invalid_input');
  }
  assert.equal(fetchCalls.length, 0, 'an action-shaped body never reaches the core');
  for (const body of ['{"v":1}', '{"v":1,"m":"r"}']) {
    assert.equal((await POST(makeRequest({ body }))).status, 200);
  }
  assert.equal(fetchCalls.length, 2);
  assert.equal(new TextDecoder().decode(fetchCalls[0].init.body), '{"v":1}');
  assert.equal(new TextDecoder().decode(fetchCalls[1].init.body), '{"v":1,"m":"r"}', 'relayed verbatim');
});

test('missing, empty or over-long x-nexus-status -> 400, no upstream call', async () => {
  enableEnv();
  stubFetch(() => coreJson(NONE));
  await expectJsonError(await POST(makeRequest({ cap: null })), 400, 'invalid_input');
  await expectJsonError(await POST(makeRequest({ headers: { 'x-nexus-status': 'a'.repeat(257) } })), 400, 'invalid_input');
  assert.equal(fetchCalls.length, 0);
  // The proxy does not judge the capability's shape; the core is the authority.
  assert.equal((await POST(makeRequest({ headers: { 'x-nexus-status': 'not-a-cap' } }))).status, 200);
  assert.equal(fetchCalls.length, 1);
});

// ---------------------------------------------------------------------------
// the explicit upstream header set (R1 L5)
// ---------------------------------------------------------------------------
test('upstream: exactly one POST to /api/nexus/status with an explicit header set', async () => {
  enableEnv();
  stubFetch(() => coreJson(NONE));
  const res = await POST(
    makeRequest({
      headers: {
        cookie: '__session=clerk; nexus_sid=SID123; _ga=GA1',
        'x-nexus-conversation': 'v1.CONVTOKEN.1.mac',
        'x-nexus-conversation-reset': 'v1.OLD.1.mac',
        authorization: 'Bearer nope',
        'x-forwarded-for': '203.0.113.9, 10.0.0.1',
        'user-agent': 'UA',
        'x-nexus-proxy-auth': 'forged'
      }
    })
  );
  assert.equal(res.status, 200);
  assert.equal(fetchCalls.length, 1);
  const { url, init } = fetchCalls[0];
  assert.equal(url, CORE + '/api/nexus/status');
  assert.equal(init.method, 'POST');
  assert.equal(init.redirect, 'error');
  assert.equal(init.cache, 'no-store');
  assert.ok(init.signal instanceof AbortSignal);
  const sent = new Headers(init.headers);
  assert.deepEqual(
    [...sent.keys()].sort(),
    ['accept', 'content-length', 'content-type', 'cookie', 'x-nexus-client-ip', 'x-nexus-proxy-auth', 'x-nexus-status'].sort()
  );
  assert.equal(sent.get('x-nexus-status'), CAP);
  assert.equal(sent.get('cookie'), 'nexus_sid=SID123', 'only the nexus_sid cookie leaves the website');
  assert.equal(sent.get('x-nexus-proxy-auth'), SECRET, 'the proxy secret, never the caller’s forgery');
  assert.equal(sent.get('x-nexus-client-ip'), '203.0.113.9');
  assert.equal(sent.get('content-type'), 'application/json');
  assert.equal(sent.get('x-nexus-conversation'), null, 'the conversation credential is never forwarded');
  assert.equal(sent.get('x-nexus-conversation-reset'), null);
  assert.equal(sent.get('authorization'), null);
});

test('no nexus_sid cookie -> no cookie header upstream at all', async () => {
  enableEnv();
  stubFetch(() => coreJson(NONE));
  await POST(makeRequest({ headers: { cookie: '__session=clerk' } }));
  assert.equal(new Headers(fetchCalls[0].init.headers).get('cookie'), null);
});

test('the route source never names the conversation headers and never reuses relayHeaders', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile(new URL('../app/api/nexus/status/route.ts', import.meta.url), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /x-nexus-conversation/i);
  assert.doesNotMatch(code, /relayHeaders|getSetCookie|set-cookie/i);
  assert.doesNotMatch(code, /upstream\.text\(\)|upstream\.json\(\)|upstream\.arrayBuffer\(\)/, 'a bounded reader only');
  assert.doesNotMatch(code, /access-control-allow/i);
});

// ---------------------------------------------------------------------------
// the response to the browser
// ---------------------------------------------------------------------------
test('a well-formed 2xx is relayed verbatim with only content-type and cache-control', async () => {
  enableEnv();
  stubFetch(() =>
    coreJson(FOUND, 200, {
      'set-cookie': 'nexus_sid=NEW; HttpOnly',
      'x-nexus-conversation': 'v1.MINTED.1.mac',
      'x-nexus-status': CAP,
      'x-powered-by': 'core',
      'retry-after': '5'
    })
  );
  const res = await POST(makeRequest());
  assert.equal(res.status, 200);
  assert.equal(await res.text(), FOUND, 'the body is byte-identical');
  assert.deepEqual(headerNames(res), ['cache-control', 'content-type']);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('content-type'), /^application\/json/);
  assert.equal(res.headers.get('set-cookie'), null);
});

test('the NONE body is relayed verbatim too', async () => {
  enableEnv();
  stubFetch(() => coreJson(NONE));
  const res = await POST(makeRequest());
  assert.equal(await res.text(), NONE);
});

test('a 2xx body that is oversize, not JSON, or not the status shape -> fixed 503, nothing relayed', async () => {
  enableEnv();
  const bodies = [
    '{"v":1,"state":"none","pad":"' + 'x'.repeat(4200) + '"}',
    'not json',
    '[]',
    '"x"',
    '{"state":"none"}',
    '{"v":2,"state":"none"}',
    '{"v":1,"state":7}',
    '{"v":1,"state":"booked"}',
    ''
  ];
  for (const text of bodies) {
    stubFetch(() => coreJson(text, 200, { 'set-cookie': 'a=b' }));
    const res = await POST(makeRequest());
    await expectJsonError(res, 503, 'provider_unavailable');
    assert.equal(res.headers.get('set-cookie'), null);
  }
});

test('the upstream body is read through a bounded reader: an endless stream is cut off', async () => {
  enableEnv();
  let pulled = 0;
  stubFetch(
    () =>
      new Response(
        new ReadableStream({
          pull(c) {
            pulled += 1;
            if (pulled > 10_000) {
              c.close();
              return;
            }
            c.enqueue(new Uint8Array(1024).fill(0x20));
          }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
  );
  const res = await POST(makeRequest());
  await expectJsonError(res, 503, 'provider_unavailable');
  assert.ok(pulled < 20, `the reader stopped near 4 KiB (pulled ${pulled} KiB)`);
});

test('non-2xx upstream answers become fixed bodies; only 429 carries retry-after', async () => {
  enableEnv();
  const cases = [
    [400, 400, 'invalid_input'],
    [403, 403, 'bad_origin'],
    [413, 413, 'payload_too_large'],
    [404, 503, 'provider_unavailable'],
    [405, 503, 'provider_unavailable'],
    [500, 503, 'provider_unavailable'],
    [502, 503, 'provider_unavailable'],
    [504, 503, 'provider_unavailable']
  ];
  for (const [upstreamStatus, status, code] of cases) {
    stubFetch(() =>
      coreJson(`{"code":"leak","message":"secret detail ${CAP}","request_id":"r1"}`, upstreamStatus, {
        'set-cookie': 'nexus_sid=X',
        'x-nexus-conversation': 'v1.M.1.m',
        'retry-after': '9'
      })
    );
    const res = await POST(makeRequest());
    const body = await expectJsonError(res, status, code);
    assert.deepEqual(Object.keys(body).sort(), ['code', 'message']);
    assert.doesNotMatch(JSON.stringify(body), /secret detail|leak|r1|st2\./);
    assert.deepEqual(headerNames(res), ['cache-control', 'content-type']);
  }

  stubFetch(() => coreJson('{"code":"rate_limited","message":"x"}', 429, { 'retry-after': '12', 'set-cookie': 'a=b' }));
  const limited = await POST(makeRequest());
  const limitedBody = await expectJsonError(limited, 429, 'rate_limited');
  assert.deepEqual(limitedBody, { code: 'rate_limited', message: 'too many status requests' }, 'the fixed 429 body');
  assert.equal(limited.headers.get('retry-after'), '12');
  assert.deepEqual(headerNames(limited), ['cache-control', 'content-type', 'retry-after']);

  for (const bad of ['', 'soon', '-1', '1e3', '99999999']) {
    stubFetch(() => coreJson('{"code":"rate_limited"}', 429, bad ? { 'retry-after': bad } : {}));
    const r = await POST(makeRequest());
    await expectJsonError(r, 429, 'rate_limited');
    assert.equal(r.headers.get('retry-after'), '60', `a missing or malformed retry-after (${bad}) becomes a fixed 60`);
  }
});

test('network failure, redirect, and timeout -> fixed 503; exactly one attempt', async () => {
  enableEnv();
  stubFetch(() => {
    throw new TypeError('fetch failed');
  });
  await expectJsonError(await POST(makeRequest()), 503, 'provider_unavailable');
  assert.equal(fetchCalls.length, 1, 'no retry');

  fetchCalls = [];
  stubFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  }));
  const started = Date.now();
  const timedOut = await POST(makeRequest());
  await expectJsonError(timedOut, 503, 'provider_unavailable');
  const elapsed = Date.now() - started;
  assert.ok(elapsed >= 4_500 && elapsed < 8_000, `the 5 s timeout fired (${elapsed} ms)`);
  assert.equal(fetchCalls.length, 1);
});

// ---------------------------------------------------------------------------
// the log line
// ---------------------------------------------------------------------------
test('exactly one bounded log line {route,status,ms} per request, never the capability, cookie, IP or body', async () => {
  enableEnv();
  const statuses = [];
  const scenarios = [
    () => stubFetch(() => coreJson(FOUND)),
    () => stubFetch(() => coreJson('garbage')),
    () => stubFetch(() => { throw new Error(`boom ${CAP}`); }),
    () => stubFetch(() => coreJson('{"code":"x"}', 429, { 'retry-after': '3' }))
  ];
  for (const arrange of scenarios) {
    arrange();
    logLines = [];
    await POST(makeRequest({ headers: { cookie: 'nexus_sid=SIDVALUE', 'x-forwarded-for': '198.51.100.7' } }));
    assert.equal(logLines.length, 1, 'one line');
    const line = logLines[0];
    assert.doesNotMatch(line, /st2\.|SIDVALUE|198\.51\.100\.7|Checking|OOOO|VVVV|boom|CCCC/);
    const parsed = JSON.parse(line);
    assert.deepEqual(Object.keys(parsed).sort(), ['ms', 'route', 'status']);
    assert.equal(parsed.route, 'nexus-status');
    assert.equal(typeof parsed.status, 'number');
    assert.equal(typeof parsed.ms, 'number');
    statuses.push(parsed.status);
  }
  assert.deepEqual(statuses, [200, 503, 503, 429]);

  // Gate refusals log too, with no capability.
  logLines = [];
  await POST(makeRequest({ origin: 'https://evil.example' }));
  assert.equal(logLines.length, 1);
  assert.doesNotMatch(logLines[0], /st2\./);
});

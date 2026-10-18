import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { register } from 'node:module';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

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
const SECRET = 's'.repeat(43);
const ENV_KEYS = ['NEXUS_CHAT_ENABLED', 'NEXUS_CORE_URL', 'NEXUS_PROXY_SECRET'];
const savedEnv = {};
const realFetch = globalThis.fetch;
const realLog = console.log;
let calls = [];
let logs = [];

const ROUTES = [
  { kind: 'page', publicPath: '/verify', module: '../app/verify/route.ts', upstreamPath: '/verify' },
  { kind: 'api', publicPath: '/api/verify', module: '../app/api/verify/route.ts', upstreamPath: '/api/verify', maxBody: 256 },
  { kind: 'page', publicPath: '/owner/decision', module: '../app/owner/decision/route.ts', upstreamPath: '/owner/decision' },
  { kind: 'api', publicPath: '/api/owner/decision', module: '../app/api/owner/decision/route.ts', upstreamPath: '/api/owner/decision', maxBody: 512 },
  { kind: 'page', publicPath: '/schedule/pick', module: '../app/schedule/pick/route.ts', upstreamPath: '/schedule/pick' },
  { kind: 'api', publicPath: '/api/schedule/pick', module: '../app/api/schedule/pick/route.ts', upstreamPath: '/api/schedule/pick', maxBody: 512 },
];

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  calls = [];
  logs = [];
  console.log = (...args) => logs.push(args.map(String).join(' '));
  globalThis.fetch = async () => {
    throw new Error('fetch must be stubbed per test');
  };
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  globalThis.fetch = realFetch;
  console.log = realLog;
});

function enable() {
  process.env.NEXUS_CHAT_ENABLED = '1';
  process.env.NEXUS_CORE_URL = CORE;
  process.env.NEXUS_PROXY_SECRET = SECRET;
}

function stubFetch(response) {
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return typeof response === 'function' ? response(url, init) : response;
  };
}

function validApiBody(row) {
  return row.publicPath === '/api/verify'
    ? '{"ok":true,"message":"verified"}'
    : '{"message":"ok"}';
}

async function loadRoute(row) {
  return import(row.module);
}

function requestFor(row, { origin = SITE, headers = {}, body } = {}) {
  const all = new Headers({
    'x-nexus-proxy-auth': 'forged-client-secret',
    'x-nexus-client-ip': '6.6.6.6',
    'x-vercel-forwarded-for': '203.0.113.22',
    authorization: 'Bearer visitor-data',
    cookie: '__session=private; nexus_sid=also-private',
    ...headers,
  });
  if (row.kind === 'api') {
    if (!all.has('content-type')) all.set('content-type', 'application/json');
    if (origin !== null) all.set('origin', origin);
  }
  return new Request(SITE + row.publicPath, {
    method: row.kind === 'page' ? 'GET' : 'POST',
    headers: all,
    ...(row.kind === 'api' ? { body: body ?? '{"v":1}' } : {}),
  });
}

test('the exact six emailed-link routes are public through middleware', async () => {
  const { NEXUS_PUBLIC_LINK_ROUTES } = await import('../lib/nexus/public-link-routes.ts');
  assert.deepEqual(NEXUS_PUBLIC_LINK_ROUTES, ROUTES.map((row) => row.publicPath));
  const middleware = fs.readFileSync(path.join(ROOT, 'middleware.ts'), 'utf8');
  assert.match(middleware, /NEXUS_PUBLIC_LINK_ROUTES/);
  assert.match(middleware, /\.\.\.NEXUS_PUBLIC_LINK_ROUTES/);
});

for (const row of ROUTES) {
  test(`${row.publicPath} exports only the supported handler and route metadata`, async () => {
    const route = await loadRoute(row);
    const method = row.kind === 'page' ? 'GET' : 'POST';
    assert.deepEqual(Object.keys(route).sort(), [method, 'dynamic', 'maxDuration', 'runtime']);
    assert.equal(typeof route[method], 'function');
    assert.equal(route.runtime, 'nodejs');
    assert.equal(route.dynamic, 'force-dynamic');
    assert.equal(route.maxDuration, 15);
  });
}

test('all page routes replace forged trust headers and relay only the core page security contract', async () => {
  enable();
  const html = '<!doctype html><title>NEXUS link</title>';
  stubFetch(
    () => new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-security-policy': "default-src 'none'",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'x-upstream-private': 'drop-me',
      },
    }),
  );

  for (const row of ROUTES.filter((candidate) => candidate.kind === 'page')) {
    calls = [];
    logs = [];
    const route = await loadRoute(row);
    const response = await route.GET(requestFor(row));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
    assert.equal(response.headers.get('content-security-policy'), "default-src 'none'");
    assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('x-upstream-private'), null);
    assert.equal(response.headers.has('access-control-allow-origin'), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, CORE + row.upstreamPath);
    assert.equal(calls[0].init.method, 'GET');
    assert.equal(calls[0].init.headers['x-nexus-proxy-auth'], SECRET);
    assert.equal(calls[0].init.headers['x-nexus-client-ip'], '203.0.113.22');
    assert.equal('authorization' in calls[0].init.headers, false);
    assert.equal('cookie' in calls[0].init.headers, false);
    assert.equal(Object.keys(calls[0].init.headers).sort().join(','), 'accept,x-nexus-client-ip,x-nexus-proxy-auth');
    assert.equal(logs.length, 1);
    assert.deepEqual(Object.keys(JSON.parse(logs[0])).sort(), ['ms', 'route', 'status']);
    assert.doesNotMatch(logs[0], /forged|203\.0\.113|ssss/);
  }
});

test('all API routes require same-origin JSON and forward the body byte-for-byte with server trust only', async () => {
  enable();
  stubFetch(
    (_url, init) => new Response(validApiBody(ROUTES.find((row) => CORE + row.upstreamPath === String(_url))), {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8', 'retry-after': '9', 'x-private': 'drop-me' },
    }),
  );

  for (const row of ROUTES.filter((candidate) => candidate.kind === 'api')) {
    calls = [];
    const body = row.publicPath === '/api/verify' ? '{"token":"' + 'A'.repeat(43) + '"}' : '{"capability":"opaque","decision":"approve"}';
    const route = await loadRoute(row);
    const response = await route.POST(requestFor(row, { body }));
    assert.equal(response.status, 200);
    assert.equal(await response.text(), validApiBody(row));
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('retry-after'), null, 'Retry-After is never published on a successful response');
    assert.equal(response.headers.get('x-private'), null);
    assert.equal(response.headers.has('access-control-allow-origin'), false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, CORE + row.upstreamPath);
    assert.equal(calls[0].init.method, 'POST');
    assert.equal(new TextDecoder().decode(calls[0].init.body), body);
    assert.equal(calls[0].init.headers['x-nexus-proxy-auth'], SECRET);
    assert.equal(calls[0].init.headers['x-nexus-client-ip'], '203.0.113.22');
    assert.equal('authorization' in calls[0].init.headers, false);
    assert.equal('cookie' in calls[0].init.headers, false);
    assert.equal(Object.keys(calls[0].init.headers).sort().join(','), 'accept,content-length,content-type,x-nexus-client-ip,x-nexus-proxy-auth');
  }
});

test('API routes reject cross-origin, non-JSON and oversized requests before any upstream call', async () => {
  enable();
  stubFetch(new Response('{"message":"must not be reached"}', { status: 200 }));

  for (const row of ROUTES.filter((candidate) => candidate.kind === 'api')) {
    const route = await loadRoute(row);

    let response = await route.POST(requestFor(row, { origin: 'https://evil.example' }));
    assert.equal(response.status, 403);
    assert.equal(response.headers.get('cache-control'), 'no-store');

    response = await route.POST(requestFor(row, { headers: { 'content-type': 'text/plain' } }));
    assert.equal(response.status, 400);

    response = await route.POST(requestFor(row, { headers: { 'content-type': 'application/jsonp' } }));
    assert.equal(response.status, 400);

    response = await route.POST(requestFor(row, { headers: { 'content-length': String(row.maxBody + 1) } }));
    assert.equal(response.status, 413);

    assert.equal(calls.length, 0, `${row.publicPath} must not contact the core for rejected input`);
  }
});

test('every route fails closed on disabled or unsafe environment without naming variables', async () => {
  for (const row of ROUTES) {
    const route = await loadRoute(row);
    const method = row.kind === 'page' ? 'GET' : 'POST';
    let response = await route[method](requestFor(row));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /NEXUS_|proxy|secret|core/i);

    process.env.NEXUS_CHAT_ENABLED = '1';
    process.env.NEXUS_CORE_URL = 'http://not-tls.example';
    process.env.NEXUS_PROXY_SECRET = 'short';
    response = await route[method](requestFor(row));
    assert.equal(response.status, 503);
    assert.doesNotMatch(await response.text(), /NEXUS_|proxy|secret|core/i);
    delete process.env.NEXUS_CHAT_ENABLED;
    delete process.env.NEXUS_CORE_URL;
    delete process.env.NEXUS_PROXY_SECRET;
  }
  assert.equal(calls.length, 0);
});

test('an oversized or malformed upstream response collapses to the generic 503', async () => {
  enable();
  const row = ROUTES.find((candidate) => candidate.publicPath === '/verify');
  const route = await loadRoute(row);
  stubFetch(new Response('x'.repeat(131_073), { status: 200, headers: { 'content-type': 'text/html' } }));
  const response = await route.GET(requestFor(row));
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), /131073|NEXUS_/);
  assert.equal(calls.length, 1, 'no retry');
});

test('every local page failure clears the capability fragment under a hash-pinned CSP', async () => {
  const row = ROUTES.find((candidate) => candidate.publicPath === '/verify');
  const route = await loadRoute(row);
  const response = await route.GET(requestFor(row));
  assert.equal(response.status, 503);
  assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  const html = await response.text();
  assert.doesNotMatch(html, /NEXUS_|proxy|secret|core/i);
  const script = /<script>([^<]+)<\/script>/.exec(html)?.[1];
  assert.ok(script, 'the failure page carries one fixed fragment-clearing script');
  const hash = createHash('sha256').update(script).digest('base64');
  assert.match(response.headers.get('content-security-policy') ?? '', new RegExp(`script-src 'sha256-${hash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`));
  const callsToHistory = [];
  Function('history', 'location', script)(
    { replaceState: (...args) => callsToHistory.push(args) },
    { pathname: '/verify' },
  );
  assert.deepEqual(callsToHistory, [[null, '', '/verify']]);
});

test('page routes publish only a 200 HTML response carrying the full core security contract', async () => {
  enable();
  const row = ROUTES.find((candidate) => candidate.publicPath === '/verify');
  const route = await loadRoute(row);
  const invalidResponses = [
    new Response('<script>alert(1)</script>', { status: 200, headers: { 'content-type': 'text/html' } }),
    new Response('{"message":"platform"}', { status: 200, headers: { 'content-type': 'application/json' } }),
    new Response('<p>not found</p>', {
      status: 404,
      headers: {
        'content-type': 'text/html',
        'content-security-policy': "default-src 'none'",
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
      },
    }),
  ];
  for (const upstream of invalidResponses) {
    stubFetch(upstream);
    const response = await route.GET(requestFor(row));
    assert.equal(response.status, 503);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/);
    assert.doesNotMatch(await response.text(), /alert\(1\)|platform|not found/);
  }
});

test('API routes publish only the documented JSON status and body shapes', async () => {
  enable();
  for (const row of ROUTES.filter((candidate) => candidate.kind === 'api')) {
    const route = await loadRoute(row);
    const invalidResponses = [
      new Response('<script>alert(1)</script>', { status: 200, headers: { 'content-type': 'text/html' } }),
      new Response('{"message":"ok","extra":"diagnostic"}', { status: 200, headers: { 'content-type': 'application/json' } }),
      new Response('{"message":', { status: 200, headers: { 'content-type': 'application/json' } }),
      new Response(validApiBody(row), { status: 500, headers: { 'content-type': 'application/json' } }),
    ];
    for (const upstream of invalidResponses) {
      stubFetch(upstream);
      const response = await route.POST(requestFor(row));
      assert.equal(response.status, 503, `${row.publicPath} must collapse an invalid upstream response`);
      assert.deepEqual(await response.json(), {
        code: 'provider_unavailable',
        message: 'the assistant is temporarily unavailable',
      });
    }
  }
});

test('API routes preserve only a bounded numeric Retry-After on a valid 429 response', async () => {
  enable();
  for (const row of ROUTES.filter((candidate) => candidate.kind === 'api')) {
    const route = await loadRoute(row);
    stubFetch(new Response(validApiBody(row), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '600' },
    }));
    const response = await route.POST(requestFor(row));
    assert.equal(response.status, 429);
    assert.equal(response.headers.get('retry-after'), '600');
    assert.equal(await response.text(), validApiBody(row));
  }
});

test('the pick API accepts the exact three-slot view response and strips nothing needed by the page', async () => {
  enable();
  const row = ROUTES.find((candidate) => candidate.publicPath === '/api/schedule/pick');
  const route = await loadRoute(row);
  const body = JSON.stringify({
    slots: [
      { slotId: 'A', label: 'Monday at 1:00 PM' },
      { slotId: 'B', label: 'Tuesday at 2:00 PM' },
      { slotId: 'C', label: 'Wednesday at 3:00 PM' },
    ],
  });
  stubFetch(new Response(body, { status: 200, headers: { 'content-type': 'application/json; charset=utf-8' } }));
  const response = await route.POST(requestFor(row));
  assert.equal(response.status, 200);
  assert.equal(await response.text(), body);
});

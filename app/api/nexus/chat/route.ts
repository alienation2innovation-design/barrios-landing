// =============================================================================
// POST /api/nexus/chat — same-origin ingress proxy for the NEXUS assistant
//
// The browser never talks to the NEXUS core directly. This route is the only
// public entry point: it authenticates the caller as "this website's own
// front-end" (origin checks), caps the payload, strips everything from the
// request except the bytes the core needs, attaches the shared proxy secret
// the core requires (x-nexus-proxy-auth), and relays the core's SSE stream
// back to the browser through a byte-transparent pump that guarantees the UI
// always receives a terminal frame.
//
// Design rules (mirror the core's operating policy):
//   - Fail closed. Any misconfiguration is a generic 503; the body never says
//     which variable is missing.
//   - No retries. A retry could replay a message and double-charge the
//     provider; the client decides whether to resend.
//   - No CORS headers. This is same-origin by construction; vercel.json's
//     blanket /api/(.*) CORS headers are the coordinator's concern, not ours.
//   - Never log bodies, headers, cookies or IPs.
//   - The forwarded-header allowlist governs what WE add. Node's fetch (undici)
//     appends its own transport headers to the upstream request (user-agent:
//     node, accept-language, sec-fetch-mode, accept-encoding, and pragma /
//     cache-control from cache:'no-store'); none carries visitor data and the
//     core ignores them.
//
// Clerk's middleware.ts already lists /api/nexus/(.*) as public, so this
// route receives unauthenticated traffic; origin gating is our only auth.
// =============================================================================

import { pumpSse } from '../../../../lib/nexus/sse-pump';

// Node runtime: we need AbortSignal.any, streaming fetch bodies and
// Headers.getSetCookie(), and we must not be hoisted to the edge where the
// 56 s upstream budget would exceed the edge limit.
export const runtime = 'nodejs';
// Every call is a live proxy; nothing here is cacheable.
export const dynamic = 'force-dynamic';
// Vercel function ceiling. The upstream timeout below (55 s) leaves headroom
// so we can still write a terminal frame before the platform kills us.
export const maxDuration = 60;

const MAX_BODY_BYTES = 8192;
const UPSTREAM_TIMEOUT_MS = 55_000;
const MIN_SECRET_LENGTH = 32;
const MAX_IP_LENGTH = 45; // longest textual IPv6 (incl. IPv4-mapped) is 45 chars
const SESSION_COOKIE = 'nexus_sid';

type ErrorCode =
  | 'disabled'
  | 'provider_unavailable'
  | 'bad_origin'
  | 'invalid_input'
  | 'payload_too_large';

/** Uniform JSON error: `{code, message}` with cache-control: no-store. */
function jsonError(status: number, code: ErrorCode, message: string): Response {
  return new Response(JSON.stringify({ code, message }), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

const providerUnavailable = (): Response =>
  jsonError(503, 'provider_unavailable', 'the assistant is temporarily unavailable');

/**
 * Validate the core URL strictly. We only ever talk to the core over TLS, and
 * we refuse any URL that smuggles credentials or a query/fragment because the
 * proxy composes `origin + '/api/nexus/chat'` and must not inherit surprises.
 */
function parseCoreUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;
  if (url.search || url.hash) return null;
  // Only ever used as coreUrl.origin (this proxy appends its own path); a
  // configured path segment would be silently discarded, contradicting the
  // "fail closed on misconfiguration" rule above.
  if (url.pathname !== '/') return null;
  return url;
}

/**
 * Same-origin gate. A browser fetch from our own page carries either an
 * Origin header equal to our own origin, or (for some same-origin GET/POST
 * shapes) no Origin but `Sec-Fetch-Site: same-origin`. A conflicting Origin is
 * never rescued by Sec-Fetch-Site: if a caller announces a foreign origin we
 * believe them.
 */
function isSameOrigin(request: Request): boolean {
  const site = new URL(request.url).origin;
  const origin = request.headers.get('origin');
  if (origin !== null) {
    return origin === site;
  }
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

/**
 * Best-effort client IP for the core's rate limiter. Vercel sets
 * x-vercel-forwarded-for from the edge; the others are fallbacks for local
 * dev behind other proxies. Truncated so a hostile header cannot bloat the
 * upstream request.
 */
function clientIp(request: Request): string {
  const candidates = [
    request.headers.get('x-vercel-forwarded-for'),
    request.headers.get('x-real-ip'),
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0],
  ];
  for (const c of candidates) {
    const v = (c ?? '').trim();
    if (v) return v.slice(0, MAX_IP_LENGTH);
  }
  return '';
}

/**
 * Read the request body with an early, streaming size cap. `content-length`
 * (checked by the caller first) is advisory and can be absent, understated,
 * or simply lied about, so this reads chunk-by-chunk and cancels the stream
 * the moment the running total crosses MAX_BODY_BYTES, instead of buffering
 * an unbounded body via `request.arrayBuffer()` before ever checking length.
 */
async function readCappedBody(request: Request): Promise<Uint8Array<ArrayBuffer> | 'too_large' | 'invalid'> {
  const body = request.body;
  if (!body) return new Uint8Array(0) as Uint8Array<ArrayBuffer>;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_BODY_BYTES) {
        try {
          await reader.cancel();
        } catch {
          // Already errored/closed; nothing further to release.
        }
        return 'too_large';
      }
      chunks.push(value);
    }
  } catch {
    return 'invalid';
  }
  const out = new Uint8Array(total) as Uint8Array<ArrayBuffer>;
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/**
 * Forward ONLY the NEXUS session cookie. Every other cookie on this domain
 * (Clerk session, analytics, etc.) is none of the core's business and must not
 * leave the website boundary.
 */
function sessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    if (name !== SESSION_COOKIE) continue;
    const value = part.slice(eq + 1).trim();
    if (!value) return null;
    return `${SESSION_COOKIE}=${value}`;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  let status = 0;
  try {
    const response = await handle(request);
    status = response.status;
    return response;
  } catch {
    // Any bug or unexpected throw inside handle() that is not one of its own
    // already-caught paths still gets this route's uniform fail-closed
    // contract: generic 503, no-store, JSON body, no named cause.
    const response = providerUnavailable();
    status = response.status;
    return response;
  } finally {
    // One line per request, never body/headers/cookies/IP.
    console.log(JSON.stringify({ route: 'nexus-chat', status, ms: Date.now() - startedAt }));
  }
}

async function handle(request: Request): Promise<Response> {
  // 1. Kill switch. Lets ops take the assistant offline without a deploy and
  //    keeps the route inert on any environment where it was not turned on.
  if (process.env.NEXUS_CHAT_ENABLED !== '1') {
    return jsonError(503, 'disabled', 'the assistant is not enabled');
  }

  // 2. Environment. Both must be present and sane; never reveal which failed.
  const coreUrl = parseCoreUrl(process.env.NEXUS_CORE_URL);
  const secret = (process.env.NEXUS_PROXY_SECRET ?? '').trim();
  if (!coreUrl || secret.length < MIN_SECRET_LENGTH) {
    return providerUnavailable();
  }

  // 3. Origin. The only authentication this public route has.
  if (!isSameOrigin(request)) {
    return jsonError(403, 'bad_origin', 'ingress authentication required');
  }

  // 4. Content type. The core only speaks JSON; reject anything else before
  //    we spend time reading the body.
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return jsonError(400, 'invalid_input', 'the request was not understood');
  }

  // 5. Body cap. Check the declared length first so an oversize upload is
  //    refused before we read any of it, then read with a running byte
  //    counter and cancel as soon as the cap is crossed, because
  //    content-length is advisory and must never gate how much we buffer.
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
      return jsonError(413, 'payload_too_large', 'the message is too large');
    }
  }
  const bodyResult = await readCappedBody(request);
  if (bodyResult === 'too_large') {
    return jsonError(413, 'payload_too_large', 'the message is too large');
  }
  if (bodyResult === 'invalid') {
    return jsonError(400, 'invalid_input', 'the request was not understood');
  }
  const buf = bodyResult;

  // 6 + 7. The only two pieces of caller context the core receives.
  const ip = clientIp(request);
  const cookie = sessionCookie(request);

  // 8. Upstream call. Exactly one attempt; the client owns retry policy.
  //    Abort if the browser disconnects (request.signal) or the budget runs
  //    out, whichever comes first. redirect:'error' so a misconfigured core
  //    can never bounce us (and the secret) to a third party.
  let upstream: Response;
  try {
    upstream = await fetch(coreUrl.origin + '/api/nexus/chat', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(buf.byteLength),
        accept: 'text/event-stream',
        'x-nexus-proxy-auth': secret,
        'x-nexus-client-ip': ip,
        ...(cookie ? { cookie } : {}),
      },
      body: buf,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
  } catch {
    // Network failure, timeout, or the client already left. Either way the
    // only honest answer is "unavailable"; if the client is gone nobody reads it.
    return providerUnavailable();
  }

  // 9. Relay.
  const upstreamType = upstream.headers.get('content-type') ?? '';
  if (upstream.status === 200 && upstreamType.toLowerCase().startsWith('text/event-stream') && upstream.body) {
    const headers = new Headers({
      'content-type': upstreamType,
      'cache-control': 'no-store',
      // Tell any intermediate proxy (and Vercel) not to buffer the stream.
      'x-accel-buffering': 'no',
    });
    // The core may (re)issue the session cookie; pass every Set-Cookie through
    // verbatim. getSetCookie() keeps them as separate headers, which
    // Headers.append preserves.
    for (const c of upstream.headers.getSetCookie()) {
      headers.append('set-cookie', c);
    }
    return new Response(pumpSse(upstream.body), { status: 200, headers });
  }

  // Pre-stream JSON from the core (rate limit, validation, its own 503...).
  // Relay status + body + content-type + retry-after. Anything that is not
  // JSON, or a 5xx with nothing to say, collapses to our generic 503 so the
  // browser never sees a raw platform error page.
  let text = '';
  try {
    text = await upstream.text();
  } catch {
    return providerUnavailable();
  }
  if (upstream.status >= 500 && text.trim().length === 0) {
    return providerUnavailable();
  }
  // The core is the only trusted upstream and every pre-stream body it emits
  // carries a string `code` (errors.ts). Anything else - a 2xx JSON blob, a
  // platform interstitial that happens to be JSON - is not the core speaking
  // and collapses to our generic 503.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return providerUnavailable();
  }
  if (typeof parsed !== 'object' || parsed === null || typeof (parsed as { code?: unknown }).code !== 'string') {
    return providerUnavailable();
  }
  const headers = new Headers({
    'content-type': upstreamType.toLowerCase().startsWith('application/json')
      ? upstreamType
      : 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) headers.set('retry-after', retryAfter);
  return new Response(text, { status: upstream.status, headers });
}

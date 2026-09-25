// =============================================================================
// POST /api/nexus/reset — same-origin ingress proxy for an immediate revocation
//
// "New conversation" in the widget used to ride its revocation on the visitor's
// NEXT ordinary chat turn. That coupled a delete to a message that might never
// be sent, and to a turn that could be refused, so the record survived to the
// idle sweep while the UI had already told the visitor the conversation was
// gone. This route replaces that mechanism: the click fires here directly, and
// the core deletes and tombstones the record without a provider call and
// without spending a model turn.
//
// It is the chat proxy's twin, deliberately. Every security property of
// app/api/nexus/chat/route.ts is reproduced here with the same code shape, the
// same order of checks and the same fail-closed contract:
//   - Fail closed. Any misconfiguration is a generic 503; the body never says
//     which variable is missing.
//   - No retries. Exactly one upstream attempt; the client owns retry policy.
//   - No CORS headers. Same-origin by construction; vercel.json's blanket
//     /api/(.*) CORS block carves /api/nexus/ out and is not ours to change.
//   - Never log bodies, headers, cookies or IPs.
//   - It validates NOTHING about the conversation token. The core is the only
//     authority on whether a value is acceptable; this proxy is a conduit.
//
// Differences from chat, all of them narrowing:
//   - No request body is meaningful, so the cap is 512 bytes rather than 8 KiB.
//   - The upstream answer is small JSON, never SSE, so there is no stream pump
//     and the timeout is 5 s rather than 55 s.
//   - No conversation token is ever relayed BACK. The core mints none for a
//     reset, and the browser has already forgotten the one it retired, so
//     copying a token back would be the one way this route could resurrect a
//     credential the visitor asked to destroy.
//
// Clerk's middleware.ts already lists /api/nexus/(.*) as public, so this route
// receives unauthenticated traffic; origin gating is our only auth.
// =============================================================================

// Node runtime, for the same reasons as chat: AbortSignal.any and
// Headers.getSetCookie(), and no edge hoisting.
export const runtime = 'nodejs';
// Every call is a live proxy; nothing here is cacheable.
export const dynamic = 'force-dynamic';
// Far below the platform ceiling: the upstream budget is 5 s and there is no
// stream to unwind, so a reset must never hold a function open.
export const maxDuration = 15;

// A reset carries no visitor text. 512 bytes is room for `{"v":1}` and any
// future tiny envelope, and nothing else.
const MAX_BODY_BYTES = 512;
const UPSTREAM_TIMEOUT_MS = 5_000;
const MIN_SECRET_LENGTH = 32;
const MAX_IP_LENGTH = 45; // longest textual IPv6 (incl. IPv4-mapped) is 45 chars
const SESSION_COOKIE = 'nexus_sid';
// The opaque, server-minted conversation token being retired. Forwarded
// verbatim; never parsed, validated, truncated, normalised or logged.
const CONVERSATION_HEADER = 'x-nexus-conversation';

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
 * Validate the core URL strictly — identical rules to the chat proxy. TLS only,
 * no embedded credentials, no query/fragment, no path, because this proxy
 * composes `origin + '/api/nexus/reset'` and must not inherit surprises.
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
  if (url.pathname !== '/') return null;
  return url;
}

/**
 * Same-origin gate, identical to the chat proxy. A conflicting Origin is never
 * rescued by Sec-Fetch-Site: if a caller announces a foreign origin we believe
 * them.
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
 * Best-effort client IP for the core's rate limiter — a reset is cheap for the
 * server but must not become a free hammer, so the core applies its usual
 * per-network limits and needs the same input chat gives it. Truncated so a
 * hostile header cannot bloat the upstream request.
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
 * Read the request body with an early, streaming size cap. `content-length` is
 * advisory and can be absent, understated or simply lied about, so this reads
 * chunk-by-chunk and cancels the stream the moment the running total crosses
 * MAX_BODY_BYTES instead of buffering an unbounded body first.
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
 * (Clerk session, analytics, ...) is none of the core's business and must not
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
    // Any bug or unexpected throw inside handle() still gets this route's
    // uniform fail-closed contract: generic 503, no-store, JSON body, no cause.
    const response = providerUnavailable();
    status = response.status;
    return response;
  } finally {
    // One bounded line per request, never body/headers/cookies/IP/token.
    console.log(JSON.stringify({ route: 'nexus-reset', status, ms: Date.now() - startedAt }));
  }
}

async function handle(request: Request): Promise<Response> {
  // 1. Kill switch — the SAME switch as chat, on purpose. A site with the
  //    assistant turned off has no conversations to revoke, and a reset ingress
  //    that outlived the chat ingress would be a surface with no purpose.
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

  // 4. Content type. The core only speaks JSON.
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return jsonError(400, 'invalid_input', 'the request was not understood');
  }

  // 5. Body cap. Declared length first, then a running byte counter, because
  //    content-length must never gate how much we buffer.
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
      return jsonError(413, 'payload_too_large', 'the request is too large');
    }
  }
  const bodyResult = await readCappedBody(request);
  if (bodyResult === 'too_large') {
    return jsonError(413, 'payload_too_large', 'the request is too large');
  }
  if (bodyResult === 'invalid') {
    return jsonError(400, 'invalid_input', 'the request was not understood');
  }
  const buf = bodyResult;

  // 6 + 7. The only pieces of caller context the core receives.
  const ip = clientIp(request);
  const cookie = sessionCookie(request);
  // The token being retired. A reset without one is meaningless, and the core
  // fails it closed anyway; refusing it here saves an upstream round trip and
  // keeps the invariant "a reset always travels with a token" visible on this
  // side of the wire too. It is still the core that decides what a present
  // token means.
  const conversation = request.headers.get(CONVERSATION_HEADER);
  if (!conversation) {
    return jsonError(400, 'invalid_input', 'the request was not understood');
  }

  // 8. Upstream call. Exactly one attempt; the client owns retry policy.
  //    redirect:'error' so a misconfigured core can never bounce us (and the
  //    secret) to a third party.
  let upstream: Response;
  try {
    upstream = await fetch(coreUrl.origin + '/api/nexus/reset', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(buf.byteLength),
        accept: 'application/json',
        'x-nexus-proxy-auth': secret,
        'x-nexus-client-ip': ip,
        ...(cookie ? { cookie } : {}),
        [CONVERSATION_HEADER]: conversation,
      },
      body: buf,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
  } catch {
    // Network failure, timeout, or the client already left. The widget retries.
    return providerUnavailable();
  }

  // 9. Relay. Small JSON only — never a stream. The core reports success and
  //    "nothing to revoke" identically, so nothing here can be read as a
  //    disclosure of whether a given token was live.
  let text = '';
  try {
    text = await upstream.text();
  } catch {
    return providerUnavailable();
  }

  const upstreamType = upstream.headers.get('content-type') ?? '';
  const relayHeaders = (): Headers => {
    const headers = new Headers({
      'content-type': upstreamType.toLowerCase().startsWith('application/json')
        ? upstreamType
        : 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    // The core may (re)issue the session cookie; pass every Set-Cookie through
    // verbatim, exactly as chat does.
    for (const c of upstream.headers.getSetCookie()) {
      headers.append('set-cookie', c);
    }
    // Deliberately NOT relayed: x-nexus-conversation. A reset mints no token,
    // and handing one back would resurrect a credential the visitor just
    // destroyed.
    return headers;
  };

  // A 2xx IS success, full stop — independent of the body's shape. `code` is
  // this API's ERROR convention; requiring it on a success response too was
  // the bug (a bare `{"ok":true}` success collapsed to our generic 503, and
  // the widget then retried a revocation that had already happened). The core
  // may or may not also put a `code` on its success body; this proxy must not
  // come to depend on either shape, so a 2xx is never parsed at all here.
  if (upstream.status >= 200 && upstream.status < 300) {
    return new Response(text, { status: upstream.status, headers: relayHeaders() });
  }

  // Non-2xx: unchanged — the core's error convention is a string `code`, and
  // anything else (unparseable, code-less, or an empty 5xx body) is not the
  // core speaking and collapses to our generic 503.
  if (upstream.status >= 500 && text.trim().length === 0) {
    return providerUnavailable();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return providerUnavailable();
  }
  if (typeof parsed !== 'object' || parsed === null || typeof (parsed as { code?: unknown }).code !== 'string') {
    return providerUnavailable();
  }
  const headers = relayHeaders();
  const retryAfter = upstream.headers.get('retry-after');
  if (retryAfter) headers.set('retry-after', retryAfter);
  return new Response(text, { status: upstream.status, headers });
}

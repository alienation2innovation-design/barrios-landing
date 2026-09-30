// =============================================================================
// POST /api/nexus/status — same-origin ingress proxy for the read-only status poll
//
// After a chat turn starts a scheduling operation, the core issues a short-lived,
// status-only capability in the turn's closed `done.data.status` field. The
// widget then polls here, presenting that capability in the `x-nexus-status`
// header, so availability and hold progress can appear without the visitor
// sending another message. Design: NEXUS docs/implementation/status-channel.md
// §4.2 (website route) and §6 (widget).
//
// Gates: the reset proxy's, in the reset proxy's order, reproduced with the
// same code shape — kill switch, environment, same-origin, homepage document,
// JSON content type, a tiny streamed body cap, exactly one upstream attempt with
// a 5 s timeout. parseCoreUrl, isSameOrigin, isHomepageDocument, clientIp and
// sessionCookie are character-for-character reset's, and a test pins that.
//
// Where it is deliberately narrower than reset:
//   - The upstream header set is EXPLICIT. It carries the status capability
//     (`x-nexus-status`, forwarded on this route only), the nexus_sid cookie and
//     nothing else from the caller. The conversation credential and its reset
//     header are never read or forwarded here: a status poll has no authority
//     over a conversation, and forwarding the credential would let a status
//     request stand in for a chat turn.
//   - The body must be exactly `{"v":1}` or `{"v":1,"m":"r"}` (recovered mode
//     after a reload). Anything else — an action-shaped body above all — is
//     refused before the core is contacted.
//   - The upstream body is read through a bounded reader (4 KiB), never buffered
//     whole first.
//   - Only a small, well-formed 2xx JSON body is relayed, byte for byte. Every
//     other upstream answer becomes one of this route's fixed bodies, so no
//     upstream error text, request id or detail can reach the browser.
//   - The response headers are built from scratch: content-type,
//     cache-control, and retry-after on a 429 only. Set-Cookie, the
//     conversation header and x-nexus-status are never relayed.
//   - One bounded log line: {route, status, ms}. Never the capability, a cookie,
//     an IP, a body, or an error's text.
//
// Like reset, it validates nothing about the capability beyond presence and
// length. The core is the only authority, and it answers every authentication
// failure with the same 200 `state:"none"` body.
// =============================================================================

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 15;

const MAX_BODY_BYTES = 256;
const MAX_UPSTREAM_BYTES = 4096;
const MAX_CAPABILITY_LENGTH = 256;
const UPSTREAM_TIMEOUT_MS = 5_000;
const MIN_SECRET_LENGTH = 32;
const MAX_IP_LENGTH = 45; // longest textual IPv6 (incl. IPv4-mapped) is 45 chars
const SESSION_COOKIE = 'nexus_sid';
const STATUS_HEADER = 'x-nexus-status';
const DEFAULT_RETRY_AFTER_S = '60';

/** The only two request bodies this route forwards, compared as exact bytes. */
const LIVE_BODY = '{"v":1}';
const RECOVERED_BODY = '{"v":1,"m":"r"}';

/** The closed status states the core may answer with. */
const STATES = new Set(['none', 'pending', 'update', 'final']);

type ErrorCode =
  | 'disabled'
  | 'provider_unavailable'
  | 'bad_origin'
  | 'invalid_input'
  | 'payload_too_large'
  | 'rate_limited';

const baseHeaders = (): Headers =>
  new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });

/** Uniform JSON error: `{code, message}` with cache-control: no-store. */
function jsonError(status: number, code: ErrorCode, message: string): Response {
  return new Response(JSON.stringify({ code, message }), { status, headers: baseHeaders() });
}

const providerUnavailable = (): Response =>
  jsonError(503, 'provider_unavailable', 'the assistant is temporarily unavailable');

const badOrigin = (): Response => jsonError(403, 'bad_origin', 'ingress authentication required');

const invalidInput = (): Response => jsonError(400, 'invalid_input', 'the request was not understood');

const tooLarge = (): Response => jsonError(413, 'payload_too_large', 'the request is too large');

/**
 * Validate the core URL strictly — identical rules to the chat proxy. TLS only,
 * no embedded credentials, no query/fragment, no path, because this proxy
 * composes `origin + '/api/nexus/status'` and must not inherit surprises.
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

const HOMEPAGE_PATHNAME = '/';
const HOMEPAGE_PATHNAME_ALIAS = '/index.html';

/**
 * Document gate, character-for-character the chat and reset proxies'. The same
 * LIMITATION applies unchanged (see app/api/nexus/reset/route.ts and controller
 * ruling R44): this is defence in depth, not a security boundary, because any
 * same-origin script can present the homepage as its referrer. What actually
 * bounds a same-origin caller here is the core: the capability's MAC binds the
 * nexus_sid session and the network, and the core's separate `poll` rate-limit
 * scope throttles it.
 */
function isHomepageDocument(request: Request): boolean {
  const referer = request.headers.get('referer');
  // Absent, or present-but-empty (a stripped `Referer:` with no value).
  if (!referer) return false;

  let documentUrl: URL;
  try {
    // Absolute parse only, deliberately: no base is supplied, so a relative or
    // otherwise malformed value throws here rather than being resolved against
    // anything this route chose for it.
    documentUrl = new URL(referer);
  } catch {
    return false;
  }

  // Credentials never appear in a browser-generated Referer (the referrer
  // serialiser strips them), so a value carrying them is not a browser speaking
  // and is refused before `origin` — which ignores userinfo — is consulted.
  if (documentUrl.username || documentUrl.password) return false;

  // The SAME origin the gate above approves — read off this request, not from a
  // second list that could drift from it. Scheme, host and port all included.
  if (documentUrl.origin !== new URL(request.url).origin) return false;

  // Decide on the PARSED pathname, never on the raw header string:
  //   - `search` and `hash` are not part of `pathname`, so `/?utm=x` and
  //     `/#panel` decide exactly as `/` does, with no stripping code here.
  //   - The URL parser has already resolved `.` / `..` segments and collapsed
  //     duplicated slashes, so a traversal string is judged by where it
  //     actually points — which is also the URL the browser would have put in
  //     the header, because it serialises the document's parsed URL too.
  //   - Percent-encoding is NOT decoded, here or by the parser. `/%69ndex.html`
  //     stays `/%69ndex.html` and is refused: only the two exact spellings
  //     below are accepted, case-sensitively.
  const pathname = documentUrl.pathname;
  return pathname === HOMEPAGE_PATHNAME || pathname === HOMEPAGE_PATHNAME_ALIAS;
}

/**
 * Best-effort client IP, identical to reset. The core needs it twice here: the
 * status capability's MAC binds the caller's network bucket, and the `poll`
 * rate-limit scope counts per network. Truncated so a hostile header cannot
 * bloat the upstream request.
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
 * Read a body stream with an early, running byte cap: cancel the stream the
 * moment the total crosses `limit` instead of buffering an unbounded body.
 * Used for the caller's request (256 B) and for the core's answer (4 KiB).
 */
async function readCapped(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
): Promise<Uint8Array<ArrayBuffer> | 'too_large' | 'invalid'> {
  if (!body) return new Uint8Array(0) as Uint8Array<ArrayBuffer>;
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
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

/** A 2xx body is relayed only if it is the closed status shape's envelope. */
function isStatusBody(text: string): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
  const record = parsed as { v?: unknown; state?: unknown };
  return record.v === 1 && typeof record.state === 'string' && STATES.has(record.state);
}

/** retry-after is relayed only as a small canonical integer; anything else is a fixed 60. */
function retryAfterValue(raw: string | null): string {
  const value = (raw ?? '').trim();
  if (/^[0-9]{1,4}$/.test(value) && Number(value) <= 3600) return String(Number(value));
  return DEFAULT_RETRY_AFTER_S;
}

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  let status = 0;
  try {
    const response = await handle(request);
    status = response.status;
    return response;
  } catch {
    // Any unexpected throw still gets the fixed fail-closed body. The error is
    // deliberately not inspected, so no text it carries can reach a log.
    const response = providerUnavailable();
    status = response.status;
    return response;
  } finally {
    // One bounded line per request, never the capability, body, cookie or IP.
    console.log(JSON.stringify({ route: 'nexus-status', status, ms: Date.now() - startedAt }));
  }
}

async function handle(request: Request): Promise<Response> {
  // 1. Kill switch — the SAME switch as chat and reset.
  if (process.env.NEXUS_CHAT_ENABLED !== '1') {
    return jsonError(503, 'disabled', 'the assistant is not enabled');
  }

  // 2. Environment. Both must be present and sane; never reveal which failed.
  const coreUrl = parseCoreUrl(process.env.NEXUS_CORE_URL);
  const secret = (process.env.NEXUS_PROXY_SECRET ?? '').trim();
  if (!coreUrl || secret.length < MIN_SECRET_LENGTH) {
    return providerUnavailable();
  }

  // 3. Origin, then 3b. document — one indistinguishable refusal for both.
  if (!isSameOrigin(request) || !isHomepageDocument(request)) {
    return badOrigin();
  }

  // 4. Content type. The core only speaks JSON.
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    return invalidInput();
  }

  // 5. Body cap: declared length first, then a running byte counter.
  const declared = request.headers.get('content-length');
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isFinite(n) && n > MAX_BODY_BYTES) {
      return tooLarge();
    }
  }
  const bodyResult = await readCapped(request.body, MAX_BODY_BYTES);
  if (bodyResult === 'too_large') return tooLarge();
  if (bodyResult === 'invalid') return invalidInput();
  const buf = bodyResult;

  // 6. The body is one of exactly two byte strings. No field can smuggle an
  //    action (message, select, consent, ...) through a read-only poll.
  const bodyText = new TextDecoder('utf-8', { fatal: false }).decode(buf);
  if (bodyText !== LIVE_BODY && bodyText !== RECOVERED_BODY) {
    return invalidInput();
  }

  // 7. The capability: present and bounded. Its meaning is the core's decision.
  const capability = request.headers.get(STATUS_HEADER);
  if (!capability || capability.length > MAX_CAPABILITY_LENGTH) {
    return invalidInput();
  }

  const ip = clientIp(request);
  const cookie = sessionCookie(request);

  // 8. Upstream call. Exactly one attempt; redirect:'error' so a misconfigured
  //    core can never bounce us (and the secret) to a third party. The header
  //    set is built here, explicitly — no caller header is copied wholesale.
  let upstream: Response;
  try {
    upstream = await fetch(coreUrl.origin + '/api/nexus/status', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'content-length': String(buf.byteLength),
        accept: 'application/json',
        'x-nexus-proxy-auth': secret,
        'x-nexus-client-ip': ip,
        ...(cookie ? { cookie } : {}),
        [STATUS_HEADER]: capability,
      },
      body: buf,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
  } catch {
    return providerUnavailable();
  }

  // 9. Non-2xx: a fixed body per class. Nothing from the core's error body is
  //    relayed, and the upstream body is not even read.
  if (upstream.status < 200 || upstream.status >= 300) {
    try {
      await upstream.body?.cancel();
    } catch {
      // Nothing further to release.
    }
    if (upstream.status === 429) {
      const response = jsonError(429, 'rate_limited', 'too many status requests');
      response.headers.set('retry-after', retryAfterValue(upstream.headers.get('retry-after')));
      return response;
    }
    if (upstream.status === 400) return invalidInput();
    if (upstream.status === 403) return badOrigin();
    if (upstream.status === 413) return tooLarge();
    return providerUnavailable();
  }

  // 10. 2xx: bounded read, closed-shape check, then relay the bytes verbatim
  //     under headers built from scratch.
  const answer = await readCapped(upstream.body, MAX_UPSTREAM_BYTES);
  if (answer === 'too_large' || answer === 'invalid') {
    return providerUnavailable();
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(answer);
  } catch {
    return providerUnavailable();
  }
  if (!isStatusBody(text)) {
    return providerUnavailable();
  }
  return new Response(text, { status: upstream.status, headers: baseHeaders() });
}

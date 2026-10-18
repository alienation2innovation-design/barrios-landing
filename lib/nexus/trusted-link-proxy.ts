import { createHash } from 'node:crypto';

const MIN_SECRET_LENGTH = 32;
const MAX_IP_LENGTH = 45;
const UPSTREAM_TIMEOUT_MS = 8_000;
const MAX_PAGE_BYTES = 128 * 1024;
const MAX_API_RESPONSE_BYTES = 8 * 1024;
const MAX_API_MESSAGE_LENGTH = 200;
const FAILURE_SCRIPT = "history.replaceState(null,'',location.pathname)";
const FAILURE_SCRIPT_HASH = createHash('sha256').update(FAILURE_SCRIPT).digest('base64');
const FAILURE_CSP =
  `default-src 'none'; script-src 'sha256-${FAILURE_SCRIPT_HASH}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`;

type ProxyKind = 'page' | 'api';

type ProxyOptions = {
  readonly kind: ProxyKind;
  readonly path: '/verify' | '/api/verify' | '/owner/decision' | '/api/owner/decision' | '/schedule/pick' | '/api/schedule/pick';
  readonly maxRequestBytes?: number;
};

type ReadResult = Uint8Array<ArrayBuffer> | 'too_large' | 'invalid';

function jsonError(status: number, code: string, message: string): Response {
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

function pageUnavailable(): Response {
  const html =
    '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Link unavailable</title><main><h1>This link is temporarily unavailable.</h1>' +
    '<p>You can safely close this tab.</p></main><script>' + FAILURE_SCRIPT + '</script></html>';
  return new Response(html, {
    status: 503,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'content-security-policy': FAILURE_CSP,
      'referrer-policy': 'no-referrer',
      'x-content-type-options': 'nosniff',
    },
  });
}

function unavailable(kind: ProxyKind): Response {
  return kind === 'page' ? pageUnavailable() : providerUnavailable();
}

function mediaType(headers: Headers): string {
  return (headers.get('content-type') ?? '').split(';', 1)[0].trim().toLowerCase();
}

function parseCoreUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:') return null;
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
  return url;
}

function clientIp(request: Request): string {
  const candidates = [
    request.headers.get('x-vercel-forwarded-for'),
    request.headers.get('x-real-ip'),
    (request.headers.get('x-forwarded-for') ?? '').split(',')[0],
  ];
  for (const candidate of candidates) {
    const value = (candidate ?? '').trim();
    if (value) return value.slice(0, MAX_IP_LENGTH);
  }
  return '';
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (origin !== null) return origin === new URL(request.url).origin;
  return request.headers.get('sec-fetch-site') === 'same-origin';
}

async function readCappedStream(stream: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<ReadResult> {
  if (!stream) return new Uint8Array(0) as Uint8Array<ArrayBuffer>;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        try {
          await reader.cancel();
        } catch {
          // The upstream may already have closed after the oversize chunk.
        }
        return 'too_large';
      }
      chunks.push(value);
    }
  } catch {
    return 'invalid';
  }
  const output = new Uint8Array(total) as Uint8Array<ArrayBuffer>;
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function pageHeaders(upstream: Response): Headers | null {
  const csp = upstream.headers.get('content-security-policy')?.trim();
  const referrerPolicy = upstream.headers.get('referrer-policy')?.trim().toLowerCase();
  const contentTypeOptions = upstream.headers.get('x-content-type-options')?.trim().toLowerCase();
  if (
    upstream.status !== 200 ||
    mediaType(upstream.headers) !== 'text/html' ||
    !csp ||
    referrerPolicy !== 'no-referrer' ||
    contentTypeOptions !== 'nosniff'
  ) {
    return null;
  }
  return new Headers({
    'content-type': upstream.headers.get('content-type') ?? 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': csp,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function apiBody(path: ProxyOptions['path'], bytes: Uint8Array<ArrayBuffer>): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const value = parsed as Record<string, unknown>;
  const validMessage =
    typeof value.message === 'string' && value.message.length > 0 && value.message.length <= MAX_API_MESSAGE_LENGTH;

  if (path === '/api/verify') {
    if (!exactKeys(value, ['ok', 'message']) || typeof value.ok !== 'boolean' || !validMessage) return null;
    return JSON.stringify({ ok: value.ok, message: value.message });
  }

  if (exactKeys(value, ['message']) && validMessage) {
    return JSON.stringify({ message: value.message });
  }

  if (path !== '/api/schedule/pick' || !exactKeys(value, ['slots']) || !Array.isArray(value.slots)) return null;
  const ids = ['A', 'B', 'C'] as const;
  if (
    value.slots.length !== ids.length ||
    !value.slots.every((slot, index) => {
      if (typeof slot !== 'object' || slot === null || Array.isArray(slot)) return false;
      const record = slot as Record<string, unknown>;
      return (
        exactKeys(record, ['slotId', 'label']) &&
        record.slotId === ids[index] &&
        typeof record.label === 'string' &&
        record.label.length > 0 &&
        record.label.length <= 120
      );
    })
  ) {
    return null;
  }
  return JSON.stringify({
    slots: value.slots.map((slot) => {
      const record = slot as Record<string, unknown>;
      return { slotId: record.slotId, label: record.label };
    }),
  });
}

async function handle(request: Request, options: ProxyOptions): Promise<Response> {
  if (process.env.NEXUS_CHAT_ENABLED !== '1') {
    return options.kind === 'page' ? pageUnavailable() : jsonError(503, 'disabled', 'the assistant is not enabled');
  }

  const coreUrl = parseCoreUrl(process.env.NEXUS_CORE_URL);
  const secret = (process.env.NEXUS_PROXY_SECRET ?? '').trim();
  if (!coreUrl || secret.length < MIN_SECRET_LENGTH) return unavailable(options.kind);

  if (options.kind === 'api' && !isSameOrigin(request)) {
    return jsonError(403, 'bad_origin', 'ingress authentication required');
  }

  let body: Uint8Array<ArrayBuffer> | undefined;
  if (options.kind === 'api') {
    if (mediaType(request.headers) !== 'application/json') {
      return jsonError(400, 'invalid_input', 'the request was not understood');
    }
    const maxBytes = options.maxRequestBytes ?? 0;
    const declared = request.headers.get('content-length');
    if (declared !== null) {
      const length = Number(declared);
      if (Number.isFinite(length) && length > maxBytes) {
        return jsonError(413, 'payload_too_large', 'the request is too large');
      }
    }
    const read = await readCappedStream(request.body, maxBytes);
    if (read === 'too_large') return jsonError(413, 'payload_too_large', 'the request is too large');
    if (read === 'invalid') return jsonError(400, 'invalid_input', 'the request was not understood');
    body = read;
  }

  let upstream: Response;
  try {
    upstream = await fetch(coreUrl.origin + options.path, {
      method: options.kind === 'page' ? 'GET' : 'POST',
      headers: {
        accept: options.kind === 'page' ? 'text/html' : 'application/json',
        'x-nexus-proxy-auth': secret,
        'x-nexus-client-ip': clientIp(request),
        ...(body
          ? {
              'content-type': 'application/json',
              'content-length': String(body.byteLength),
            }
          : {}),
      },
      ...(body ? { body } : {}),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(UPSTREAM_TIMEOUT_MS)]),
    });
  } catch {
    return unavailable(options.kind);
  }

  const responseBody = await readCappedStream(
    upstream.body,
    options.kind === 'page' ? MAX_PAGE_BYTES : MAX_API_RESPONSE_BYTES,
  );
  if (responseBody === 'too_large' || responseBody === 'invalid') return unavailable(options.kind);

  if (options.kind === 'page') {
    const headers = pageHeaders(upstream);
    if (!headers) return pageUnavailable();
    return new Response(responseBody, { status: 200, headers });
  }

  if ((upstream.status !== 200 && upstream.status !== 429) || mediaType(upstream.headers) !== 'application/json') {
    return providerUnavailable();
  }
  const sanitizedBody = apiBody(options.path, responseBody);
  if (sanitizedBody === null) return providerUnavailable();
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  const retryAfter = upstream.headers.get('retry-after')?.trim();
  if (upstream.status === 429 && retryAfter && /^\d{1,4}$/.test(retryAfter)) headers.set('retry-after', retryAfter);
  return new Response(sanitizedBody, { status: upstream.status, headers });
}

export function createNexusPageProxy(path: ProxyOptions['path']): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now();
    let status = 0;
    try {
      const response = await handle(request, { kind: 'page', path });
      status = response.status;
      return response;
    } catch {
      const response = pageUnavailable();
      status = response.status;
      return response;
    } finally {
      console.log(JSON.stringify({ route: `nexus-link:${path}`, status, ms: Date.now() - startedAt }));
    }
  };
}

export function createNexusApiProxy(
  path: ProxyOptions['path'],
  maxRequestBytes: number,
): (request: Request) => Promise<Response> {
  return async (request: Request): Promise<Response> => {
    const startedAt = Date.now();
    let status = 0;
    try {
      const response = await handle(request, { kind: 'api', path, maxRequestBytes });
      status = response.status;
      return response;
    } catch {
      const response = providerUnavailable();
      status = response.status;
      return response;
    } finally {
      console.log(JSON.stringify({ route: `nexus-link:${path}`, status, ms: Date.now() - startedAt }));
    }
  };
}

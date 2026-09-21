// =============================================================================
// lib/nexus/sse-pump.ts — byte-transparent SSE relay with terminal guarantee
//
// The website route (app/api/nexus/chat/route.ts) proxies a text/event-stream
// response from the NEXUS core to the browser. Two things can go wrong in the
// middle of that relay:
//
//   1. The upstream connection to the core drops (network blip, core crash,
//      fetch timeout). If we simply closed the client stream, the browser's
//      EventSource/fetch reader would see a clean end-of-stream with no
//      `event: done` and the UI would sit on a spinner forever.
//   2. The client walks away (tab closed, request aborted). We must cancel the
//      upstream so the core stops generating, and we must not try to write a
//      frame into a stream nobody is reading.
//
// This module solves both without ever touching the bytes that pass through:
// it only OBSERVES completed frames to learn whether a terminal frame
// (`event: done` or `event: error`) has already been delivered. On upstream
// failure, if no terminal was seen and the client is still attached, exactly
// one synthetic ERROR_FRAME is appended so the UI can settle. It never appends
// a second terminal, and it never rewrites or drops upstream bytes.
//
// Pure module: no Next.js imports, Node >= 20 web streams only, and written in
// "erasable" TypeScript so `node --test` on Node 24 can import it directly.
// =============================================================================

/**
 * The one frame this module is allowed to synthesise. Shape mirrors the core's
 * own `event: error` payload so the browser handles both identically.
 * `request_id` is empty because the proxy does not parse the stream to learn it.
 */
export const ERROR_FRAME =
  'event: error\ndata: {"code":"provider_unavailable","message":"the connection to the assistant was lost","request_id":""}\n\n';

export type PumpOptions = {
  /** Test/observability hook: invoked once, the first time an upstream terminal frame completes. */
  onTerminal?: () => void;
};

const FRAME_SEPARATOR = '\n\n';
// Defensive cap on the scanner's *unresolved* tail (observation-only; every
// raw byte is still forwarded to the client regardless). Bounds memory if a
// malfunctioning upstream ever emits a very long run with no frame separator.
const MAX_TAIL_CHARS = 65536;

/**
 * True when the frame's FIRST line is exactly `event: done` or `event: error`.
 * Deliberately strict: no trimming, no case folding. The core emits exactly
 * these strings, and anything else (a data-only frame, a comment, a leading
 * space) is not a terminal and must not be mistaken for one.
 */
export function isTerminalFrame(frame: string): boolean {
  const nl = frame.indexOf('\n');
  const firstLine = nl === -1 ? frame : frame.slice(0, nl);
  return firstLine === 'event: done' || firstLine === 'event: error';
}

/**
 * Streaming frame scanner. Feeds decoded text into a tail buffer, splits on
 * the SSE frame separator, and reports whether any completed frame is
 * terminal. The undelivered remainder is kept so a terminal split across a
 * chunk boundary (`event: do` | `ne\ndata: {}\n\n`) is still recognised.
 *
 * Uses a streaming TextDecoder so a multi-byte UTF-8 sequence split across
 * chunks does not corrupt the scanner's view (the raw bytes are forwarded
 * untouched regardless; the decoder is only for observation).
 */
function createScanner(onTerminal: () => void): { feed: (chunk: Uint8Array) => void } {
  // Streaming mode is selected per decode() call ({ stream: true } below);
  // the constructor only takes fatal/ignoreBOM.
  const decoder = new TextDecoder('utf-8');
  let tail = '';
  let fired = false;

  return {
    feed(chunk: Uint8Array): void {
      if (fired) return; // Nothing more to learn once a terminal has been seen.
      tail += decoder.decode(chunk, { stream: true });
      let idx = tail.indexOf(FRAME_SEPARATOR);
      while (idx !== -1) {
        const frame = tail.slice(0, idx);
        tail = tail.slice(idx + FRAME_SEPARATOR.length);
        if (isTerminalFrame(frame)) {
          fired = true;
          onTerminal();
          return;
        }
        idx = tail.indexOf(FRAME_SEPARATOR);
      }
      if (tail.length > MAX_TAIL_CHARS) {
        // No frame separator arrived within a very long run of bytes. Drop
        // the observation buffer's excess rather than growing it unboundedly;
        // this affects terminal-frame *detection* only, never the bytes
        // already forwarded to the client by the caller.
        tail = tail.slice(-MAX_TAIL_CHARS);
      }
    },
  };
}

/**
 * Relay `upstream` to a new ReadableStream byte-for-byte, appending exactly one
 * ERROR_FRAME only if the upstream fails before any terminal frame was
 * delivered and the client has not cancelled.
 *
 * Guarantees:
 *   - bytes are forwarded unchanged (the scanner only observes)
 *   - at most one terminal is ever ADDED; upstream terminals are never counted,
 *     rewritten or deduplicated
 *   - the returned stream is closed exactly once, and never after a client cancel
 *   - the internal start() promise always settles without rejection
 *   - client cancel propagates to `upstream.cancel(reason)`
 */
export function pumpSse(upstream: ReadableStream<Uint8Array>, opts?: PumpOptions): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let sawTerminal = false;
  let clientCancelled = false;
  let closed = false;

  const scanner = createScanner(() => {
    sawTerminal = true;
    try {
      opts?.onTerminal?.();
    } catch {
      // An observer must never be able to break the relay.
    }
  });

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      reader = upstream.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          scanner.feed(value);
          if (clientCancelled) break; // Do not write into a stream the client abandoned.
          controller.enqueue(value);
        }
      } catch {
        // Upstream failed mid-relay. Only settle the UI with a synthetic
        // terminal if the upstream did not already send one and the client is
        // still listening. Otherwise the failure is silent by design.
        if (!sawTerminal && !clientCancelled) {
          try {
            controller.enqueue(encoder.encode(ERROR_FRAME));
          } catch {
            // Controller already closed/errored; nothing further to do.
          }
        }
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // Lock may already be released by a concurrent cancel; harmless.
        }
        if (!clientCancelled && !closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Closing twice or after error is not an error we care about.
          }
        }
      }
    },

    cancel(reason) {
      clientCancelled = true;
      // Propagate to the core so generation stops. reader.cancel() also
      // resolves any pending read() in start() with { done: true }, which lets
      // the loop exit and the finally block release the lock.
      if (reader) {
        reader.cancel(reason).catch(() => {});
      } else {
        upstream.cancel(reason).catch(() => {});
      }
    },
  });
}

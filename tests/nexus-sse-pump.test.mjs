// =============================================================================
// tests/nexus-sse-pump.test.mjs — unit tests for lib/nexus/sse-pump.ts
//
// Run: node --test tests/nexus-sse-pump.test.mjs
//
// Node 24 strips TypeScript types on import, so the pump is imported directly
// without a build step. The pump must therefore stay "erasable" TS (no enums,
// no namespaces, no parameter properties).
// =============================================================================

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ERROR_FRAME, isTerminalFrame, pumpSse } from '../lib/nexus/sse-pump.ts';

const enc = new TextEncoder();
const dec = new TextDecoder();

const META = 'event: meta\ndata: {"request_id":"r1"}\n\n';
const DELTA = 'event: delta\ndata: {"text":"hi"}\n\n';
const DONE = 'event: done\ndata: {}\n\n';
const ERR = 'event: error\ndata: {"code":"x","message":"y","request_id":"r1"}\n\n';

/**
 * Build an upstream ReadableStream<Uint8Array> from string/Uint8Array chunks.
 *
 * options.throwAfter  — after this many chunks have been delivered the source
 *                       throws (simulates a lost connection to the core).
 * options.hang        — after delivering all chunks the source never closes;
 *                       the returned `release()` resolves the pending pull.
 * Returns { stream, cancelled, cancelReason, release }.
 */
function makeUpstream(chunks, options = {}) {
  const { throwAfter = Infinity, hang = false } = options;
  const state = { cancelled: false, cancelReason: undefined, release: () => {} };
  let delivered = 0;
  let hangResolve = null;
  const stream = new ReadableStream({
    async pull(controller) {
      if (delivered >= throwAfter) {
        throw new Error('upstream exploded');
      }
      if (delivered < chunks.length) {
        const c = chunks[delivered++];
        controller.enqueue(typeof c === 'string' ? enc.encode(c) : c);
        return;
      }
      if (hang) {
        await new Promise((resolve) => {
          hangResolve = resolve;
        });
        // Released by the test (or by cancel): behave as if the source then ended.
        try {
          controller.close();
        } catch {
          // Already cancelled by the pump; closing is a no-op then.
        }
        return;
      }
      controller.close();
    },
    cancel(reason) {
      state.cancelled = true;
      state.cancelReason = reason;
      if (hangResolve) hangResolve();
    },
  });
  state.release = () => {
    if (hangResolve) hangResolve();
  };
  return { stream, state };
}

/**
 * Drain a pumped stream to completion and return the concatenated text plus
 * how many times read() reported done (must be exactly one) and whether any
 * read() threw.
 */
async function drain(stream) {
  const reader = stream.getReader();
  const parts = [];
  let doneCount = 0;
  let threw = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        doneCount++;
        break;
      }
      parts.push(value);
    }
    // A second read after done must still report done, not throw.
    const again = await reader.read();
    if (again.done) doneCount++;
  } catch (err) {
    threw = err;
  }
  const total = parts.reduce((n, p) => n + p.byteLength, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.byteLength;
  }
  return { text: dec.decode(out), doneCount, threw };
}

function countTerminals(text) {
  return text
    .split('\n\n')
    .filter((f) => f.length > 0)
    .filter((f) => isTerminalFrame(f)).length;
}

// ---------------------------------------------------------------------------
// 1. passthrough
// ---------------------------------------------------------------------------
test('1. passthrough: meta/delta/done in three chunks -> identical bytes, no error frame, onTerminal once', async () => {
  const { stream, state } = makeUpstream([META, DELTA, DONE]);
  let terminalCalls = 0;
  const pumped = pumpSse(stream, { onTerminal: () => terminalCalls++ });
  const r = await drain(pumped);
  assert.equal(r.text, META + DELTA + DONE);
  assert.equal(r.text.includes(ERROR_FRAME), false);
  assert.equal(terminalCalls, 1);
  assert.equal(r.doneCount, 2, 'read() reported done, and a follow-up read also reports done without throwing');
  assert.equal(r.threw, null);
  assert.equal(state.cancelled, false);
});

// ---------------------------------------------------------------------------
// 2. split terminal across chunk boundaries
// ---------------------------------------------------------------------------
test('2. split terminal: "event: do" | "ne\\ndata: {}\\n\\n" then source throws -> no error frame appended', async () => {
  const { stream } = makeUpstream([META + 'event: do', 'ne\ndata: {}\n\n'], { throwAfter: 2 });
  let terminalCalls = 0;
  const pumped = pumpSse(stream, { onTerminal: () => terminalCalls++ });
  const r = await drain(pumped);
  assert.equal(r.text, META + DONE);
  assert.equal(terminalCalls, 1);
  assert.equal(countTerminals(r.text), 1);
  assert.equal(r.threw, null);
});

// ---------------------------------------------------------------------------
// 3. source failure after partial data
// ---------------------------------------------------------------------------
test('3. source failure after partial data -> delivered bytes + exactly one ERROR_FRAME, then close', async () => {
  const { stream } = makeUpstream([META, DELTA], { throwAfter: 2 });
  let terminalCalls = 0;
  const pumped = pumpSse(stream, { onTerminal: () => terminalCalls++ });
  const r = await drain(pumped);
  assert.equal(r.text, META + DELTA + ERROR_FRAME);
  assert.equal(terminalCalls, 0, 'onTerminal observes upstream terminals only, not the synthesised one');
  assert.equal(countTerminals(r.text), 1);
  assert.equal(r.doneCount, 2);
  assert.equal(r.threw, null);
});

test('3b. source failure with no data at all -> exactly one ERROR_FRAME, then close', async () => {
  const { stream } = makeUpstream([], { throwAfter: 0 });
  const pumped = pumpSse(stream);
  const r = await drain(pumped);
  assert.equal(r.text, ERROR_FRAME);
  assert.equal(r.doneCount, 2);
  assert.equal(r.threw, null);
});

// ---------------------------------------------------------------------------
// 4. source failure after a delivered error frame
// ---------------------------------------------------------------------------
test('4. source failure after a delivered event: error frame -> nothing appended', async () => {
  const { stream } = makeUpstream([META, ERR], { throwAfter: 2 });
  let terminalCalls = 0;
  const pumped = pumpSse(stream, { onTerminal: () => terminalCalls++ });
  const r = await drain(pumped);
  assert.equal(r.text, META + ERR);
  assert.equal(terminalCalls, 1);
  assert.equal(countTerminals(r.text), 1);
  assert.equal(r.threw, null);
});

// ---------------------------------------------------------------------------
// 5. consumer cancellation mid-stream
// ---------------------------------------------------------------------------
test('5. consumer cancel mid-stream -> upstream cancelled, nothing appended, no unhandled rejection, start settled', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const { stream, state } = makeUpstream([META, DELTA], { hang: true });
    let terminalCalls = 0;
    // Wrap the source so we can observe when the pump's start() settles:
    // the pump releases the reader lock in its finally block, so once the
    // upstream reports it is no longer locked, start() has run to completion.
    const pumped = pumpSse(stream, { onTerminal: () => terminalCalls++ });
    const reader = pumped.getReader();
    const first = await reader.read();
    assert.equal(dec.decode(first.value), META);
    const second = await reader.read();
    assert.equal(dec.decode(second.value), DELTA);
    // Source is now pending (hang). Client walks away.
    await reader.cancel('client gone');
    // Let microtasks / the pump's catch+finally settle.
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(state.cancelled, true, 'upstream cancel() was invoked');
    assert.equal(state.cancelReason, 'client gone');
    assert.equal(terminalCalls, 0);
    assert.equal(stream.locked, false, 'reader lock released -> start() finally ran -> start() settled');
    // Reading after cancel reports done and never yields an error frame.
    const after = await reader.read();
    assert.equal(after.done, true);
    assert.equal(after.value, undefined);
    assert.equal(unhandled.length, 0, 'no unhandled rejection during cancel path');
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

test('5b. consumer cancel before any read -> upstream cancelled, start settled, no unhandled rejection', async () => {
  const unhandled = [];
  const onUnhandled = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const { stream, state } = makeUpstream([META], { hang: true });
    const pumped = pumpSse(stream);
    await pumped.cancel('bye');
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(state.cancelled, true);
    assert.equal(stream.locked, false);
    assert.equal(unhandled.length, 0);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});

// ---------------------------------------------------------------------------
// 6. never two terminals
// ---------------------------------------------------------------------------
test('6a. source emits done then throws -> exactly one terminal in output', async () => {
  const { stream } = makeUpstream([META, DONE], { throwAfter: 2 });
  const pumped = pumpSse(stream);
  const r = await drain(pumped);
  assert.equal(r.text, META + DONE);
  assert.equal(countTerminals(r.text), 1);
  assert.equal(r.doneCount, 2);
});

test('6b. malformed upstream: error frame then done frame -> both forwarded verbatim, nothing added', async () => {
  const { stream } = makeUpstream([ERR, DONE], { throwAfter: 2 });
  let terminalCalls = 0;
  const pumped = pumpSse(stream, { onTerminal: () => terminalCalls++ });
  const r = await drain(pumped);
  assert.equal(r.text, ERR + DONE, 'bytes are forwarded unchanged; the pump never rewrites upstream');
  assert.equal(countTerminals(r.text), 2, 'both upstream terminals present, none synthesised');
  assert.equal(r.text.includes(ERROR_FRAME), false);
  assert.equal(terminalCalls >= 1, true);
});

test('6c. bytes forwarded unchanged even when not valid SSE or split mid-UTF-8', async () => {
  // A multi-byte character split across two chunks must be forwarded byte-for-byte
  // and the streaming decoder must not corrupt the scanner's view of frames.
  const full = enc.encode('event: delta\ndata: {"text":"héllo"}\n\n');
  const a = full.slice(0, 22); // splits inside 'é' (0xC3 0xA9)
  const b = full.slice(22);
  const { stream } = makeUpstream([a, b, DONE]);
  let terminalCalls = 0;
  const pumped = pumpSse(stream, { onTerminal: () => terminalCalls++ });
  const r = await drain(pumped);
  assert.equal(r.text, dec.decode(full) + DONE);
  assert.equal(terminalCalls, 1);
});

// ---------------------------------------------------------------------------
// 6d. unbounded incomplete tail is bounded, bytes still forwarded unchanged
// ---------------------------------------------------------------------------
test('6d. a long run of bytes with no frame separator never grows the scanner tail unbounded, and is still forwarded byte-for-byte', async () => {
  const garbage1 = 'x'.repeat(100000); // no '\n\n' anywhere in either chunk
  const garbage2 = 'y'.repeat(100000);
  const { stream } = makeUpstream([garbage1, garbage2]);
  let terminalCalls = 0;
  const pumped = pumpSse(stream, { onTerminal: () => terminalCalls++ });
  const r = await drain(pumped);
  assert.equal(r.text, garbage1 + garbage2, 'raw bytes are forwarded unchanged regardless of the observation-only tail cap');
  assert.equal(terminalCalls, 0);
  assert.equal(r.threw, null);
  assert.equal(r.doneCount, 2);
});

// ---------------------------------------------------------------------------
// 7. close exactly once (every path)
// ---------------------------------------------------------------------------
test('7. close exactly once: clean end, throw-after-data, throw-after-terminal each report done once and never throw', async () => {
  const cases = [
    makeUpstream([META, DONE]),
    makeUpstream([META], { throwAfter: 1 }),
    makeUpstream([DONE], { throwAfter: 1 }),
    makeUpstream([]),
  ];
  for (const { stream } of cases) {
    const r = await drain(pumpSse(stream));
    assert.equal(r.threw, null);
    // drain() counts the first done plus one confirming re-read; both must be done.
    assert.equal(r.doneCount, 2);
  }
});

// ---------------------------------------------------------------------------
// 8. isTerminalFrame unit rows
// ---------------------------------------------------------------------------
test('8. isTerminalFrame unit rows', () => {
  assert.equal(isTerminalFrame('event: done\ndata: {}'), true);
  assert.equal(isTerminalFrame('event: delta\ndata: {}'), false);
  assert.equal(isTerminalFrame('event: error'), true);
  assert.equal(isTerminalFrame(' event: done'), false);
  assert.equal(isTerminalFrame('event: done '), false);
  assert.equal(isTerminalFrame(''), false);
  assert.equal(isTerminalFrame('data: {}\nevent: done'), false, 'first line only');
});

// =============================================================================
// tests/nexus-status-widget.test.mjs — behaviour of the NEXUS status poller
//
// Run: node --test tests/nexus-status-widget.test.mjs
//
// The WHOLE shipped widget script is lifted out of public/index.html and run in
// a node:vm context against a small fake DOM, a scripted clock and a scripted
// network. Nothing here reimplements the widget: every assertion is about what
// the served code actually does — what reaches sessionStorage, what goes over
// the wire, what the visitor sees, and when polling stops.
//
// Design source: NEXUS docs/implementation/status-channel.md §4.1 and §6.
// =============================================================================

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const HTML = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const SCRIPT = (() => {
  const tag = HTML.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0];
  assert.ok(tag, 'the NEXUS widget script must exist');
  return tag.replace(/^<script>/i, '').replace(/<\/script>$/i, '');
})();
const TEXT = (() => {
  const src = SCRIPT.replace(/\/\*[\s\S]*?\*\//g, '').match(/const TEXT=\{[\s\S]*?\};/)?.[0];
  assert.ok(src, 'the TEXT table must exist');
  return new Function('return (' + src.replace(/^const TEXT=/, '').replace(/;\s*$/, '') + ')')();
})();

const T0 = 1_790_000_000_000;
// status-channel.md Rev 2: `op` is a 43-char base64url HMAC reference (§1.3), and the
// capability is sealed `st2.<iat>.<exp>.<iv 16>.<ct 114>.<tag 22>` (§1.2) - the op is
// not readable from it, so `op` is only a label here.
const OP = 'Op1_' + 'a'.repeat(39);
const OP2 = 'Op2-' + 'b'.repeat(39);
const capFor = (_op, exp, n = 'A') => `st2.${T0 - 1000}.${exp}.${n.repeat(16)}.${'C'.repeat(114)}.${'T'.repeat(22)}`;
const EXP = T0 + 30 * 60 * 1000;
const CAP = capFor(OP, EXP);
const V = (c) => c.repeat(43);
const KEY = 'nexus.op';

// ---------------------------------------------------------------------------
// fake DOM
// ---------------------------------------------------------------------------
class FakeText {
  constructor(data) {
    this.data = String(data);
    this.parentNode = null;
    this.childNodes = [];
  }
  get textContent() {
    return this.data;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
}

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.attrs = new Map();
    this.listeners = {};
    this.style = {};
    this.dataset = {};
    this.disabled = false;
    this.value = '';
    this.className = '';
    this.type = '';
    this.href = '';
    this.scrollTop = 0;
    this.scrollHeight = 0;
    const set = new Set();
    this.classList = {
      add: (c) => set.add(c),
      remove: (c) => set.delete(c),
      contains: (c) => set.has(c),
      toggle: (c) => (set.has(c) ? (set.delete(c), false) : (set.add(c), true))
    };
  }
  appendChild(c) {
    c.parentNode?.removeChild(c);
    c.parentNode = this;
    this.childNodes.push(c);
    return c;
  }
  removeChild(c) {
    const i = this.childNodes.indexOf(c);
    if (i >= 0) this.childNodes.splice(i, 1);
    c.parentNode = null;
    return c;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get textContent() {
    return this.childNodes.map((c) => c.textContent).join('');
  }
  set textContent(v) {
    this.childNodes = [];
    if (String(v) !== '') this.appendChild(new FakeText(v));
  }
  setAttribute(k, v) {
    this.attrs.set(k, String(v));
  }
  getAttribute(k) {
    return this.attrs.has(k) ? this.attrs.get(k) : null;
  }
  removeAttribute(k) {
    this.attrs.delete(k);
  }
  addEventListener(t, fn) {
    (this.listeners[t] ??= []).push(fn);
  }
  fire(t, ev = {}) {
    for (const fn of this.listeners[t] ?? []) fn({ preventDefault() {}, ...ev });
  }
  focus() {}
  querySelectorAll() {
    return [];
  }
}

/** Every attribute value and text node under a node, for leak scans. */
function dump(node) {
  if (node instanceof FakeText) return node.data;
  let out = [...node.attrs.values(), node.href, node.className, JSON.stringify(node.dataset), JSON.stringify(node.style)].join('|');
  for (const c of node.childNodes) out += '|' + dump(c);
  return out;
}

// ---------------------------------------------------------------------------
// the harness: one instance is one document
// ---------------------------------------------------------------------------
function boot({ storage = new Map(), storageThrows = false, responder } = {}) {
  let now = T0;
  let timerSeq = 0;
  const timers = new Map();
  const requests = [];
  const winListeners = {};
  const storageLog = [];

  const root = new FakeEl('div');
  const panel = new FakeEl('section');
  const els = {
    '.nexus__launch': new FakeEl('button'),
    '[data-nexus-close]': new FakeEl('button'),
    '.nexus__input': new FakeEl('input'),
    '.nexus__form': new FakeEl('form'),
    '.nexus__send': new FakeEl('button'),
    '.nexus__local': new FakeEl('div'),
    '.nexus__body': new FakeEl('div'),
    '[data-nexus-new]': new FakeEl('button')
  };
  root.querySelector = (s) => els[s] ?? null;
  root.querySelectorAll = () => [];

  const document = {
    getElementById: (id) => (id === 'nexus' ? root : id === 'nexus-panel' ? panel : null),
    querySelectorAll: () => [],
    addEventListener: () => undefined,
    createElement: (t) => new FakeEl(t),
    createTextNode: (d) => new FakeText(d)
  };

  const fakeStorage = {
    getItem: (k) => {
      storageLog.push(['get', k]);
      return storage.has(k) ? storage.get(k) : null;
    },
    setItem: (k, v) => {
      storageLog.push(['set', k]);
      storage.set(k, String(v));
    },
    removeItem: (k) => {
      storageLog.push(['remove', k]);
      storage.delete(k);
    }
  };

  class FakeDate extends Date {
    constructor(...a) {
      super(...(a.length ? a : [now]));
    }
    static now() {
      return now;
    }
  }

  const sandbox = {
    document,
    Date: FakeDate,
    AbortController,
    TextDecoder,
    requestAnimationFrame: (fn) => fn(),
    setTimeout: (fn, ms = 0) => {
      const id = ++timerSeq;
      timers.set(id, { fn, due: now + Math.max(0, Number(ms) || 0), seq: id });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    fetch: (url, init = {}) => {
      const rec = { url: String(url), init, at: now, aborted: false };
      requests.push(rec);
      init.signal?.addEventListener('abort', () => (rec.aborted = true));
      return Promise.resolve().then(() => responder(rec));
    },
    addEventListener: (t, fn) => (winListeners[t] ??= []).push(fn)
  };
  Object.defineProperty(sandbox, 'sessionStorage', {
    get() {
      if (storageThrows) throw new Error('SecurityError');
      return fakeStorage;
    }
  });
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(SCRIPT, sandbox);

  const flush = async () => {
    for (let i = 0; i < 20; i += 1) await new Promise((r) => setImmediate(r));
  };
  const advance = async (ms) => {
    const target = now + ms;
    await flush();
    for (;;) {
      const due = [...timers.values()].filter((t) => t.due <= target).sort((a, b) => a.due - b.due || a.seq - b.seq)[0];
      if (!due) break;
      timers.delete(due.seq);
      now = Math.max(now, due.due);
      due.fn();
      await flush();
    }
    now = target;
    await flush();
  };

  const local = els['.nexus__local'];
  const lines = () =>
    local.childNodes
      .filter((n) => n instanceof FakeEl && n.className === 'nexus__reply')
      .map((n) => ({ label: n.childNodes[0].textContent, text: n.childNodes.slice(2).map((c) => c.textContent).join('') }));

  return {
    requests,
    storage,
    storageLog,
    lines,
    local,
    root,
    flush,
    advance,
    now: () => now,
    statusRequests: () => requests.filter((r) => r.url === '/api/nexus/status'),
    chatRequests: () => requests.filter((r) => r.url === '/api/nexus/chat'),
    handle: () => (storage.has(KEY) ? JSON.parse(storage.get(KEY)) : null),
    send: async (message) => {
      els['.nexus__input'].value = message;
      els['.nexus__form'].fire('submit');
      await flush();
    },
    newConversation: () => els['[data-nexus-new]'].fire('click'),
    windowEvent: (t, ev = {}) => (winListeners[t] ?? []).forEach((fn) => fn(ev)),
    dom: () => dump(root) + '|' + dump(local)
  };
}

// ---------------------------------------------------------------------------
// scripted network
// ---------------------------------------------------------------------------
const sse = (frames) =>
  new Response(frames.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join(''), {
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'x-nexus-conversation': 'v1.CONV.1.mac' }
  });

const issued = (cap = CAP, op = OP, exp = EXP, after = 1000) => ({ status: { cap, op, exp }, poll: { after_ms: after } });

const found = ({ state = 'pending', op = OP, version = V('a'), phase = 'availability_pending', text = 'Checking times.', poll = { after_ms: 1000 } } = {}) =>
  new Response(JSON.stringify({ v: 1, state, op, version, display: { phase, text, choices: null }, poll }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });

const NONE = () =>
  new Response('{"v":1,"state":"none","op":null,"version":null,"display":null,"poll":null}', {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });

/**
 * A responder: chat turns come from `chat` (a queue of done payloads, or a
 * function), status polls from `status` (a function of the poll index).
 */
function network({ chat = [], status = () => found() } = {}) {
  const chatQueue = [...chat];
  let polls = 0;
  return (rec) => {
    if (rec.url === '/api/nexus/chat') {
      const next = chatQueue.shift();
      if (typeof next === 'function') return next(rec);
      return sse([
        ['delta', { text: 'Okay.' }],
        ['done', next ?? {}]
      ]);
    }
    if (rec.url === '/api/nexus/status') return status(polls++, rec);
    return new Response('{}', { status: 200 });
  };
}

async function started(opts = {}) {
  const w = boot({ ...opts, responder: network(opts) });
  await w.send('Yes, please find a time with Gary.');
  return w;
}

/** Seconds between polls, the first measured from the issuing turn (T0). */
const gaps = (w) => {
  const at = [T0, ...w.statusRequests().map((r) => r.at)];
  return at.slice(1).map((t, i) => (t - at[i]) / 1000);
};

// ---------------------------------------------------------------------------
// storage
// ---------------------------------------------------------------------------
test('a done with status + poll stores exactly {cap, op, exp, lastVersion} under nexus.op and nothing else', async () => {
  const w = await started({ chat: [issued()] });
  assert.deepEqual([...w.storage.keys()], [KEY], 'one key, nothing else in the tab store');
  const h = w.handle();
  assert.deepEqual(Object.keys(h).sort(), ['cap', 'exp', 'lastVersion', 'op']);
  assert.deepEqual(h, { cap: CAP, op: OP, exp: EXP, lastVersion: null });
  const raw = w.storage.get(KEY);
  assert.doesNotMatch(raw, /Okay|Yes, please|v1\.CONV|@|zoom|http/i, 'no transcript, credential, email or link');

  await w.advance(1000);
  const h2 = w.handle();
  assert.deepEqual(Object.keys(h2).sort(), ['cap', 'exp', 'lastVersion', 'op']);
  assert.equal(h2.lastVersion, V('a'));
  assert.doesNotMatch(w.storage.get(KEY), /Checking/, 'no progress text is stored');
});

test('invalid status shapes in done are ignored: nothing stored, nothing polled', async () => {
  const bad = [
    { status: { cap: CAP, op: OP, exp: EXP } },
    { poll: { after_ms: 1000 } },
    { status: { cap: 'nope', op: OP, exp: EXP }, poll: { after_ms: 1000 } },
    { status: { cap: CAP.replace(/^st2/, 'st1'), op: OP, exp: EXP }, poll: { after_ms: 1000 } },
    { status: { cap: CAP.replace('.', '.<b>'), op: OP, exp: EXP }, poll: { after_ms: 1000 } },
    { status: { cap: CAP, op: 'x'.repeat(42), exp: EXP }, poll: { after_ms: 1000 } },
    { status: { cap: CAP, op: 'NOT-UUID', exp: EXP }, poll: { after_ms: 1000 } },
    { status: { cap: CAP, op: OP, exp: T0 - 1 }, poll: { after_ms: 1000 } },
    { status: { cap: CAP, op: OP, exp: '1' }, poll: { after_ms: 1000 } },
    { status: { cap: CAP + 'x'.repeat(40), op: OP, exp: EXP }, poll: { after_ms: 1000 } },
    { status: { cap: CAP, op: OP, exp: EXP }, poll: null }
  ];
  for (const payload of bad) {
    const w = await started({ chat: [payload] });
    await w.advance(30_000);
    assert.equal(w.storage.size, 0, JSON.stringify(payload));
    assert.equal(w.statusRequests().length, 0);
  }
});

test('blocked sessionStorage: the poller still works from memory and nothing throws', async () => {
  const w = await started({ chat: [issued()], storageThrows: true });
  await w.advance(1000);
  assert.equal(w.statusRequests().length, 1);
  assert.equal(w.lines().at(-1).text, 'Checking times.');
});

// ---------------------------------------------------------------------------
// the wire
// ---------------------------------------------------------------------------
test('a poll is POST /api/nexus/status with x-nexus-status and body {"v":1}, never the conversation header', async () => {
  const w = await started({ chat: [issued()] });
  assert.equal(w.statusRequests().length, 0, 'the first poll waits for the schedule');
  await w.advance(1000);
  const [r] = w.statusRequests();
  assert.ok(r, 'polled after 1 s');
  assert.equal(r.url, '/api/nexus/status', 'no query string, no fragment');
  assert.equal(r.init.method, 'POST');
  assert.equal(r.init.credentials, 'same-origin');
  assert.equal(r.init.cache, 'no-store');
  assert.equal(r.init.keepalive, undefined);
  assert.equal(r.init.body, '{"v":1}');
  assert.deepEqual(Object.keys(r.init.headers).sort(), ['content-type', 'x-nexus-status']);
  assert.equal(r.init.headers['x-nexus-status'], CAP);
  assert.equal(r.init.headers['content-type'], 'application/json');
});

test('the capability never reaches a URL or the DOM (text or attributes)', async () => {
  const w = await started({
    chat: [issued()],
    status: (i) => (i < 2 ? found({ version: V(String.fromCharCode(97 + i)) }) : found({ state: 'final', version: V('z'), phase: 'confirmed', text: 'Booked.', poll: null }))
  });
  await w.advance(60_000);
  for (const r of w.requests) assert.doesNotMatch(r.url, /st2|C{114}/);
  assert.doesNotMatch(w.dom(), /st2\.|C{114}/);
});

// ---------------------------------------------------------------------------
// render and dedupe
// ---------------------------------------------------------------------------
test('renders through line("NEXUS", text) as a text node, only when the version changes', async () => {
  const versions = ['a', 'a', 'a', 'b', 'b'];
  const texts = ['First.', 'First.', 'First.', 'Second <b>bold</b>', 'Second <b>bold</b>'];
  const w = await started({
    chat: [issued()],
    status: (i) => found({ version: V(versions[Math.min(i, 4)]), text: texts[Math.min(i, 4)] })
  });
  await w.advance(20_000);
  assert.ok(w.statusRequests().length >= 5);
  const shown = w.lines().filter((l) => l.label === 'NEXUS').map((l) => l.text);
  assert.deepEqual(shown, ['Okay.', 'First.', 'Second <b>bold</b>'], 'each version once, markup inert');
  assert.equal(w.handle().lastVersion, V('b'));
  const last = w.local.childNodes.at(-1);
  assert.equal(last.childNodes.length, 3, 'label, <br>, one text node');
  assert.equal(last.childNodes[2].constructor.name, 'FakeText');
});

test('the next chat turn carries seen_status_version = lastVersion from a live handle', async () => {
  const w = await started({ chat: [issued(), {}], status: () => found({ version: V('q') }) });
  const first = JSON.parse(w.chatRequests()[0].init.body);
  assert.equal('seen_status_version' in first, false, 'nothing seen yet');
  await w.advance(1000);
  await w.send('ok');
  const second = JSON.parse(w.chatRequests()[1].init.body);
  assert.equal(second.seen_status_version, V('q'));
  assert.deepEqual(Object.keys(second).sort(), ['message', 'page', 'seen_status_version', 'v']);
});

// ---------------------------------------------------------------------------
// backoff
// ---------------------------------------------------------------------------
test('backoff is 1,1,2,2,3,5,8 s then every 10 s', async () => {
  const w = await started({ chat: [issued()], status: () => found() });
  await w.advance(60_000);
  assert.deepEqual(gaps(w).slice(0, 10), [1, 1, 2, 2, 3, 5, 8, 10, 10, 10]);
});

test('once held_awaiting_gary is displayed, polling slows to 20 s', async () => {
  const w = await started({
    chat: [issued()],
    status: (i) => (i < 2 ? found({ version: V('a') }) : found({ version: V('h'), phase: 'held_awaiting_gary', text: 'Held.', poll: { after_ms: 20000 } }))
  });
  await w.advance(100_000);
  const g = gaps(w);
  assert.deepEqual(g.slice(0, 3), [1, 1, 2], 'the third poll is the first to see held');
  assert.ok(g.length >= 6 && g.slice(3).every((x) => x === 20), `every gap after held is 20 s: ${g}`);
});

test('a 429 is honoured: the next poll waits at least retry-after', async () => {
  const w = await started({
    chat: [issued()],
    status: (i) =>
      i === 0
        ? new Response('{"code":"rate_limited","message":"x"}', { status: 429, headers: { 'retry-after': '17' } })
        : found()
  });
  await w.advance(30_000);
  assert.equal(gaps(w)[1], 17);
  assert.equal(w.lines().filter((l) => l.label === 'Status').length, 0, 'a limit is not a failure');
});

// ---------------------------------------------------------------------------
// pause while a chat turn is in flight
// ---------------------------------------------------------------------------
test('no poll runs while a chat turn is in flight; an in-flight poll is aborted; polling resumes after', async () => {
  let release;
  const gate = new Promise((r) => (release = r));
  const w = boot({
    responder: network({
      chat: [
        issued(),
        async () => {
          await gate;
          return sse([['done', {}]]);
        }
      ],
      status: (i, rec) => (i === 2 ? new Promise((_, reject) => rec.init.signal.addEventListener('abort', () => reject(new Error('aborted')))) : found())
    })
  });
  await w.send('Yes');
  await w.advance(2000); // polls #0 and #1
  await w.advance(2000); // poll #2 is now hanging
  assert.equal(w.statusRequests().length, 3);
  await w.send('another question'); // turn starts
  assert.equal(w.statusRequests()[2].aborted, true, 'the in-flight poll was aborted when the turn started');
  const before = w.statusRequests().length;
  await w.advance(60_000);
  assert.equal(w.statusRequests().length, before, 'no poll while the turn is running');
  release();
  await w.flush();
  await w.advance(1000);
  assert.equal(w.statusRequests().length, before + 1, 'resumed from the schedule start after the turn');
  assert.equal(w.lines().filter((l) => l.label === 'Status').length, 0, 'the abort is not reported as a failure');
});

// ---------------------------------------------------------------------------
// termination
// ---------------------------------------------------------------------------
test('a final display renders once, then the handle is deleted and polling stops', async () => {
  const w = await started({
    chat: [issued()],
    status: (i) => (i === 0 ? found() : found({ state: 'final', version: V('f'), phase: 'confirmed', text: 'You are booked.', poll: null }))
  });
  await w.advance(2000);
  assert.equal(w.lines().at(-1).text, 'You are booked.');
  assert.equal(w.storage.has(KEY), false);
  const n = w.statusRequests().length;
  await w.advance(120_000);
  assert.equal(w.statusRequests().length, n);
});

test('state none -> fixed statusLost line, handle deleted, stop', async () => {
  const w = await started({ chat: [issued()], status: () => NONE() });
  await w.advance(1000);
  assert.equal(w.lines().at(-1).text, TEXT.statusLost);
  assert.equal(w.storage.has(KEY), false);
  await w.advance(60_000);
  assert.equal(w.statusRequests().length, 1);
});

test('poll:null on slot choices stops polling but keeps the handle', async () => {
  const w = await started({
    chat: [issued()],
    status: () => found({ state: 'update', version: V('p'), phase: 'slot_choices', text: 'A) Mon 9am B) Tue 10am. Which works?', poll: null })
  });
  await w.advance(1000);
  assert.equal(w.lines().at(-1).text, 'A) Mon 9am B) Tue 10am. Which works?');
  await w.advance(120_000);
  assert.equal(w.statusRequests().length, 1);
  assert.deepEqual(w.handle(), { cap: CAP, op: OP, exp: EXP, lastVersion: V('p') });
});

test('exp reached -> statusLost, handle deleted, no further poll', async () => {
  const exp = T0 + 15_000;
  const w = await started({ chat: [issued(capFor(OP, exp), OP, exp)], status: () => found() });
  await w.advance(60_000);
  assert.ok(w.statusRequests().every((r) => r.at < exp));
  assert.equal(w.lines().at(-1).text, TEXT.statusLost);
  assert.equal(w.storage.has(KEY), false);
});

test('10 minutes of total polling -> statusLost, handle deleted', async () => {
  const w = await started({ chat: [issued()], status: () => found() });
  await w.advance(11 * 60_000);
  const last = w.statusRequests().at(-1).at;
  assert.ok(last - w.statusRequests()[0].at <= 10 * 60_000);
  assert.equal(w.lines().at(-1).text, TEXT.statusLost);
  assert.equal(w.storage.has(KEY), false);
  await w.advance(5 * 60_000);
  assert.equal(w.statusRequests().at(-1).at, last);
});

test('3 consecutive network or 5xx failures -> the same fixed statusLost line, stop, handle deleted', async () => {
  const w = await started({
    chat: [issued()],
    status: (i) => (i === 0 ? Promise.reject(new TypeError('offline')) : i === 1 ? new Response('', { status: 503 }) : Promise.reject(new TypeError('offline')))
  });
  await w.advance(60_000);
  assert.equal(w.statusRequests().length, 3);
  assert.equal(w.lines().at(-1).text, TEXT.statusLost);
  assert.equal(w.lines().filter((l) => l.text === TEXT.statusLost).length, 1);
  assert.equal(w.storage.has(KEY), false);
});

test('a success between failures resets the failure count', async () => {
  const pattern = ['x', 'x', 'ok', 'x', 'x', 'ok', 'x', 'x', 'ok'];
  const w = await started({
    chat: [issued()],
    status: (i) => (pattern[i] === 'ok' || i >= pattern.length ? found() : Promise.reject(new TypeError('offline')))
  });
  await w.advance(90_000);
  assert.ok(!w.lines().some((l) => l.text === TEXT.statusLost));
});

test('a 400/403/413 from the route stops polling and deletes the handle', async () => {
  for (const code of [400, 403, 413]) {
    const w = await started({ chat: [issued()], status: () => new Response('{"code":"x","message":"y"}', { status: code }) });
    await w.advance(30_000);
    assert.equal(w.statusRequests().length, 1, String(code));
    assert.equal(w.storage.has(KEY), false);
  }
});

test('New conversation clears the handle synchronously and stops polling', async () => {
  let hang;
  const w = await started({
    chat: [issued()],
    status: (i, rec) => (i === 1 ? new Promise((_, reject) => { hang = rec; rec.init.signal.addEventListener('abort', () => reject(new Error('aborted'))); }) : found({ version: V('n') }))
  });
  await w.advance(2000);
  assert.ok(hang, 'a poll is in flight');
  w.newConversation();
  assert.equal(w.storage.has(KEY), false, 'removed in the click handler itself');
  assert.equal(hang.aborted, true, 'the in-flight poll is aborted');
  const n = w.statusRequests().length;
  await w.advance(120_000);
  assert.equal(w.statusRequests().length, n);
  await w.send('hello again');
  const body = JSON.parse(w.chatRequests().at(-1).init.body);
  assert.equal('seen_status_version' in body, false, 'the seen version died with the conversation');
});

test('pagehide stops timers and the in-flight poll but keeps the handle for recovery', async () => {
  const w = await started({ chat: [issued()], status: () => found({ version: V('k') }) });
  await w.advance(1000);
  w.windowEvent('pagehide', { persisted: false });
  const n = w.statusRequests().length;
  await w.advance(120_000);
  assert.equal(w.statusRequests().length, n);
  assert.deepEqual(w.handle(), { cap: CAP, op: OP, exp: EXP, lastVersion: V('k') });
});

test('supersession: a new op replaces the handle and the old loop never sends the old capability again', async () => {
  const CAP2 = capFor(OP2, EXP, 'B');
  const w = await started({ chat: [issued(), issued(CAP2, OP2)], status: (_i, rec) => found({ op: rec.init.headers['x-nexus-status'] === CAP2 ? OP2 : OP, version: V('s') }) });
  await w.advance(1000);
  assert.equal(w.handle().lastVersion, V('s'));
  await w.send('actually, a different day');
  assert.deepEqual(w.handle(), { cap: CAP2, op: OP2, exp: EXP, lastVersion: null });
  const mark = w.statusRequests().length;
  await w.advance(30_000);
  const after = w.statusRequests().slice(mark);
  assert.ok(after.length > 0);
  assert.ok(after.every((r) => r.init.headers['x-nexus-status'] === CAP2));
});

test('same op re-issued: cap replaced, lastVersion kept', async () => {
  const CAPB = capFor(OP, EXP, 'C');
  const w = await started({ chat: [issued(), issued(CAPB)], status: () => found({ version: V('m') }) });
  await w.advance(1000);
  await w.send('B please');
  assert.deepEqual(w.handle(), { cap: CAPB, op: OP, exp: EXP, lastVersion: V('m') });
});

// ---------------------------------------------------------------------------
// refresh recovery
// ---------------------------------------------------------------------------
const seeded = (h) => new Map([[KEY, JSON.stringify(h)]]);

test('recovery: a stored handle polls immediately in recovered mode and renders even an already-seen version', async () => {
  const storage = seeded({ cap: CAP, op: OP, exp: EXP, lastVersion: V('r') });
  const w = boot({ storage, responder: network({ status: () => found({ version: V('r'), phase: 'held_awaiting_gary', text: 'Held for Gary.', poll: { after_ms: 20000 } }) }) });
  await w.advance(0);
  const [r] = w.statusRequests();
  assert.ok(r, 'polled at once');
  assert.equal(r.at, T0);
  assert.equal(r.init.body, '{"v":1,"m":"r"}');
  assert.equal(r.init.headers['x-nexus-status'], CAP);
  assert.equal(w.lines().at(-1).text, 'Held for Gary.');
  await w.advance(25_000);
  assert.equal(w.lines().filter((l) => l.text === 'Held for Gary.').length, 1, 'still deduped after the first render');
  assert.ok(w.statusRequests().slice(1).every((x) => x.init.body === '{"v":1,"m":"r"}'));
});

test('recovery: a recovered handle never supplies seen_status_version, and no chat credential is restored', async () => {
  const storage = seeded({ cap: CAP, op: OP, exp: EXP, lastVersion: null });
  const w = boot({ storage, responder: network({ chat: [{}], status: () => found({ version: V('w') }) }) });
  await w.advance(0);
  await w.send('hi');
  const chat = w.chatRequests()[0];
  assert.equal('seen_status_version' in JSON.parse(chat.init.body), false);
  assert.equal(chat.init.headers['x-nexus-conversation'], undefined, 'a fresh document has no chat credential');
});

test('recovery: a recovered pick arrives final with the server’s fixed line; it is shown once and the handle deleted (Q3)', async () => {
  const storage = seeded({ cap: CAP, op: OP, exp: EXP, lastVersion: V('c') });
  const fixed = 'Open times were offered in your earlier chat, which this page can no longer continue. Please check your email for updates from Gary.';
  const w = boot({ storage, responder: network({ status: () => found({ state: 'final', version: V('c'), phase: 'slot_choices', text: fixed, poll: null }) }) });
  await w.advance(60_000);
  assert.deepEqual(w.lines().map((l) => l.text), [fixed], 'rendered once even though the version was seen before the reload');
  assert.equal(w.statusRequests().length, 1);
  assert.equal(w.storage.has(KEY), false);
});

test('recovery: a non-final recovered pick (never sent by the core) still re-offers no times', async () => {
  const storage = seeded({ cap: CAP, op: OP, exp: EXP, lastVersion: null });
  const w = boot({ storage, responder: network({ status: () => found({ state: 'update', version: V('c'), phase: 'slot_choices', text: 'A) Mon 9am B) Tue 10am', poll: null }) }) });
  await w.advance(0);
  assert.ok(!w.lines().some((l) => /Mon 9am/.test(l.text)), 'no selectable times after a reload');
  assert.equal(w.lines().at(-1).text, TEXT.statusLost);
  assert.equal(w.storage.has(KEY), false);
});

test('copy: statusLost is exactly the Rev 2 §6 line and makes no booking claim', () => {
  assert.equal(TEXT.statusLost, "I can't show progress for that request here any more. Please check your email for updates from Gary.");
  assert.equal('statusFailed' in TEXT, false, 'network and 5xx use the same line (§6 Copy)');
});

test('recovery: expired, malformed or extra-key handles are removed and never polled', async () => {
  const bad = [
    { cap: CAP, op: OP, exp: T0, lastVersion: null },
    { cap: CAP, op: OP, exp: EXP, lastVersion: null, text: 'Checking' },
    { cap: CAP, op: OP, exp: EXP },
    { cap: 'x', op: OP, exp: EXP, lastVersion: null },
    { cap: CAP, op: OP, exp: EXP, lastVersion: 'short' },
    'not json{'
  ];
  for (const h of bad) {
    const storage = new Map([[KEY, typeof h === 'string' ? h : JSON.stringify(h)]]);
    const w = boot({ storage, responder: network() });
    await w.advance(30_000);
    assert.equal(w.statusRequests().length, 0, JSON.stringify(h));
    assert.equal(storage.has(KEY), false);
  }
});

test('with no stored handle, a fresh document touches only the nexus.op key and makes no request', async () => {
  const w = boot({ responder: network() });
  await w.advance(30_000);
  assert.equal(w.requests.length, 0);
  assert.ok(w.storageLog.every(([, k]) => k === KEY), JSON.stringify(w.storageLog));
});

// ---------------------------------------------------------------------------
// done.data.status.version (L7 follow-up): the version of the view the chat reply
// itself displayed seeds lastVersion, so the first poll does not repeat it.
// ---------------------------------------------------------------------------
const nexusLines = (w) => w.lines().filter((l) => l.label === 'NEXUS').map((l) => l.text);
const issuedWithVersion = (version) => ({ status: { cap: CAP, op: OP, exp: EXP, version }, poll: { after_ms: 20000 } });
const heldPoll = (version) => () => found({ version, phase: 'held_awaiting_gary', text: 'Held for Gary.', poll: { after_ms: 20000 } });

test('a held reply followed by a held poll with the same version renders nothing new', async () => {
  const w = await started({ chat: [issuedWithVersion(V('h'))], status: heldPoll(V('h')) });
  assert.deepEqual(w.handle(), { cap: CAP, op: OP, exp: EXP, lastVersion: V('h') }, 'seeded from done, still exactly 4 keys');
  await w.advance(90_000);
  assert.ok(w.statusRequests().length >= 3, 'polling continues');
  assert.deepEqual(nexusLines(w), ['Okay.'], 'only the chat reply; the poll repeats nothing');
});

test('a changed version after a seeded reply renders', async () => {
  const w = await started({ chat: [issuedWithVersion(V('h'))], status: heldPoll(V('g')) });
  await w.advance(20_000);
  assert.deepEqual(nexusLines(w), ['Okay.', 'Held for Gary.']);
  assert.equal(w.handle().lastVersion, V('g'));
});

test('a missing or invalid done version keeps the old behaviour (lastVersion null, first poll renders)', async () => {
  for (const version of [undefined, null, 'short', V('h') + 'x', 'h'.repeat(42) + '!', 43]) {
    const w = await started({ chat: [issuedWithVersion(version)], status: heldPoll(V('h')) });
    assert.equal(w.storage.has(KEY), true, `still accepted: ${String(version)}`);
    assert.equal(w.handle().lastVersion, null);
    await w.advance(20_000);
    assert.equal(w.lines().at(-1).text, 'Held for Gary.', `renders: ${String(version)}`);
  }
});

test('a same-op re-issue with a version updates lastVersion to what that reply showed', async () => {
  const w = await started({
    chat: [issuedWithVersion(V('a')), issuedWithVersion(V('b'))],
    status: (i) => found({ version: i === 0 ? V('a') : V('b'), phase: 'held_awaiting_gary', text: 'T' + i, poll: { after_ms: 20000 } })
  });
  await w.advance(20_000);
  assert.deepEqual(nexusLines(w), ['Okay.'], 'first poll matches the seeded version');
  await w.send('any news?');
  assert.equal(w.handle().lastVersion, V('b'));
  await w.advance(20_000);
  assert.ok(!w.lines().some((l) => l.text === 'T1'), 'the version the second reply showed is not repeated');
});

// ---------------------------------------------------------------------------
// R1 code-review Low fixes (L10c)
// ---------------------------------------------------------------------------
test('R1-1: a live done version also feeds seen_status_version on the next chat request', async () => {
  const w = await started({ chat: [issuedWithVersion(V('s')), {}], status: heldPoll(V('s')) });
  await w.send('any news?');
  const body = JSON.parse(w.chatRequests()[1].init.body);
  assert.equal(body.seen_status_version, V('s'), 'seen_status_version = lastVersion');
  assert.equal(w.handle().lastVersion, V('s'));
});

test('R1-1: an invalid done version does not feed seen_status_version', async () => {
  const w = await started({ chat: [issuedWithVersion('short'), {}], status: () => new Promise(() => {}) });
  await w.send('any news?');
  assert.equal('seen_status_version' in JSON.parse(w.chatRequests()[1].init.body), false);
});

test('R1-1: a recovered handle still never feeds seen_status_version, even after it renders', async () => {
  const storage = seeded({ cap: CAP, op: OP, exp: EXP, lastVersion: V('r') });
  const w = boot({ storage, responder: network({ chat: [{}], status: heldPoll(V('q')) }) });
  await w.advance(0);
  await w.send('hi');
  assert.equal('seen_status_version' in JSON.parse(w.chatRequests()[0].init.body), false);
});

test('R1-2: done with poll.after_ms above 60000 fails closed: nothing stored, nothing polled', async () => {
  for (const after of [60_001, 2 ** 31, Number.MAX_SAFE_INTEGER]) {
    const w = await started({ chat: [issued(CAP, OP, EXP, after)] });
    await w.advance(120_000);
    assert.equal(w.storage.size, 0, String(after));
    assert.equal(w.statusRequests().length, 0, String(after));
  }
  const edge = await started({ chat: [issued(CAP, OP, EXP, 60_000)] });
  await edge.advance(60_000);
  assert.equal(edge.statusRequests().length, 1, 'exactly 60000 is accepted, and waits 60 s');
  assert.equal(edge.statusRequests()[0].at - T0, 60_000);
});

test('R1-2: a status reply with poll.after_ms above 60000 is rejected, never fires early, and stops after 3', async () => {
  const w = await started({ chat: [issued()], status: () => found({ poll: { after_ms: 2 ** 31 } }) });
  await w.advance(120_000);
  assert.equal(w.statusRequests().length, 3, 'three rejected replies, then stop');
  assert.deepEqual(gaps(w), [1, 1, 2], 'on the ordinary schedule; no zero-delay loop');
  assert.ok(!w.lines().some((l) => l.text === 'Checking times.'), 'the rejected reply is never rendered');
  assert.equal(w.lines().at(-1).text, TEXT.statusLost);
  assert.equal(w.storage.has(KEY), false);
});

test('R1-3: every issuance, including same-op, restarts the 10-minute budget', async () => {
  const CAPB = capFor(OP, EXP, 'D');
  const w = await started({ chat: [issued(), issued(CAPB)], status: () => found() });
  await w.advance(8 * 60_000);
  await w.send('still there?'); // same-op re-issue at T0+8 min
  await w.advance(8 * 60_000); // 16 min after the first poll, 8 after the re-issue
  assert.ok(!w.lines().some((l) => l.text === TEXT.statusLost), 'the budget restarted at the re-issue');
  assert.ok(w.statusRequests().at(-1).at > T0 + 15 * 60_000, 'still polling');
  await w.advance(4 * 60_000);
  assert.equal(w.lines().at(-1).text, TEXT.statusLost, 'and still ends 10 minutes after the last issuance');
});

test('hardening: stored handles with CR/LF in cap, a non-string-number exp, or a __proto__ key fail closed and are deleted', async () => {
  const raws = [
    JSON.stringify({ cap: CAP + '\r\nx-evil: 1', op: OP, exp: EXP, lastVersion: null }),
    JSON.stringify({ cap: CAP.replace('.', '.\n'), op: OP, exp: EXP, lastVersion: null }),
    JSON.stringify({ cap: CAP, op: OP, exp: String(EXP), lastVersion: null }),
    JSON.stringify({ cap: CAP, op: OP, exp: EXP + 0.5, lastVersion: null }),
    `{"cap":${JSON.stringify(CAP)},"op":${JSON.stringify(OP)},"exp":${EXP},"lastVersion":null,"__proto__":{"x":1}}`,
    `{"__proto__":{"cap":1},"op":${JSON.stringify(OP)},"exp":${EXP},"lastVersion":null}`
  ];
  for (const raw of raws) {
    const storage = new Map([[KEY, raw]]);
    const w = boot({ storage, responder: network() });
    await w.advance(30_000);
    assert.equal(w.statusRequests().length, 0, raw);
    assert.equal(storage.has(KEY), false, raw);
  }
});

test('hardening: New conversation while a poll response is in flight - the stale response never renders', async () => {
  let deliver;
  const w = await started({
    chat: [issued()],
    // Ignores abort on purpose: the response still arrives after the click.
    status: () => new Promise((resolve) => (deliver = () => resolve(found({ version: V('z'), text: 'STALE' }))))
  });
  await w.advance(1000);
  assert.ok(deliver, 'a poll is in flight');
  w.newConversation();
  deliver();
  await w.advance(60_000);
  assert.ok(!w.lines().some((l) => l.text === 'STALE'));
  assert.equal(w.storage.has(KEY), false);
  assert.equal(w.statusRequests().length, 1);
});

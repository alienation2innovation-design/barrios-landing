// Content-Security-Policy (finding 10 / M5).
//
// Before this, the repository had no Content-Security-Policy at all, while the
// NEXUS conversation credential lived - and still lives, because the widget has
// to read it - in sessionStorage. The policy is the compensating control that
// keeps a third-party script off the page in the first place.
//
// These tests assert the policy as next.config.js actually declares it: they
// require the config and call headers(), rather than matching strings against
// the file, so the assertions cannot pass against a policy that is written down
// but never shipped. They are a necessary check, not a sufficient one - a header
// can be well-formed and still break the page, so a real browser load is the
// other half of the evidence and is recorded in lweb-report.md.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { PUBLIC_ROOT, headersForPath, parsePolicy, policyForPath } from './support/next-headers.mjs';
import { useStaticSite } from './support/site.mjs';

const site = useStaticSite();

const HOMEPAGE_PATHS = ['/', '/index.html'];
const LEGACY_PATHS = [
  '/nexus-personal', '/nexus-personal.html',
  '/creative-director', '/creative-director.html',
  '/founder', '/founder.html',
  '/command-center', '/command-center.html'
];

function sources(directives, name) {
  return directives.get(name) ?? null;
}

test('the homepage is served a Content-Security-Policy under every path it answers on', async () => {
  for (const pathname of HOMEPAGE_PATHS) {
    const { raw } = await policyForPath(pathname);
    assert.ok(raw, `${pathname} must carry a Content-Security-Policy`);
  }
  // Keyed only on '/', the policy would miss the page requested as /index.html.
  const [root, indexed] = await Promise.all(HOMEPAGE_PATHS.map((p) => policyForPath(p)));
  assert.equal(root.raw, indexed.raw, 'both spellings must get the same policy');
});

test('the homepage policy is restrictive: no wildcards, and the dangerous sinks are shut', async () => {
  const { raw, directives } = await policyForPath('/');

  assert.deepEqual(sources(directives, 'default-src'), ["'self'"], 'default-src is just this origin');
  assert.deepEqual(sources(directives, 'base-uri'), ["'self'"], 'no injected <base> may re-point relative URLs');
  assert.deepEqual(sources(directives, 'object-src'), ["'none'"]);
  assert.deepEqual(sources(directives, 'frame-ancestors'), ["'none'"], 'nothing may frame the homepage');
  assert.deepEqual(sources(directives, 'frame-src'), ["'none'"]);
  assert.deepEqual(sources(directives, 'form-action'), ["'self'"]);

  // The heart of it for M5: the sessionStorage token cannot be posted off-origin
  // by any script that does run, because the NEXUS proxy is same-origin.
  assert.deepEqual(sources(directives, 'connect-src'), ["'self'"], 'the chat proxy is same-origin; nothing else is reachable');

  // No wildcard anywhere, in any directive. A single `*` or `https:` would undo
  // the whole policy quietly.
  for (const [directive, values] of directives) {
    for (const value of values) {
      assert.ok(
        value !== '*' && !value.startsWith('*.') && value !== 'https:' && value !== 'http:' && value !== 'data:*',
        `${directive} must not contain the wildcard source ${value}`
      );
    }
  }

  // Nothing may be executed as a string, and no plugin may run.
  assert.doesNotMatch(raw, /'unsafe-eval'/, "'unsafe-eval' must never appear");
  assert.doesNotMatch(raw, /'strict-dynamic'/, "'strict-dynamic' would defeat the 'self' script allowlist here");
  assert.match(raw, /upgrade-insecure-requests/);
});

test('the homepage relaxations are exactly the two inline ones the static page forces, and are named', async () => {
  const { directives } = await policyForPath('/');

  // These are relaxations, not oversights. public/index.html is a static file:
  // a nonce cannot be injected into bytes that are never rendered per request,
  // and a hash list over a constantly hand-edited page fails closed in
  // production rather than in CI. Both are documented in next.config.js.
  assert.deepEqual(sources(directives, 'script-src'), ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(sources(directives, 'style-src'), ["'self'", "'unsafe-inline'"]);

  // 'unsafe-inline' is the price of the inline blocks; it must not also become a
  // licence to load code from somewhere else. No off-origin script source.
  for (const directive of ['script-src', 'style-src']) {
    for (const value of sources(directives, directive)) {
      assert.doesNotMatch(value, /^https?:\/\//, `${directive} must allow no external origin`);
    }
  }

  // And the page really does still contain the inline blocks the relaxation is
  // justified by - if they ever go away, the justification goes with them.
  const html = await readFile(new URL('index.html', `file:///${PUBLIC_ROOT.replace(/\\/g, '/')}`), 'utf8');
  const inlineScripts = (html.match(/<script(?![^>]*\ssrc=)[^>]*>/gi) ?? []).length;
  const inlineStyles = (html.match(/<style\b[^>]*>/gi) ?? []).length;
  assert.ok(inlineScripts > 0, `the page has ${inlineScripts} inline <script> blocks`);
  assert.ok(inlineStyles > 0, `the page has ${inlineStyles} inline <style> blocks`);
});

test('the homepage policy permits every resource the homepage actually loads', async () => {
  // Compatibility, computed rather than assumed: everything the served document
  // references must be reachable under the policy. This is what stops a tidy but
  // page-breaking policy from shipping.
  await site.ready();
  const html = await (await fetch(site.url)).text();
  const { directives } = await policyForPath('/');

  const external = [...html.matchAll(/<(script|link|img)\b[^>]*\b(?:src|href)="(https?:\/\/[^"]+)"/gi)]
    .filter(([tag, , url]) => {
      // rel=preconnect and rel=dns-prefetch are hints, not fetches; CSP does not
      // govern them, which is why the page's Google Fonts lines need nothing.
      if (!/^<link/i.test(tag)) return true;
      return !/\brel="(?:preconnect|dns-prefetch)"/i.test(tag);
    })
    .map(([, , url]) => url);
  assert.deepEqual(external, [], 'the homepage must load nothing off-origin under default-src \'self\'');

  // The grain texture is a data: URI in inline CSS, so img-src must allow data:.
  assert.match(html, /url\("data:image\/svg\+xml/, 'the hero grain is a data: URI');
  assert.ok(sources(directives, 'img-src').includes('data:'), 'img-src must permit the data: texture');

  // Every same-origin asset the document pulls in really resolves.
  const localAssets = [...html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)="(\/[^"]+\.(?:css|js))"/gi)].map((m) => m[1]);
  assert.ok(localAssets.length >= 4, 'the page loads its local stylesheets and script');
  for (const asset of new Set(localAssets)) {
    assert.equal((await fetch(new URL(asset, site.url))).status, 200, `${asset} must be served from this origin`);
  }
});

test('the NEXUS route keeps its CORS carve-out, and gains no CORS header from this change', async () => {
  const nexus = await headersForPath('/api/nexus/chat');
  for (const key of Object.keys(nexus)) {
    assert.doesNotMatch(key, /^access-control-/, `the NEXUS route must never carry ${key}`);
  }

  // The pre-existing carve-out for every other API route is untouched.
  const other = await headersForPath('/api/contact');
  assert.equal(other['access-control-allow-origin'], '*');
  assert.equal(other['access-control-allow-credentials'], 'true');
});

test('the static pages behind the rewrites are covered too, with enumerated origins and no wildcard', async () => {
  for (const pathname of LEGACY_PATHS) {
    const { raw, directives } = await policyForPath(pathname);
    assert.ok(raw, `${pathname} must carry a Content-Security-Policy`);

    // The protections that cost these pages nothing are identical to the homepage's.
    assert.deepEqual(sources(directives, 'default-src'), ["'self'"]);
    assert.deepEqual(sources(directives, 'base-uri'), ["'self'"]);
    assert.deepEqual(sources(directives, 'object-src'), ["'none'"]);
    assert.deepEqual(sources(directives, 'frame-ancestors'), ["'none'"]);

    // form-action is 'self' plus the one endpoint /nexus-personal's lead form
    // posts to. It is still an allowlist, not an opening.
    const formAction = sources(directives, 'form-action');
    assert.ok(formAction.includes("'self'"), `${pathname} must keep form-action 'self'`);
    for (const value of formAction) {
      assert.ok(value === "'self'" || /^https:\/\/[a-z0-9.-]+$/.test(value),
        `form-action on ${pathname} may only add explicit https origins, not ${value}`);
    }

    for (const [directive, values] of directives) {
      for (const value of values) {
        assert.ok(value !== '*' && !value.startsWith('*.') && value !== 'https:',
          `${directive} on ${pathname} must not contain the wildcard source ${value}`);
        if (value.startsWith('http://')) assert.fail(`${directive} on ${pathname} allows plaintext ${value}`);
      }
    }
    assert.doesNotMatch(raw, /'unsafe-eval'/);
  }
});

test('every origin those pages reach is allowed, and nothing they never reach is', async () => {
  const { directives } = await policyForPath('/founder');
  const allowed = new Set([
    ...sources(directives, 'script-src'),
    ...sources(directives, 'style-src'),
    ...sources(directives, 'font-src'),
    ...sources(directives, 'connect-src'),
    ...sources(directives, 'form-action'),
    ...sources(directives, 'img-src')
  ].filter((value) => value.startsWith('https://')));

  const file = (name) => new URL(name, `file:///${PUBLIC_ROOT.replace(/\\/g, '/')}`);

  // Reading the markup alone was not enough the first time: these pages load
  // local scripts that reach further at runtime, and Chrome refused three such
  // loads under an earlier, tighter policy. The scan therefore follows each
  // page's local <script src> into public/js, and keeps two sets.
  //
  // `loaded` is what can be determined without guessing - resource tags and
  // explicit fetch/import/EventSource/WebSocket/form-action calls on a literal
  // URL. Every one of those must be allowed, or the page breaks.
  //
  // `mentioned` is every https origin appearing anywhere in that code. It is
  // deliberately broad, and is used only in the other direction: an allowed
  // origin that is not even mentioned is dead permission and must come out.
  const loaded = new Set();
  const mentioned = new Set();
  const addLoad = (text) => {
    for (const [, origin] of text.matchAll(
      /(?:fetch|import|importScripts|new EventSource|new WebSocket|action\s*=\s*)[\s(]*[`'"](https:\/\/[a-z0-9.-]+)/gi
    )) loaded.add(origin.toLowerCase());
  };
  const addMentions = (text) => {
    for (const [origin] of text.matchAll(/https:\/\/[a-z0-9.-]+/gi)) mentioned.add(origin.toLowerCase());
  };

  for (const page of ['nexus-personal', 'creative-director', 'founder', 'command-center']) {
    const html = await readFile(file(`${page}.html`), 'utf8');
    for (const [tag, , url] of html.matchAll(/<(script|link)\b[^>]*\b(?:src|href)="(https:\/\/[^"]+)"/gi)) {
      // rel=preconnect and rel=dns-prefetch are hints, not fetches.
      if (/^<link/i.test(tag) && /\brel="(?:preconnect|dns-prefetch)"/i.test(tag)) continue;
      loaded.add(new URL(url).origin.toLowerCase());
    }
    addLoad(html);
    addMentions(html);

    for (const [, relative] of html.matchAll(/<script\b[^>]*\bsrc="\/?(js\/[^"]+)"/gi)) {
      const source = await readFile(file(relative), 'utf8').catch(() => null);
      if (source === null) continue;
      addLoad(source);
      addMentions(source);
    }
  }
  assert.ok(loaded.size >= 5, 'the scan must find the CDNs and API hosts these pages load');

  for (const origin of loaded) {
    assert.ok(allowed.has(origin), `${origin} is loaded by a rewrite page but not allowed by its policy`);
  }

  // No dead permission. Every allowed https origin is either mentioned by that
  // code, or reached at runtime by third-party code the page loads: Iconify
  // fetches icon data over XHR from its API hosts, and the Google Fonts
  // stylesheet fetches the font files themselves from fonts.gstatic.com, which
  // is why that origin appears in the markup only as a preconnect hint.
  const reachedByThirdPartyCode = new Set([
    'https://api.iconify.design',
    'https://api.simplesvg.com',
    'https://api.unisvg.com',
    'https://fonts.gstatic.com'
  ]);
  for (const origin of allowed) {
    if (reachedByThirdPartyCode.has(origin)) continue;
    assert.ok(mentioned.has(origin), `${origin} is allowed but no rewrite page mentions it`);
  }
});

test('the hermetic server replays the shipped policy, so a browser check is a check of production', async () => {
  await site.ready();
  if (site.external) return; // an external server sends its own headers

  const response = await fetch(site.url);
  const served = response.headers.get('content-security-policy');
  const { raw } = await policyForPath('/');
  assert.equal(served, raw, 'the local server must send exactly the configured policy');

  // Parsing what was served, not what was configured, closes the loop.
  const directives = parsePolicy(served);
  assert.deepEqual(sources(directives, 'connect-src'), ["'self'"]);
  assert.deepEqual(sources(directives, 'frame-ancestors'), ["'none'"]);
});

test('the conversation credential is put nowhere but sessionStorage', async () => {
  // CSP is defence in depth for M5, not the fix: server-side revocation and
  // session binding are what make a stolen token useless, and those live in the
  // NEXUS core. What the page can do is not widen the exposure.
  await site.ready();
  const html = await (await fetch(site.url)).text();
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');

  assert.match(script, /sessionStorage/, 'the token has to be readable by the widget, and is per-tab');
  assert.doesNotMatch(
    script,
    /localStorage|document\.cookie|window\.name|BroadcastChannel|SharedWorker|indexedDB/,
    'the token must be in exactly one place'
  );
  assert.doesNotMatch(script, /location\.search|location\.hash|history\.(?:replace|push)State/, 'never in a URL');
  assert.doesNotMatch(script, /console\.(?:log|warn|error|info)/, 'never in the console');
  assert.doesNotMatch(script, /(?:textContent|innerHTML|setAttribute)\s*[=(]\s*(?:conv|token)\b/, 'never in the DOM');
});

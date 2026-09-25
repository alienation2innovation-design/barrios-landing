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
import { readFile, readdir } from 'node:fs/promises';
import { get } from 'node:http';
import { test } from 'node:test';

import {
  PUBLIC_ROOT,
  headersForPath,
  matchingHeaderRules,
  parsePolicy,
  policyForPath
} from './support/next-headers.mjs';
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

test("the conversation credential is put nowhere but this document's closure memory (item 1)", async () => {
  // CSP is defence in depth for M5, not the fix: server-side revocation and
  // session binding are what make a stolen token useless, and those live in the
  // NEXUS core. What the page can do is not widen the exposure.
  await site.ready();
  const html = await (await fetch(site.url)).text();
  const script = html.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  assert.ok(script, 'the NEXUS widget script must exist');

  // UPDATED DELIBERATELY (item 1). This used to require `sessionStorage` on the
  // reasoning that the widget "has to read it" from somewhere persistent. It does
  // not: it reads it from its own closure. sessionStorage is scoped to the origin
  // and the tab, not to a page, so it survived a same-tab navigation and left a
  // live credential readable by every script on whatever page the visitor landed
  // on next. Nothing is stored now, so there is no key for any of them to read.
  assert.doesNotMatch(script, /sessionStorage/, 'the credential is not in per-tab web storage either');
  assert.doesNotMatch(
    script,
    /localStorage|document\.cookie|window\.name|BroadcastChannel|SharedWorker|indexedDB/,
    "the credential must be in exactly one place: this document's closure"
  );
  assert.doesNotMatch(script, /location\.search|location\.hash|history\.(?:replace|push)State/, 'never in a URL');
  assert.doesNotMatch(script, /console\.(?:log|warn|error|info)/, 'never in the console');
  assert.doesNotMatch(script, /(?:textContent|innerHTML|setAttribute)\s*[=(]\s*(?:conv|token)\b/, 'never in the DOM');
});

// ---------------------------------------------------------------------------
// I1: the policy must cover EVERY page on this origin, and each page must be
// sent exactly ONE Content-Security-Policy header.
//
// The token lives in sessionStorage, which is scoped to the origin and the tab,
// not to a page. /privacy-directive.html is linked from inside the assistant
// panel and sessionStorage survives a same-tab navigation, so an injection on
// any page of this origin can read a live conversation credential. An
// enumerated list of ten paths therefore was not coverage.
//
// Two headers are as dangerous as none: a browser enforces two
// Content-Security-Policy headers as their INTERSECTION, so a second rule that
// merely looks weaker can silently kill a page. The rules are therefore written
// with mutually exclusive sources - proven below, path by path - rather than
// relying on which of two matching rules Next.js or Vercel happens to apply
// last. Order in headers() is then irrelevant to correctness, which is the
// point.

const CSP_KEY = 'content-security-policy';

async function cspRulesFor(pathname) {
  const rules = await matchingHeaderRules(pathname);
  return rules.filter((rule) => rule.headers.some((header) => header.key.toLowerCase() === CSP_KEY));
}

/** The one rule that supplies the policy for `pathname`, asserted to be one. */
async function soleCspRule(pathname) {
  const rules = await cspRulesFor(pathname);
  assert.equal(
    rules.length,
    1,
    `${pathname} must be matched by exactly one Content-Security-Policy rule, not ${rules.length}`
      + ` (${rules.map((rule) => rule.source).join(' + ')})`
  );
  return rules[0];
}

// Which tier a rule belongs to, read off its own source rather than copied from
// next.config.js: a literal path is one of the enumerated per-page tiers,
// `/:page(...)` is the static-HTML tier and `/:path(...)` the catch-all baseline.
function tierOf(source) {
  if (source.startsWith('/:page(')) return 'static-html';
  if (source.startsWith('/:path(')) return 'baseline';
  return source;
}

// One representative of every kind of path this origin answers on.
const COVERAGE = [
  ['/', '/'],
  ['/index.html', '/index.html'],
  ['/founder', '/founder'],
  ['/founder.html', '/founder.html'],
  ['/nexus-personal', '/nexus-personal'],
  ['/privacy-directive.html', 'static-html'],
  ['/contact.html', 'static-html'],
  ['/intake.html', 'static-html'],
  ['/login.html', 'static-html'],
  ['/thanks.html', 'static-html'],
  ['/terms-of-service.html', 'static-html'],
  ['/nexus-personal-backup.html', 'static-html'],
  ['/checkout.html', '/checkout.html'],
  ['/dashboard', 'baseline'],
  ['/dashboard/billing', 'baseline'],
  ['/sign-in', 'baseline'],
  ['/mulligan/abc123', 'baseline'],
  ['/api/contact', 'baseline'],
  ['/api/nexus/chat', 'baseline'],
  ['/_next/static/chunks/main-0000.js', 'baseline'],
  ['/a/path/that/does/not/exist', 'baseline']
];

test('every kind of path on this origin carries a Content-Security-Policy, and exactly one rule supplies it (I1)', async () => {
  for (const [pathname, expectedTier] of COVERAGE) {
    const rule = await soleCspRule(pathname);
    assert.equal(tierOf(rule.source), expectedTier, `${pathname} must be policed by ${expectedTier}`);

    const { raw } = await policyForPath(pathname);
    assert.ok(raw, `${pathname} must carry a Content-Security-Policy`);
    // A page must never receive two policies to intersect.
    assert.doesNotMatch(raw, /,/, `${pathname} must receive a single policy, not two joined by a comma`);
  }
});

test('no path anywhere is left uncovered: the baseline is a genuine catch-all (I1)', async () => {
  // Deliberately adversarial spellings, including ones no page exists for. An
  // uncovered 404 still matters: it is a page on this origin, and a page on this
  // origin can read the token.
  const strays = [
    '/x', '/X.HTML', '/founderX', '/founder.html.bak', '/deep/nested/unknown',
    '/index.htm', '/api', '/api/nexus', '/.well-known/security.txt',
    '/dist/output.css', '/js/lead-capture.js', '/video/ragnarok-brain.mp4', '/favicon.ico',
    // Slashed spellings. Next compiles every header source with an optional
    // trailing slash, so '/founder/' matches the rule written '/founder'. If the
    // catch-all's exclusions are anchored with a bare `$` they do not, and the
    // page gets TWO policies to intersect. '//' is the same trap against '/'.
    '/founder/', '/index.html/', '/privacy-directive.html/', '/checkout.html/',
    '/dashboard/', '/nexus-personal/', '//'
  ];
  for (const pathname of strays) {
    const rule = await soleCspRule(pathname);
    assert.ok(rule.source, `${pathname} must be matched by a rule`);
  }
});

test('Next.js own compiled regexes agree: one CSP rule per path in the built manifest (M7)', async (t) => {
  // Not a re-implementation of the matcher this time. This reads the regexes Next
  // actually compiled into .next/routes-manifest.json - the same strings Vercel's
  // routing layer applies - and checks the one-rule property against them. It is
  // the answer to the circularity the review named: the two sides cannot drift
  // together, because one of them is Next's own output.
  let manifest;
  try {
    manifest = JSON.parse(await readFile(new URL('../.next/routes-manifest.json', import.meta.url), 'utf8'));
  } catch {
    t.skip('no build output present; run `next build` for this check');
    return;
  }

  const rules = (manifest.headers ?? []).filter((rule) =>
    rule.headers.some((header) => header.key.toLowerCase() === CSP_KEY)
  );
  assert.ok(rules.length >= 13, `the manifest must carry the CSP rules, found ${rules.length}`);

  const paths = [
    ...COVERAGE.map(([pathname]) => pathname),
    '/founder/', '/index.html/', '/privacy-directive.html/', '/checkout.html/',
    '/dashboard/', '/nexus-personal/', '//', '/x', '/deep/nested/unknown'
  ];
  for (const pathname of paths) {
    const hits = rules.filter((rule) => new RegExp(rule.regex).test(pathname));
    assert.equal(
      hits.length,
      1,
      `${pathname} must match exactly one CSP rule in Next's own manifest, not ${hits.length}`
        + ` (${hits.map((rule) => rule.source).join(' + ')})`
    );
  }
});

test('the four paths the review named get the directives they are supposed to get (I1)', async () => {
  // '/' - the homepage's own tightest policy, unchanged.
  const home = await policyForPath('/');
  assert.deepEqual(sources(home.directives, 'script-src'), ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(sources(home.directives, 'connect-src'), ["'self'"]);

  // '/privacy-directive.html' - the page the panel links to, in the same tab,
  // with the live token still in sessionStorage. This is the finding.
  const privacy = await policyForPath('/privacy-directive.html');
  assert.deepEqual(sources(privacy.directives, 'default-src'), ["'self'"]);
  assert.deepEqual(sources(privacy.directives, 'base-uri'), ["'self'"]);
  assert.deepEqual(sources(privacy.directives, 'object-src'), ["'none'"]);
  assert.deepEqual(sources(privacy.directives, 'frame-ancestors'), ["'none'"]);
  // The two directives that bear on the credential: no script may be LOADED
  // from an origin that is not on this list, and no fetch/XHR/beacon may leave
  // for one either.
  assert.ok(sources(privacy.directives, 'script-src').includes("'self'"));
  assert.ok(sources(privacy.directives, 'connect-src').includes("'self'"));
  assert.doesNotMatch(privacy.raw, /'unsafe-eval'/);

  // Another rewritten static page keeps its own measured allowlist, unchanged.
  const legacy = await policyForPath('/founder.html');
  assert.ok(
    sources(legacy.directives, 'script-src').includes('https://cdn.tailwindcss.com'),
    'the legacy tier must still allow what those pages actually load'
  );

  // An arbitrary unknown path gets the baseline floor.
  const stray = await policyForPath('/a/path/that/does/not/exist');
  assert.deepEqual(sources(stray.directives, 'base-uri'), ["'self'"]);
  assert.deepEqual(sources(stray.directives, 'object-src'), ["'none'"]);
  assert.deepEqual(sources(stray.directives, 'frame-ancestors'), ["'none'"]);
  assert.match(stray.raw, /upgrade-insecure-requests/);
});

test('the baseline floor is honest about its reach and still carries no wildcard', async () => {
  const { raw, directives } = await policyForPath('/dashboard');

  // The floor is deliberately NOT default-src 'self'. The Next/React half of
  // this origin loads Clerk from a Frontend API host that exists only in an
  // environment variable, and /checkout.html loads Stripe.js and its controller
  // iframe. Neither was measured in a browser here, and an unmeasured
  // default-src 'self' across the whole origin would break authentication and
  // checkout in production. What the floor does carry is every directive that
  // cannot break a page which loads third-party code.
  for (const directive of ['base-uri', 'object-src', 'frame-ancestors', 'form-action']) {
    assert.ok(sources(directives, directive), `the floor must carry ${directive}`);
  }
  assert.equal(
    sources(directives, 'default-src'),
    null,
    'the floor must not claim a default-src it was never measured against'
  );
  assert.equal(
    sources(directives, 'script-src'),
    null,
    'the floor must not claim a script-src it was never measured against'
  );

  for (const [directive, values] of directives) {
    for (const value of values) {
      assert.ok(
        value !== '*' && !value.startsWith('*.') && value !== 'https:' && value !== 'http:',
        `${directive} on the floor must not contain the wildcard source ${value}`
      );
      assert.doesNotMatch(value, /^http:\/\//, `${directive} on the floor must not allow plaintext ${value}`);
    }
  }
  assert.doesNotMatch(raw, /'unsafe-eval'/);
});

// The static-HTML tier, measured the way the rewrite pages were: markup plus the
// local scripts those pages pull in, never a guess.
const STATIC_TIER_EXCLUDED = new Set([
  'index.html',
  'nexus-personal.html', 'creative-director.html', 'founder.html', 'command-center.html',
  'checkout.html'
]);

async function staticTierPages() {
  const names = await readdir(PUBLIC_ROOT);
  return names.filter((name) => name.endsWith('.html') && !STATIC_TIER_EXCLUDED.has(name));
}

test('the static-HTML tier permits every origin those pages actually load, and nothing dead', async () => {
  const pages = await staticTierPages();
  assert.ok(pages.length >= 20, `the tier must cover the static pages, found ${pages.length}`);

  const { directives } = await policyForPath('/privacy-directive.html');
  const allowed = new Set([...directives.values()].flat().filter((value) => value.startsWith('https://')));

  const file = (name) => new URL(name, `file:///${PUBLIC_ROOT.replace(/\\/g, '/')}`);
  const loaded = new Set();
  const mentioned = new Set();
  const addLoad = (text) => {
    for (const [, origin] of text.matchAll(
      /(?:fetch|import|importScripts|new EventSource|new WebSocket|action\s*=\s*)[\s(]*["'`](https:\/\/[a-z0-9.-]+)/gi
    )) loaded.add(origin.toLowerCase());
    // <source src>, <video src> and url(...) in inline CSS are loads too, and
    // are exactly what a script/link-tag-only scan misses.
    for (const [, origin] of text.matchAll(/<(?:source|video|audio|img)\b[^>]*\bsrc="(https:\/\/[a-z0-9.-]+)/gi)) {
      loaded.add(origin.toLowerCase());
    }
    for (const [, origin] of text.matchAll(/url\(\s*["']?(https:\/\/[a-z0-9.-]+)/gi)) loaded.add(origin.toLowerCase());
  };
  const addMentions = (text) => {
    for (const [origin] of text.matchAll(/https:\/\/[a-z0-9.-]+/gi)) mentioned.add(origin.toLowerCase());
  };

  for (const page of pages) {
    const html = await readFile(file(page), 'utf8');
    for (const [tag, , url] of html.matchAll(/<(script|link)\b[^>]*\b(?:src|href)="(https:\/\/[^"]+)"/gi)) {
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

  assert.ok(loaded.size >= 4, 'the scan must find the CDNs and hosts these pages load');
  for (const origin of loaded) {
    assert.ok(allowed.has(origin), `${origin} is loaded by a static page but not allowed by its policy`);
  }

  // No dead permission, in the other direction. Iconify's API hosts and
  // fonts.gstatic.com are reached by third-party code the pages load, not by the
  // pages themselves, so they are allowed without being mentioned.
  const reachedByThirdPartyCode = new Set([
    'https://api.iconify.design',
    'https://api.simplesvg.com',
    'https://api.unisvg.com',
    'https://fonts.gstatic.com'
  ]);
  for (const origin of allowed) {
    if (reachedByThirdPartyCode.has(origin)) continue;
    assert.ok(mentioned.has(origin), `${origin} is allowed by the static tier but no static page mentions it`);
  }
});

test('the static-HTML tier shuts the same sinks the homepage does, with no wildcard anywhere', async () => {
  const { raw, directives } = await policyForPath('/privacy-directive.html');
  assert.deepEqual(sources(directives, 'frame-src'), ["'none'"], 'no static page frames anything');
  for (const [directive, values] of directives) {
    for (const value of values) {
      assert.ok(
        value !== '*' && !value.startsWith('*.') && value !== 'https:' && value !== 'data:*',
        `${directive} must not contain the wildcard source ${value}`
      );
      assert.doesNotMatch(value, /^http:\/\//, `${directive} must not allow plaintext ${value}`);
    }
  }
  assert.doesNotMatch(raw, /'unsafe-eval'/);
  assert.doesNotMatch(raw, /'strict-dynamic'/);
  assert.match(raw, /upgrade-insecure-requests/);
});

// Served, not merely configured: read the raw header lines off the wire so a
// duplicate Content-Security-Policy cannot hide behind a Headers object that
// joins repeats with a comma. The authoritative production-shaped check is
// `next build && next start` plus curl, recorded in lweb-report.md; this is the
// same check inside the suite, for the paths the hermetic server can answer.
function rawResponse(url) {
  return new Promise((fulfil, reject) => {
    const request = get(url, (response) => {
      response.resume();
      const lines = [];
      for (let index = 0; index < response.rawHeaders.length; index += 2) {
        lines.push([response.rawHeaders[index].toLowerCase(), response.rawHeaders[index + 1]]);
      }
      response.on('end', () => fulfil({ status: response.statusCode, lines }));
    });
    request.on('error', reject);
  });
}

test('the served response carries exactly one Content-Security-Policy header line, and it is the configured one', async () => {
  await site.ready();
  if (site.external) return; // an external server sends its own headers

  for (const pathname of ['/', '/privacy-directive.html', '/founder.html', '/a/path/that/does/not/exist']) {
    const { lines } = await rawResponse(new URL(pathname, site.url));
    const csp = lines.filter(([key]) => key === CSP_KEY);
    assert.equal(csp.length, 1, `${pathname} must be sent exactly one ${CSP_KEY} header, got ${csp.length}`);
    const { raw } = await policyForPath(pathname);
    assert.equal(csp[0][1], raw, `${pathname} must be served exactly the configured policy`);
  }
});

// ---------------------------------------------------------------------------
// Item 6: the two pages the assistant panel links to must load no third-party
// executable script.
//
// CSP is not the answer to this one, and that is the whole point. Allowlisting
// code.iconify.design in script-src permits a MUTABLE remote script to run on a
// page that can read the NEXUS conversation credential out of sessionStorage -
// the credential is scoped to the origin and the tab, the panel links to these
// pages in the same tab, and the token survives the navigation. An allowlist
// entry is a promise about a host; removing the script is a fact about the page.
//
// Scope note: other pages on this origin still load off-origin scripts, which is
// why STATIC_PAGE_CSP and LEGACY_PAGE_CSP still allow those hosts. Only the two
// panel-reachable pages are asserted here.

/** A file:// URL for a name inside public/, on either path separator. */
const publicFile = (name) => new URL(name, `file:///${PUBLIC_ROOT.split('\\').join('/')}/`);

// A host named in an HTML or CSS comment is documentation; a host named in a tag
// or a URL is a dependency. Only the latter can put third-party code on the
// page, so the scans below look at the document with its comments removed - the
// same distinction tests/static-harness.test.mjs draws for a hard-coded port.
function stripDocumentComments(documentText) {
  return documentText.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** The pages a visitor can reach from inside the panel, read off the panel. */
async function panelReachablePages() {
  const home = await readFile(publicFile('index.html'), 'utf8');
  const panelStart = home.search(/<section\b[^>]*id="nexus-panel"/i);
  assert.ok(panelStart >= 0, 'the NEXUS panel section must exist');
  const panel = home.slice(panelStart, home.indexOf('</section>', panelStart));

  const pages = new Set();
  for (const [, href] of panel.matchAll(/href="\/([a-z0-9-]+\.html)"/gi)) pages.add(href.toLowerCase());
  // The offline notice builds its link in the widget script, not the markup.
  const script = home.match(/<script>\s*\(\(\)=>\{\s*const root=document\.getElementById\('nexus'\)[\s\S]*?<\/script>/i)?.[0] ?? '';
  for (const [, href] of script.matchAll(/a\.href='\/([a-z0-9-]+\.html)'/gi)) pages.add(href.toLowerCase());

  assert.deepEqual(
    [...pages].sort(),
    ['contact.html', 'privacy-directive.html'],
    'the panel reaches exactly these two pages; a new one must be added to this pass'
  );
  return [...pages].sort();
}

test('no page reachable from the assistant panel loads an off-origin script (item 6)', async () => {
  const pages = await panelReachablePages();
  for (const page of pages) {
    const html = stripDocumentComments(await readFile(publicFile(page), 'utf8'));
    const offOrigin = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*"([^"]+)"/gi)]
      .map((match) => match[1])
      .filter((source) => /^(?:https?:)?\/\//i.test(source));
    assert.deepEqual(offOrigin, [], `${page} must load no script from another origin`);
    assert.doesNotMatch(html, /\/\/code\.iconify\.design/, `${page} must not fetch anything from the Iconify script host`);
    assert.doesNotMatch(html, /<iconify-icon/i, `${page} must not use the custom element that needs that script`);
    // No other route to remote code either: no dynamic import, no injected tag.
    assert.doesNotMatch(html, /import\s*\(\s*['"`]https?:/i, `${page} must not dynamically import remote code`);
    assert.doesNotMatch(html, /createElement\(\s*['"]script['"]\s*\)/i, `${page} must not inject a script element`);
  }
});

test('contact.html renders the same twelve glyphs as inline SVG, decorative, at the same sizes (item 6)', async () => {
  const html = await readFile(publicFile('contact.html'), 'utf8');

  const icons = [...html.matchAll(/<svg class="icon ([^"]*)"([^>]*)>([\s\S]*?)<\/svg>/g)];
  assert.equal(icons.length, 12, 'every one of the twelve iconify-icon elements became an inline SVG');

  // The Tailwind size classes the custom element carried are still on the SVG,
  // because that is what makes the 1em box resolve to the old rendered size.
  const classes = icons.map(([, cls]) => cls.trim()).sort();
  assert.deepEqual(classes, [
    'text-brand-gold text-xl mt-1',
    'text-brand-gold text-xl mt-1',
    'text-brand-gold text-xl mt-1',
    'text-brand-gold text-xl mt-1',
    'text-brand-gold text-xl mt-1',
    'text-lg',
    'text-lg',
    'text-xl',
    'text-xl',
    'text-xl',
    'text-xl',
    'text-xl'
  ].sort(), 'the size and colour classes are unchanged, two at text-lg and ten at text-xl');

  for (const [whole, , attributes, body] of icons) {
    assert.match(whole, /viewBox="0 0 24 24"/, 'the 24x24 grid the icon sets are drawn on');
    assert.match(attributes, /aria-hidden="true"/, 'the glyphs are decorative; their labels live on the link or the heading');
    assert.match(attributes, /focusable="false"/, 'and they are not keyboard stops');
    assert.match(body, /fill="currentColor"/, 'colour still comes from the surrounding text colour');
    assert.doesNotMatch(body, /https?:/i, 'no inline SVG may reference a remote resource');
  }

  // The box the custom element used to give itself, now a rule of ours. Without
  // it an <svg> would size itself to 100% and the page would visibly change.
  assert.match(html, /\.icon \{[\s\S]*?display: inline-block;[\s\S]*?width: 1em;[\s\S]*?height: 1em;[\s\S]*?vertical-align: -0\.125em;[\s\S]*?\}/);

  // The four social links had no text and no label at all: their icon carries
  // the meaning, so the link now carries the name.
  const anchors = [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)];
  const iconOnly = anchors.filter(([, , inner]) => {
    if (!/<svg class="icon/.test(inner)) return false;
    // "Icon only" means the anchor has no visible text of its own once the SVG
    // is removed; the e-mail link, which shows the address, is not one.
    return inner.replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').trim() === '';
  });
  assert.equal(iconOnly.length, 4, 'the four social links are the only icon-only controls');
  for (const [, attributes] of iconOnly) {
    assert.match(attributes, /aria-label="[^"]{10,}"/, 'an icon-only link must have an accessible name');
  }
  // And the link that does show its own text was left alone: no redundant label.
  const labelled = anchors.find(([, , inner]) => /alienation2innovation@gmail\.com/.test(inner));
  assert.ok(labelled, 'the direct-contact e-mail link must exist');
  assert.doesNotMatch(labelled[1], /aria-label/, 'a link with visible text needs no second name');
});

// ---------------------------------------------------------------------------
// ITEM 1 - a script on another same-origin page cannot recover a prior token.
//
// The credential used to live in sessionStorage, which is scoped to the origin
// and the tab rather than to a page. The panel links to /privacy-directive.html
// and /contact.html in the SAME tab, and seven other pages on this origin still
// execute third-party code, so an injection two clicks away could read a live
// NEXUS credential out of storage.
//
// The guarantee asserted here is the real one and it is stronger than "those
// pages behave": NO storage key holds the credential at all, on any page of this
// origin, so there is nothing to recover. That is a fact about every page, not a
// promise about a host, so it is asserted over all of public/ rather than over
// the two pages the panel happens to link to today.
// ---------------------------------------------------------------------------

const CREDENTIAL_IN_STORAGE =
  /(?:(?:session|local)Storage|indexedDB|document\.cookie)[\s\S]{0,80}conversation|conversation[\s\S]{0,80}(?:(?:session|local)Storage|indexedDB|document\.cookie)/i;

test('the credential-in-storage scan works in both directions (item 1)', () => {
  // The scan must be able to see a reintroduction, in either order, and must not
  // fire on an unrelated key - command-center.html keeps a "seen the tour" flag
  // in localStorage and that is none of this test's business.
  assert.match(CREDENTIAL_IN_STORAGE.source, /conversation/, 'the scan is about the credential, not about storage in general');
  for (const reintroduced of [
    "sessionStorage.setItem('nexus.conversation', token)",
    "localStorage.setItem('nx', conversation)",
    "const conversation = sessionStorage.getItem('nx')",
    "document.cookie = 'c=' + conversation"
  ]) {
    assert.match(reintroduced, CREDENTIAL_IN_STORAGE, `the scan must catch: ${reintroduced}`);
  }
  for (const unrelated of ["localStorage.getItem('nexus_tour_v5')", "sessionStorage.setItem('theme', 'dark')"]) {
    assert.doesNotMatch(unrelated, CREDENTIAL_IN_STORAGE, `an unrelated key must not trip the scan: ${unrelated}`);
  }
});

test('no page on this origin can recover a prior NEXUS credential from browser storage, because no key holds it (item 1)', async () => {
  const names = (await readdir(PUBLIC_ROOT)).filter((name) => name.endsWith('.html'));
  assert.ok(names.length > 5, 'the static pages must be discoverable, not hard-coded');
  assert.ok(names.includes('index.html'), 'the homepage is one of them');
  assert.ok(names.includes('terms-of-service.html'), 'and so is the Terms page the review named');

  const scanned = [];
  for (const name of names) {
    const page = stripDocumentComments(await readFile(publicFile(name), 'utf8'));
    scanned.push(name);
    assert.doesNotMatch(page, /nexus\.conversation/, `${name} must not name a NEXUS credential storage key`);
    // Any storage or cookie access within reach of the word "conversation", in
    // either direction. Unrelated keys on the legacy pages (command-center.html
    // keeps a "seen the tour" flag) are none of this test's business - the
    // credential is.
    assert.doesNotMatch(
      page,
      CREDENTIAL_IN_STORAGE,
      `${name} must not put the conversation credential into storage or a cookie, or read it back out`
    );
    // And only the homepage may even know the credential's header name.
    if (name !== 'index.html') {
      assert.doesNotMatch(page, /x-nexus-conversation/i, `${name} must not handle the credential header at all`);
    }
  }
  assert.ok(scanned.length === names.length, 'every static page was scanned');

  // The homepage also loads /js/meet-gary.js into the same document, so it gets
  // the same scan - a helper that cached the credential would be just as bad.
  for (const script of ['js/meet-gary.js']) {
    const source = await readFile(publicFile(script), 'utf8').catch(() => null);
    if (source === null) continue;
    assert.doesNotMatch(source, /nexus\.conversation|x-nexus-conversation/, `${script} must not touch the credential`);
    assert.doesNotMatch(source, /(?:session|local)Storage|indexedDB|document\.cookie/i, `${script} must not store anything`);
  }
});

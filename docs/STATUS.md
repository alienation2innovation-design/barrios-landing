# Barrios A2I website — status

Newest entry first. This file records website-side state for the NEXUS assistant work. The companion record,
with the assistant core's detail, is `C:\Projects\barrios-nexus-assistant\docs\STATUS.md`.

---
# RESET-ONLY PROXY, TRUTHFUL DISCLOSURE, NO CDN SCRIPT ON PANEL PAGES, HERMETIC TESTS — NOT PUSHED, 2026-09-25

Gary authorized one bounded pass over eight verified findings; four were the website's. All are implemented and
tested, an independent security and privacy review ran after the last edit, and both of its website findings were
then fixed and re-verified. **Nothing was pushed or deployed**, and no Vercel setting, DNS record, billing
setting or production environment variable was changed.

## Branch and HEAD

`feat/homepage-ai-workers-rewrite` at **`0b5030f`**, ahead of `origin` and not pushed. The six commits of this
pass, oldest first:

```text
896ca89 feat: a reset-only proxy route and an immediate, retried revocation
7081fab fix: the disclosure warns visitors instead of overclaiming what is not processed
cc90679 fix: remove the third-party icon script from both panel-reachable pages
e9d2a38 test: npm test is hermetic whatever HOMEPAGE_URL the shell is carrying
4232ec4 fix: a successful reset is not reported as a failure
0b5030f fix: tell the truth about what the chat stores
```

Changed paths: `app/api/nexus/reset/route.ts` (new), `public/index.html`, `public/privacy-directive.html`,
`public/contact.html`, `package.json`, `tests/**` (including the new hermetic harness at
`tests/support/site.mjs`). `next.config.js`, `vercel.json`, `middleware.ts`, `app/api/nexus/chat/route.ts`,
`lib/**` and every `.env*` were left alone, and `dist/output.css` / `public/dist/output.css` were never staged.

## What changed

**A reset-only proxy and an immediate revocation.** `app/api/nexus/reset/route.ts` mirrors the chat route's
security properties — the same origin gate, the same `NEXUS_CHAT_ENABLED` kill switch checked before anything
else, the shared proxy secret, the same cookie filter, one attempt, `redirect:'error'`, **no CORS header at all**
(asserted on success and on refusal, and asserted absent from the source), a bounded log line with no token, body
or IP — narrowed to a 512-byte cap and a 5-second timeout, with no stream pump, and it never relays a conversation
token back. It validates nothing; the core is the only authority. "New conversation" now clears the transcript,
the in-closure state and the stored token **synchronously**, then fires the revocation immediately. A transport
failure or 5xx is retried twice with the same retired token, a 4xx or 429 is final, and a pending retry is
**dropped** once a new conversation has begun, so it can never revoke newer state.

A follow-up fixed a real contract bug found by cross-lane verification: the proxy had been collapsing any
upstream body without a string `code` into a 503, but `code` is this API's **error** convention and the core's
success body carries none — so every successful reset was being reported to the browser as a failure and then
retried. Any upstream 2xx is now relayed as success regardless of body shape, and the core additionally carries a
stable `code` on success so neither side has to guess.

**Truthful disclosure.** The panel says NEXUS does not ask for or save contact details and warns visitors not to
type personal information, without claiming that typed text goes unprocessed. The Privacy page's OneDrive and
email language is now one explicitly conditional paragraph, asserted structurally so it cannot be restated as
present fact while lead capture is off. The first attempt then over-corrected — it claimed *"Barrios A2I does not
save anything you type in the chat"*, which is **false** — and that has been replaced with what actually happens:
text is sent to the third-party model provider as described on the page, the conversation is also held on our own
server for its lifetime with contact-shaped details masked in what is stored, and it is deleted when the
conversation reaches its idle or absolute limit or immediately if the visitor starts a new conversation. A test
guards against both the old sentence and any blanket "does not save anything" phrasing.

**No third-party executable script on either panel-reachable page.** `privacy-directive.html` and `contact.html`
previously loaded `code.iconify.design`, a mutable CDN script that — being same-origin with the page — could read
the `sessionStorage` conversation credential. All twelve icons are now inlined SVG with no vendored exception,
measured in a browser to within 0.02 px of the previous glyph boxes; four icon-only social links gained accessible
names and the rest stay decorative.

**Hermetic tests.** `npm test` starts and stops its own static server on a **kernel-assigned** port and ignores an
ambient `HOMEPAGE_URL`, so an inherited value can no longer redirect the suite at an external site — a failure
mode that had already produced one confident but entirely spurious 26-failure report. Intentional external
testing sits behind an explicit opt-in flag.

## Verification — after the last edit, real exit codes

| Command | Exit | Result |
|---|---|---|
| `npm test`, `HOMEPAGE_URL` unset | **0** | **154 tests, 154 pass, 0 fail, 0 skipped** |
| `HOMEPAGE_URL=http://127.0.0.1:9/ npm test` | **0** | 154/154 — the suite used its own server |
| two concurrent `npm test` runs | **0 / 0** | no port collision |
| `npx tsc --noEmit` | **0** | clean |
| production build (placeholder env in-shell only) | **0** | compiled successfully, both `ƒ /api/nexus/chat` and `ƒ /api/nexus/reset` in the route table |
| `git diff --check` | **0** | clean |

The dead-URL result is only meaningful because the same dead URL **with** the opt-in external flag produces 43
failures — that control is what proves the host really is unreachable and the default suite genuinely ignored it.

## Remaining risks and open decisions

- **The origin is not clean; only the two pages in scope are.** Seven pages one click away from the panel still
  load off-origin executable scripts, including two unpinned (`unpkg.com/lucide@latest`) and
  `cdn.tailwindcss.com`. Because they share this origin, a script there can read the `sessionStorage`
  conversation credential **and** call `/api/nexus/chat` and `/api/nexus/reset` with `credentials:'same-origin'`
  and pass the origin gate. This pass was bounded to the panel-reachable pages, so the sweep was deliberately not
  widened. **Treat this as an open decision, not a closed finding.**
- `'unsafe-inline'` remains in `script-src` and `style-src`, forced by the inline blocks in a static page, so CSP
  narrows inline injection without closing it and is not a substitute for the core's server-side revocation and
  session binding.
- Floor-only pages (`/dashboard`, `/sign-in`, `/checkout.html`, the API) still permit off-origin script; tightening
  them needs a browser measurement of the Clerk and Stripe hosts first.
- A reset refused with 429 is dropped without retry, so that revocation waits for the core's deadline sweep.
- The honest CTA and disclosure are correct only while the lead backend is unset; enabling it requires revisiting
  this copy in the same change.
- The committed `dist/output.css` is still stale against source, and `vercel.json`'s build command does not run the
  npm `prebuild` lifecycle, so the committed artifact is what ships. It is byte-identical to the deployed commit;
  regenerating it remains Gary's call.

## Next release gate

Codex's review, then the two coupled decisions: finishing the off-origin script removal across the rest of the
origin, and enabling the lead backend together with the copy that depends on it. Pushing this branch remains a
separate explicit approval. `origin/master` is `7b93711`, so production still serves the pre-hardening release.

---
# CSP, HERMETIC TEST HARNESS, HONEST CTA, SERVER-SIDE REVOCATION — NOT PUSHED, 2026-09-24

Gary supplied eleven review findings; four of them were the website's. All are implemented and tested, an
independent security and privacy review ran after the last edit, and its two website findings were fixed and
re-verified. **Nothing was pushed or deployed**, and no Vercel setting, DNS record, billing setting or
production environment variable was changed. Codex reviews this before any production deployment.

## Branch and HEAD

`feat/homepage-ai-workers-rewrite` at **`239db94`**, ahead of `origin` and not pushed. The six commits of this
pass, oldest first:

```text
455a303 test: the website suite starts and stops its own server
741a54b fix: the panel offers what this build can actually do
9bcb068 security: give the site a Content-Security-Policy
2ad59f8 feat: revoke the conversation server-side and follow the rotated token
833511d fix: every page on this origin carries exactly one CSP
239db94 fix: a revocation that did not land is retried, not dropped
```

Changed paths: `next.config.js`, `public/index.html`, `app/api/nexus/chat/route.ts`, `package.json`,
`tests/**` (including the new `tests/support/site.mjs` harness). `vercel.json`, `middleware.ts`, `lib/**` and
every `.env*` were left alone, and `dist/output.css` / `public/dist/output.css` were never staged.

## What changed

**Honest wording while no lead backend is active (finding 9).** The panel previously offered to start a
consultation request and promised that contact details would be collected with consent — a capability the
assistant backend does not currently have. The primary call to action is now
**"Explore your automation with NEXUS."** and the disclosure no longer promises contact collection. The
`NEXUS AI BETA` badge, its supporting line and the Privacy link are unchanged, and the honesty assertions still
hold: the panel contains none of `saved|sent|submitted|booked|scheduled|delivered` and names no vendor, model or
host.

**A Content-Security-Policy where there was none (finding 10).** Measured beforehand: zero occurrences in the
repository. The policy is set in `next.config.js` in five tiers whose sources are **mutually exclusive**, so
rule order cannot yield two intersected headers. The homepage and the static HTML pages — including
`/privacy-directive.html`, which is linked from inside the panel and can therefore read the conversation token —
take a tight policy: `default-src 'self'`, `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
`frame-ancestors 'none'`, `form-action 'self'`, `img-src 'self' data:`, `font-src 'self'`,
`upgrade-insecure-requests`. A catch-all **floor** covers every remaining path with the structural directives.
`vercel.json` was not touched, the `/api/:path((?!nexus/).*)` CORS carve-out is intact, and the NEXUS route
still emits no CORS header.

It was proved three ways: exactly one matching rule per path; the raw served header captured from
`next build` + `next start` + `curl`, showing exactly one CSP header on all ten probes; and against Next's own
compiled regexes in `routes-manifest.json`, which caught a real collision — Next compiles sources with an
optional trailing slash, so `/founder/` matched two rules until the exclusions were anchored.

**A hermetic test harness (finding 11).** The suite previously required a listener at `127.0.0.1:4173`, which
had already produced a confident but entirely spurious 26-failure report when a stale server served another
commit's bytes. `npm test` now starts and stops its own static server on a **kernel-assigned** port, with a full
MIME table and clean teardown even when a test fails, so collision is impossible by construction. Two
concurrent runs both pass. The `HOMEPAGE_URL` override still works for anyone pointing at an external server.

**The browser half of server-side revocation and rotation.** The core now treats the conversation credential as
single-use and revokes on request, so this page forwards `x-nexus-conversation-reset` through the proxy, stores
the rotated token from every response, and sends the reset with the visitor's next turn rather than spending a
provider call on a click. "New conversation" clears the transcript and the local token **synchronously**, so the
visitor never waits on the network. A revocation that does not land — abort, 409, 429, a network error — is
**kept and retried on the next turn** rather than silently dropped, and only a served turn spends it. No error
is ever surfaced for a failed revocation.

## Verification — after the last edit, real exit codes

| Command | Exit | Result |
|---|---|---|
| `npm test` (hermetic) | **0** | **121 tests, 121 pass, 0 fail, 0 skipped** |
| `npm test` twice concurrently | **0 / 0** | no port collision |
| `npx tsc --noEmit` | **0** | clean |
| `npm run build` (placeholder env in-shell only) | **0** | Next.js 15.5.26, `ƒ /api/nexus/chat` present, no `pages/api/nexus`, 13 CSP rules in `routes-manifest.json` |
| `git diff --check` | **0** | clean |

## Remaining risks

- **`'unsafe-inline'` remains** in `script-src` and `style-src`, forced by four inline `<script>` and four
  inline `<style>` blocks in a static file. A nonce cannot reach bytes that are never rendered per request, and
  hashes fail closed on a page rewritten by codegen. So CSP narrows the exposure of the `sessionStorage`
  conversation token but does **not** stop inline-injected script, and it does not replace the core's
  server-side revocation and session binding.
- **Floor-only pages** — `/dashboard`, `/sign-in`, `/checkout.html` and the API — still permit off-origin
  script. Tightening them requires first measuring the Clerk and Stripe hosts in a browser; Clerk's Frontend API
  host exists only in an environment variable, so a literal `default-src 'self'` catch-all would have broken
  authentication and checkout.
- `/founder/` is manifest-verified rather than served-verified, because a 308 precedes the headers phase.
- A second "New conversation" click before any turn is sent revokes only the most recent abandoned token; the
  older record waits for the core's deadline sweep.
- The honest CTA is correct only while the lead backend is unset. If `NEXUS_LEAD_BACKEND` is ever enabled, this
  copy must be revisited in the same change, or the site will be wrong in the other direction.
- The committed `dist/output.css` is still stale against source, and `vercel.json`'s build command does not run
  the npm `prebuild` lifecycle, so the committed artifact is what ships. It is byte-identical to the deployed
  commit; regenerating it remains Gary's call.

## Next release gate

Codex's review, then the coupled decision about enabling the lead backend together with the CTA copy, and a
browser measurement of the Clerk and Stripe hosts before the floor-only pages are tightened. Pushing this branch
remains a separate explicit approval. `origin/master` is `7b93711`, so production still serves the pre-hardening
release.

---

# NEXUS AI BETA: TAB-SCOPED CONVERSATIONS, NEW-CONVERSATION CONTROL, ACCESSIBLE LABEL — NOT PUSHED, 2026-09-24

Gary authorized a correction pass after defects were reproduced through the **live** assistant on
`barriosa2i.com`. The website half is implemented, tested, independently reviewed and committed locally.
**Nothing was pushed or deployed**, and no Vercel, DNS or billing setting was changed. Codex reviews this before
any production deployment.

## Branch and commits

`feat/homepage-ai-workers-rewrite`, **ahead of `origin` and not pushed**. The three code commits are below;
the branch also carries the documentation commits that record them, so check `git log` for the exact count:

```text
ba85d6d fix: meet WCAG AA contrast and legible size for the beta label
93ef211 fix: start a fresh conversation on every fresh document load
9dd9cb4 fix: scope the assistant conversation to the browser tab and relabel to NEXUS AI BETA
7b93711 harden: type-check the Clerk auth gate and let security overrides take patches   (previous head)
```

Changed paths: `public/index.html`, `app/api/nexus/chat/route.ts`, `public/js/meet-gary.js`,
`tests/aura-homepage.test.mjs`, `tests/nexus-chat-route.test.mjs`, `tests/aura-footer.test.mjs`,
`tests/meet-gary-section.test.mjs`. All inside the twelve paths Gary approved on 2026-09-20 except the two
Meet Gary / footer test files, which assert the old release label and had to move with it. `docs/STATUS.md`
(this file) is new and documentation-only.

## What changed

**The privacy defect.** A new browser tab showed an empty transcript but the assistant silently continued the
previous tab's conversation, because the conversation was selected by the `nexus_sid` cookie, which every tab of
an origin shares. The core now mints an opaque, signed, expiring conversation token and returns it in the
`x-nexus-conversation` response header; this page stores it in **`sessionStorage`**, which is per-tab by
construction, and echoes it as a request header. `app/api/nexus/chat/route.ts` forwards that header upstream and
copies the upstream response header back, and validates nothing — the core's signature check is the only
authority. Every storage access is wrapped in try/catch, so a private window or blocked storage degrades to a
fresh conversation rather than a broken widget. The token is never rendered, never logged, and never placed in
the DOM or a URL.

**Lifecycle, stated exactly.** A new tab starts fresh. Closing and reopening the panel **within the same
document** keeps that tab's conversation. **Any fresh document load starts a fresh conversation** — a reload,
following the panel's own Privacy or contact link and coming back, or back/forward without bfcache — because the
transcript lives only in the DOM, so a surviving token would recreate the original symptom of an empty
transcript with inherited context. A bfcache restore is not a fresh document load and correctly keeps the
conversation. A visible **New conversation** control clears the transcript and in-closure state, aborts an
in-flight stream, forgets the token and rotates the identifier; it deliberately does not carry
`data-nexus-open`, so the panel's opener contract is unchanged.

**Public label.** `PUBLIC PILOT` is now **`NEXUS AI BETA`** everywhere the release status appears, with one
supporting line, "Daily improvements are being added." Both are visible at desktop and 375px, present in the
accessibility tree, and the panel's dialog name is "NEXUS assistant, beta". Following a real-browser
measurement, the supporting line's contrast was raised from **4.03:1 to 6.45:1** (WCAG AA needs 4.5:1) and the
badge from 9px desktop / 8px mobile to **11px at both**, with no wrap or overflow at 375px. The short privacy
disclosure and the Privacy link are unchanged.

## Verification — real exit codes, at `ba85d6d`

The served page was confirmed fresh before testing (`NEXUS AI BETA` present, `PUBLIC PILOT` absent), on a
private port to avoid a stale listener.

| Command | Exit | Result |
|---|---|---|
| `node --test` over the six suites | **0** | **84 tests, 84 pass, 0 fail, 0 skipped** |
| `npx tsc --noEmit` | **0** | clean |
| `npm run build` (placeholder env in-shell only) | **0** | Next.js 15.5.26, compiled successfully, `ƒ /api/nexus/chat` present, no `pages/api/nexus`, no warnings |
| `npm audit --omit=dev` | 1 | 0 critical, 0 high, **4 moderate** (unchanged, out of authorized scope) |
| `git diff --check` | **0** | clean |

A real-process interop run (this route under `next dev` against a locally running core) reproduced two-tab
isolation, the marker-never-crosses test and the tokenless-turn regression test. A browser lane additionally
ran landscaping, restaurant, HVAC, adversarial-privacy and two consultation scenarios against local preview
instances with a mock provider, and verified the label at 1440px and 375px.

## Open items for Gary

- **A copy decision.** The panel headline "Start a consultation request" and the consent disclosure promise a
  capability the assistant backend currently has switched off, while the assistant itself honestly says it
  cannot save or send anything from the chat. Either enable the lead backend or reword that copy — it is pinned
  by `tests/aura-homepage.test.mjs`, so it cannot drift back silently.
- **No Content-Security-Policy exists anywhere in this repository** (measured: zero occurrences), while the
  conversation credential now lives in `sessionStorage`. Adding one is the natural compensating control and is
  recommended as a follow-up.
- If a lead-submission proxy is ever added here, it must forward `x-nexus-conversation`, or lead turns will not
  join the visitor's conversation.

## Repository envelope

`dist/output.css` and `public/dist/output.css` remain **modified and were never staged** — they are Gary's
uncommitted artifacts and the build regenerates them. Note that `vercel.json`'s build command is
`prisma generate && next build`, which does not run the npm `prebuild` lifecycle, so the **committed** CSS is
what ships; it is byte-identical to the currently deployed commit, and regenerating it remains Gary's call.
The same 15 untracked user files are intact. Index empty, stash empty. `origin/master` is `7b93711`, so
production still serves the pre-hardening release.

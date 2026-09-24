# Barrios A2I website — status

Newest entry first. This file records website-side state for the NEXUS assistant work. The companion record,
with the assistant core's detail, is `C:\Projects\barrios-nexus-assistant\docs\STATUS.md`.

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

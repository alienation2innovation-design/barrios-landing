# Aura Homepage Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only the public root homepage with the approved Aura design while preserving every backend, authenticated route, product route, and production deployment.

**Architecture:** Keep the current static-homepage boundary: Next.js continues to serve `public/index.html` at `/`, while App Router application routes remain untouched. Import the approved Aura export faithfully, compile its Tailwind utilities locally, use the existing local Barrios A2I logo, and harden only accessibility, responsiveness, and performance behavior that does not visibly redesign the page.

**Tech Stack:** Next.js 14.2, static HTML/CSS/JavaScript, Tailwind CSS 4 CLI, Node.js built-in test runner, Vercel preview deployments.

**Spec:** `docs/superpowers/specs/2026-09-05-barrios-a2i-public-site-rebuild-design.md`

## Global Constraints

- The visual source of truth is Aura project `4ae020d2-eede-42b3-aa38-ec6ed5135454`; project `153fe48d-def4-434d-a0cd-e742de748f7d` must not be used.
- This phase changes only `/`; `/start` and the shared cross-page NEXUS architecture remain follow-up work.
- Preserve the approved Aura composition, typography, spacing, orbital hero, dark cyan/teal system, restrained amber, larger logos, social strip, NEXUS shell, footer Book Now placement, and logo hover/focus warp.
- NEXUS remains visual-only and must never transmit chat or booking data.
- Book Now remains in document flow near the footer and opens scheduling preview in the same NEXUS panel.
- Include LinkedIn, X, Instagram, TikTok, and Reddit; exclude Facebook.
- Do not modify dashboard, auth, checkout, API, middleware, Prisma, DNS, billing, environment, token, or Vercel configuration files.
- Do not delete legacy pages.
- Do not change `package.json` or upgrade dependencies.
- Work only on feature branch `feat/homepage-ai-workers-rewrite`.
- A Vercel preview is allowed after verification; production requires Gary to explicitly say `deploy production`.

## Approved Visual Preservation Notes

### Token system

- Void black `#05080D`
- Deep navy `#0B131C`
- Brand cyan `#00CED1`
- Bright cyan `#4DEBE8`
- White `#F5F8FA`
- Muted steel `#81909D`
- Restrained amber `#F2B94B`
- Keep the Aura export's Noto Sans typography and responsive type scale.

### Layout

```text
[large logo]  section navigation                           [primary CTA]

[plain-language promise]         [signature orbital automation visual]
[two focused CTAs]

[business outcomes] -> [workflow layers] -> [examples] -> [process]
[ways to work together] -> [FAQ] -> [five-channel social signal]

[final CTA]
[in-flow Book Now control]                         [footer columns]
                                                     [fixed NEXUS launcher]
```

The orbital hero is the single dominant visual event. Supporting motion responds to scrolling or direct interaction, and stops for reduced-motion users. Content remains left-aligned and readable instead of becoming a generic centered SaaS card grid.

### Brief review

The approved design intentionally uses a dark high-technology language because it belongs to Barrios A2I's existing visual identity. No new gradients, colors, card shapes, or decorative animations will be introduced. Implementation work is restricted to deployment hardening beneath the approved appearance.

---

### Task 1: Preserve the current unfinished homepage draft

**Files:**
- Existing working-tree snapshot only: `public/index.html`, `public/landing-v3.css`, `public/landing-v3.js`
- Create: `docs/superpowers/plans/2026-09-05-aura-homepage-replacement.md`

**Interfaces:**
- Consumes: current dirty working tree on `feat/homepage-ai-workers-rewrite`
- Produces: a reversible local Git commit containing the pre-Aura draft

- [ ] **Step 1: Confirm the exact dirty files**

Run: `git status --short --branch`

Expected: branch `feat/homepage-ai-workers-rewrite` with only the three known homepage files plus this plan.

- [ ] **Step 2: Commit the recoverable snapshot**

Run:

```powershell
git add public/index.html public/landing-v3.css public/landing-v3.js docs/superpowers/plans/2026-09-05-aura-homepage-replacement.md
git commit -m "chore: preserve pre-aura homepage draft"
```

Expected: one local commit; no push.

### Task 2: Define the served-homepage contract first

**Files:**
- Create: `tests/aura-homepage.test.mjs`
- Test: `tests/aura-homepage.test.mjs`

**Interfaces:**
- Consumes: `HOMEPAGE_URL` environment variable, defaulting to `http://127.0.0.1:4173/`
- Produces: deployment-boundary assertions against the actually served root document

- [ ] **Step 1: Write failing route and safety tests**

Create tests with Node's `node:test` and real `fetch()` that require:

```js
const requiredSocials = [
  'https://www.linkedin.com/in/gary-barrios-3953b2390/',
  'https://x.com/BarriosA2I',
  'https://www.instagram.com/barrios.ai.gary/',
  'https://www.tiktok.com/@garyjbarrios',
  'https://www.reddit.com/user/BarriosA2I/'
];
```

The tests must verify the served `/` response is HTML and that:

- the approved hero promise and NEXUS dialog are present;
- all five social destinations occur in both the signal strip and footer;
- no Facebook destination occurs;
- no Aura Supabase asset URL or Tailwind CDN script occurs;
- the local stylesheet `/aura-landing.css` and local logo `/brand/barrios-a2i-logo.png` occur;
- every internal hash link points to an ID present in the served document;
- Book Now appears after the final CTA and before the footer columns;
- the NEXUS dialog and every opening control expose matching `aria-controls` state.

- [ ] **Step 2: Run the test against the current local homepage**

Run the existing Next.js site locally, then run:

```powershell
$env:HOMEPAGE_URL='http://127.0.0.1:4173/'
node --test tests/aura-homepage.test.mjs
```

Expected: FAIL because the current draft is not the approved Aura homepage.

- [ ] **Step 3: Record the expected RED failure in the implementation log**

The failing assertion must name a missing user-visible homepage behavior, not a syntax or connection error.

### Task 3: Install the approved Aura homepage artifact

**Files:**
- Modify: `public/index.html`
- Create: `src/aura-landing.css`
- Create: `public/aura-landing.css`
- Test: `tests/aura-homepage.test.mjs`

**Interfaces:**
- Consumes: `C:\Users\alien\Downloads\generated-page.html` exported from approved Aura project `4ae020d2-eede-42b3-aa38-ec6ed5135454`
- Produces: a self-contained root page whose only external runtime resources are approved Google font files

- [ ] **Step 1: Add the local Tailwind entrypoint**

Create `src/aura-landing.css` with:

```css
@import "tailwindcss";
@source "../public/index.html";
```

- [ ] **Step 2: Replace the root document with the approved export**

Copy the exported document into `public/index.html`, then make only these nonvisual substitutions:

- remove `<script src="https://cdn.tailwindcss.com"></script>`;
- add `<link rel="stylesheet" href="/aura-landing.css">`;
- replace every Aura Supabase logo URL with `/brand/barrios-a2i-logo.png`;
- move the footer Reddit link from runtime injection into the static footer markup;
- remove only the now-redundant footer-link injection scripts;
- preserve every approved section, style rule, animation, label, CTA, and social destination.

- [ ] **Step 3: Compile production CSS locally**

Run:

```powershell
npx @tailwindcss/cli -i ./src/aura-landing.css -o ./public/aura-landing.css --minify
```

Expected: exit code 0 and a nonempty `public/aura-landing.css`.

- [ ] **Step 4: Run the homepage contract tests**

Run:

```powershell
$env:HOMEPAGE_URL='http://127.0.0.1:4173/'
node --test tests/aura-homepage.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit the artifact and contract together**

Run:

```powershell
git add public/index.html src/aura-landing.css public/aura-landing.css tests/aura-homepage.test.mjs
git commit -m "feat: install approved Aura homepage"
```

Expected: one local commit; no push.

### Task 4: Verify user-visible behavior and visual fidelity

**Files:**
- Modify only if a failing behavioral check requires it: `public/index.html`
- Regenerate only if markup class usage changes: `public/aura-landing.css`
- Test: `tests/aura-homepage.test.mjs`

**Interfaces:**
- Consumes: locally served homepage at `http://127.0.0.1:4173/`
- Produces: desktop and mobile evidence that the approved experience works without regressions

- [ ] **Step 1: Verify desktop at 1440×1024**

Check header, large logo, hero copy, orbital visual, all content sections, social strip, final CTA, footer Book Now, footer links, and fixed NEXUS launcher. Confirm `document.documentElement.scrollWidth <= window.innerWidth` and no console errors.

- [ ] **Step 2: Verify mobile at 390×844**

Check responsive navigation, legible hero, contained orbital visual, five social links, centered in-flow Book Now control, footer, NEXUS launcher/panel, and no horizontal overflow.

- [ ] **Step 3: Exercise NEXUS behavior**

Verify every launcher opens one dialog; Escape closes it; close restores focus to the triggering control; normal triggers show automation-assistant copy; Book Now shows `SCHEDULING PREVIEW` with `This week`, `Next week`, and `I’m flexible`; no network request is sent by the panel.

- [ ] **Step 4: Exercise logo interaction and motion preferences**

Verify header and footer logos enlarge about 18% with the approved brief cyan/gold warp on pointer hover and keyboard focus, return when interaction leaves, and use a minimal static response under `prefers-reduced-motion: reduce`.

- [ ] **Step 5: Re-run the contract test after any correction**

Run: `node --test tests/aura-homepage.test.mjs`

Expected: PASS with zero failures.

### Task 5: Build and preview without touching production

**Files:**
- No new source files expected

**Interfaces:**
- Consumes: verified feature-branch implementation
- Produces: successful production build and a Vercel preview URL for Gary's review

- [ ] **Step 1: Run the full production build**

Run: `npm run build`

Expected: exit code 0. Any existing unrelated failure must be reported accurately and must not be hidden.

- [ ] **Step 2: Recheck repository scope**

Run:

```powershell
git status --short
git diff HEAD~2..HEAD --stat
```

Expected: only the approved homepage, CSS, test, and plan files changed. No backend, auth, database, or deployment configuration changed.

- [ ] **Step 3: Create a Vercel preview only**

Use the existing `barrios-landing` Vercel project without changing environment variables, domains, billing, DNS, or production aliases.

- [ ] **Step 4: Verify the preview**

Run the homepage contract against the preview URL and repeat the primary desktop/mobile/NEXUS checks. Production remains unchanged.

- [ ] **Step 5: Present the preview for approval**

Report the preview URL, build/test evidence, exact changed files, and rollback commit. Do not promote or push until Gary separately approves the required action.

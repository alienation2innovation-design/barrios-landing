# Barrios A2I Public Site Rebuild Design

Date: 2026-09-05

Status: Approved direction; awaiting written-spec review

## Objective

Rebuild the public Barrios A2I website around the approved Aura design while preserving the working dashboard, authentication, checkout flows, product tools, and backend.

The visual source of truth is Aura project 4ae020d2-eede-42b3-aa38-ec6ed5135454. Preserve its composition, prominent Barrios A2I logo, dark high-technology appearance, cyan and teal palette, orbital hero, and NEXUS assistant shell. Aura project 153fe48d-def4-434d-a0cd-e742de748f7d is not the source of truth.

## Current Problem

The repository combines a Next.js application with many independent HTML files under public/. Those files duplicate navigation, styling, assistant code, and product messaging. This causes inconsistent navigation, overlapping offers, fragile site-wide changes, hidden pages, and poor performance on lower-powered devices.

The live homepage is public/index.html. Authenticated application routes use the Next.js App Router. The rebuild must separate these two areas.

## Goals

- Explain immediately that Barrios A2I builds custom marketing automation for any business.
- Reproduce the approved Aura landing page faithfully with Barrios A2I content.
- Use one shared marketing header, footer, visual system, and NEXUS shell.
- Consolidate public marketing content into the landing page and one intake page.
- Keep existing application and backend functionality operational.
- Improve mobile and lower-powered-device performance.
- Preserve legacy routes until redirects are verified.
- Use a Vercel preview before any production cutover.

## Out of Scope

- Reprogramming or connecting the NEXUS backend.
- Redesigning protected product tools or the dashboard.
- Changing Clerk, Stripe, Prisma, DNS, billing, secrets, or databases.
- Publishing fixed prices before the pricing model is approved.
- Deleting legacy pages during the initial migration.
- Replacing production without separate explicit approval.

Assistant-backend work and protected-product redesigns are separate follow-up projects. This keeps the first implementation focused and reversible.

## Audience and Positioning

The audience is any business owner or operator with repetitive marketing, lead handling, sales follow-up, customer communication, or reporting work. The site must not assume a specific industry or technical background.

Primary message:

> Tell us what your business needs to do. We will design and build the automation around your existing process.

Barrios A2I must not appear to be only a chatbot company, website agency, video-production company, personal-assistant product, or vague AI laboratory.

## Information Architecture

Primary navigation:

- What We Automate
- Examples
- How It Works
- Work With Us
- Questions
- Start a Project

The NEXUS launcher remains consistently available and is not treated as another navigation item.

Public routes:

| Route | Purpose |
|---|---|
| / | Approved Aura landing page |
| /start | Focused project-intake flow |
| /privacy | Privacy and data-handling information |
| /terms | Terms of service |
| /sign-in | Existing client sign-in |
| /status | Operational utility outside primary navigation |

Existing /dashboard routes keep their own layout. NEXUS Personal, Creative Director, and Command Center remain preserved during an independent functional and access-control audit. They are removed from primary public navigation.

Legacy route treatment:

| Existing route | Destination |
|---|---|
| /contact and /contact.html | /start |
| /intake and /intake.html | /start |
| /founder and /founder.html | /#about after essential content is moved |
| /intelligence-stack and HTML equivalent | Landing-page capabilities section |
| /data-sovereignty and HTML equivalent | Landing-page trust or privacy destination |
| /pricing | Work With Us section until pricing is approved |
| Product and checkout routes | Preserve until their audit is complete |

Redirects are added only after their destinations exist and are verified. No legacy file is deleted in the first implementation.

## Landing-page Structure

1. Hero with prominent branding, orbital visual, plain-language promise, and primary CTA.
2. What We Automate, organized around business outcomes.
3. A visual workflow from lead capture through follow-up and reporting.
4. How It Works: describe, map, build, launch, and improve.
5. Ways to Work Together without unapproved prices.
6. Trust and Control covering human approval, compatibility, privacy, and visibility.
7. A concise About section.
8. Focused frequently asked questions.
9. Final Start a Project CTA.

## Visual System

The Aura design is reproduced, not loosely reinterpreted. Changes are limited to responsive behavior, accessibility, performance, semantic structure, and maintainability. They must not visibly redesign the approved page.

Core palette:

- Void black: #05080D
- Deep navy: #0B131C
- Brand cyan: #00CED1
- Bright cyan: #4DEBE8
- White: #F5F8FA
- Muted steel: #81909D
- Restrained amber: #F2B94B

Typography and spacing come from the Aura export. Cyan remains primary and amber secondary. Purple and generic green do not become equal brand colors.

The orbital hero is the main animated moment. Supporting pages use the same visual language without duplicating the full animation.

## Component Architecture

The public site becomes a Next.js marketing surface with focused reusable responsibilities:

- MarketingShell provides the shared public-page frame.
- MarketingHeader provides the logo, section links, mobile navigation, and primary CTA.
- MarketingFooter provides contact and legal links.
- AuraLanding contains the approved landing sections in their original order.
- AutomationBriefForm owns the /start form and submission states.
- NexusAssistantShell provides one consistent launcher and panel across public routes.
- Focused visual modules own the orbital hero, workflow demonstration, and trust content.

The marketing layer does not import dashboard or product internals.

## NEXUS Boundary

The first implementation is visual only. The launcher and panel appear across public routes. Open state and draft text may persist during navigation, but the interface does not fabricate AI answers or transmit chat messages.

Before backend integration, sending displays a clear upgrading state and directs the visitor to Start a Project. Model selection, retrieval, conversation storage, analytics, safety policy, and backend integration require a separate design.

The existing code contains competing backends: public/js/nexus-api.js uses https://api.barriosa2i.com, while api/nexus/chat.js still uses a Render URL. This mismatch is a recorded follow-up dependency and will not be copied into the new shell.

## Project-intake Data Flow

The landing-page CTA opens /start. The form collects a name, work email, business name, and a plain-language automation request.

The browser validates required fields and submits to a first-party Barrios A2I endpoint. The existing api/terminal-intake.js and Resend integration will be audited and adapted instead of continuing the homepage Formspree submission.

On failure, the form preserves entered text, explains that nothing was sent, offers a retry, and shows the public email address. Server-side validation and duplicate-submit protection are required. No new database is introduced for this form.

## Performance and Accessibility

- No canvas or fixed element may cause horizontal overflow.
- Orbital and matrix motion pauses when offscreen or when the page is hidden.
- Reduced-motion users receive a static equivalent.
- Animation density and device-pixel ratio are capped on lower-powered devices.
- Secondary code is lazy-loaded where practical.
- Image and logo dimensions are reserved to prevent layout shift.
- Navigation, buttons, and assistant controls are keyboard accessible.
- The assistant uses dialog semantics, focus management, focus restoration, and Escape-key support.
- Text contrast and touch targets meet WCAG 2.2 AA expectations.

Performance targets:

- No horizontal overflow at supported viewports.
- Cumulative Layout Shift below 0.1.
- Largest Contentful Paint target below 2.5 seconds on a representative mobile profile.
- Lighthouse accessibility score of at least 90.
- No uncaught browser console errors during primary flows.

## Error Handling

- Marketing content remains readable when JavaScript is unavailable.
- Hero text and the primary CTA remain visible if the decorative visual fails.
- NEXUS visual failures never block navigation or the project form.
- The project form distinguishes validation, network, and server failures.
- Redirects use stable section IDs and are covered by route checks.
- A failed Vercel preview leaves production untouched.

## Verification Plan

Before requesting production approval:

1. Run the repository build and relevant static checks.
2. Test /, /start, /privacy, /terms, /sign-in, dashboard entry, and preserved product routes.
3. Verify every legacy redirect and destination.
4. Test project-intake success, failure, and duplicate-submit protection.
5. Exercise NEXUS open, close, quick prompts, draft behavior, focus management, and upgrading state without transmitting messages.
6. Check desktop, tablet, and small-mobile widths in Chrome and Edge.
7. Check keyboard-only navigation and reduced-motion behavior.
8. Compare desktop and mobile screenshots against the approved Aura project.
9. Review browser console output and Vercel preview logs.
10. Confirm that Clerk, dashboard routes, and protected product flows were not changed by the marketing migration.

## Deployment and Rollback

1. Preserve the current feature branch and uncommitted homepage work.
2. Export the approved Aura project and inventory its assets without changing production.
3. Implement the marketing surface on the feature branch.
4. Build and test locally.
5. Create a Vercel preview for the existing barrios-landing project.
6. Complete visual, performance, and route verification on the preview.
7. Request explicit approval for the production cutover.
8. Promote the verified deployment while retaining the previous production deployment as the immediate rollback point.

DNS, billing, secrets, and Vercel project deletion are outside this strategy.

## Follow-up Projects

1. NEXUS backend reprogramming and cross-page conversation architecture.
2. Protected-product audit and access-control cleanup.
3. Dashboard and product-page visual migration to the approved design system.
4. Pricing model and checkout rationalization.
5. Legacy-file deletion after redirect monitoring confirms the files are no longer needed.

## Acceptance Criteria

The public rebuild is complete when:

- The root page matches the approved Aura design and uses Barrios A2I branding.
- A new visitor can explain what Barrios A2I automates after the hero and first capability section.
- Public navigation is consistent and contains no dead links.
- Project intake succeeds through a first-party endpoint and fails gracefully.
- The visual NEXUS shell is consistent across public routes and marked unavailable until backend integration.
- Legacy promotional routes reach verified replacement destinations without loops.
- Dashboard, authentication, and protected product flows remain operational.
- Responsive, accessibility, and performance checks meet the targets above.
- The Vercel preview is approved before production is changed.

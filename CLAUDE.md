# CLAUDE.md - MANDATORY RULES FOR CLAUDE CODE

## CRITICAL: READ THIS BEFORE EVERY ACTION

This is the Barrios A2I production website. Reckless changes have destroyed this site before.

---

## NEVER DO THESE THINGS

### Files You Must NEVER Modify Without Explicit Permission:
- `app/page.tsx` - THE LANDING PAGE. DO NOT TOUCH.
- `components/HeroSection.tsx`
- `components/AudienceRouter.tsx`
- `components/NeuralTopology.tsx`
- `components/OperationalVelocity.tsx`
- `components/SystemDiagnostics.tsx`
- `components/DeploymentTimeline.tsx`
- `components/ContactForm.tsx`
- `components/Footer.tsx`
- `app/layout.tsx` - Only minimal additions allowed (providers)
- `package.json` - NO version upgrades without explicit approval

### Actions That Require EXPLICIT User Approval:
1. Modifying ANY existing file (not just creating new ones)
2. Upgrading ANY npm package
3. Changing authentication providers or versions
4. Pushing to git (ALWAYS ask first)
5. Any "refactor" or "improvement" to existing code

### BANNED Actions:
- `git push` without user confirmation
- `npm update` or upgrading packages
- Replacing files (only ADD new files)
- "Refactoring" working code
- Pushing code that hasn't been built locally first

---

## REQUIRED WORKFLOW

### Before Writing ANY Code:
1. State which files you will CREATE (new files only)
2. State which files you will MODIFY (requires approval)
3. Wait for user approval before proceeding

### Before EVERY Git Push:
1. Run `npm run build` - if it fails, FIX before pushing
2. Show the user the exact commit message
3. Ask: "Ready to push? (yes/no)"
4. Wait for explicit "yes" before pushing

### When Adding Features:
- CREATE new files in new directories
- DO NOT modify existing files unless absolutely necessary
- If modification is needed, show a diff preview first

---

## Project Structure (DO NOT REORGANIZE)
```
app/
├── page.tsx           # LANDING PAGE - NEVER MODIFY
├── layout.tsx         # Minimal changes only
├── globals.css        # Additive changes only
├── dashboard/         # Safe to add/modify
├── sign-in/           # Safe to add/modify
├── sign-up/           # Safe to add/modify
└── api/               # Safe to add/modify

components/            # NEVER MODIFY EXISTING FILES
├── HeroSection.tsx    # DO NOT TOUCH
├── AudienceRouter.tsx # DO NOT TOUCH
├── [etc...]           # DO NOT TOUCH
└── dashboard/         # Safe to create new components here
```

---

## Environment & Deployment

- **Production URL:** https://www.barriosa2i.com
- **Vercel Project:** barrios-landing
- **Deployment:** Auto-deploys on push to master

### Before Deploying New Features:
1. Verify landing page still works locally
2. Run full build
3. Check that NO existing functionality is broken

---

## Incident History

**January 17-18, 2026:** Claude Code destroyed the landing page while implementing a profile system.
- Replaced `app/page.tsx` with a minimal placeholder
- Upgraded Clerk causing breaking changes
- Pushed 15+ broken commits without local testing
- Required full revert to recover

**Lesson:** NEVER trust "improvements" that modify existing working code.

---

## If You Break Something

1. STOP immediately
2. Run: `git log --oneline -10` to find last good commit
3. Run: `git reset --hard <good-commit>`
4. Run: `git push --force origin master`
5. Inform the user what happened

---

## Final Rule

**When in doubt, ASK. Do not assume. Do not "improve" things that work.**

---

# BARRIOS A2I HOMEPAGE REBUILD GUARDRAILS

## Live Homepage Source of Truth

The live BarriosA2I.com homepage is:

public/index.html

Do not assume app/page.tsx exists. It does not currently exist.

The current homepage is a static HTML homepage served from public/index.html. React landing components may exist in the repo, but they are not automatically the live homepage unless routing is explicitly changed and verified.

## Required Frontend Workflow

Before any frontend edit, use the frontend design skill first.

The frontend design skill must audit:
- layout
- visual hierarchy
- spacing
- typography
- responsive behavior
- CTA clarity
- brand consistency
- conversion flow

## Business Positioning

Barrios A2I must be positioned as an AI business automation company.

Core message:

Barrios A2I builds AI workers that automate repetitive computer tasks for businesses.

The homepage must make this clear to a normal business owner immediately.

Avoid making the company sound like only:
- a chatbot company
- a website company
- a video-commercial company
- a vague sci-fi AI lab

## Brand Rules

Preserve the Barrios A2I visual identity:
- dark black/navy background
- cyan/teal primary glow
- white futuristic typography
- subtle amber/yellow accents only
- premium AI command-center feel
- clean SaaS/product-site structure

Do not introduce purple as a co-equal accent.
Do not use off-brand green as a primary accent.
Do not make the site childish, generic, or cartoonish.

## Safety Rules

Do not deploy production unless Gary explicitly says: deploy production.

Do not touch:
- DNS
- IONOS
- Stripe
- billing
- auth
- Prisma schema
- middleware
- API routes
- .env files
- .vercel secrets/config
- credentials
- API keys
- tokens
- database URLs

Do not edit master directly. Use a feature branch.

Commit and push safe source changes only after verification.

Vercel preview deployment is allowed after approved safe implementation changes.
Production deployment requires explicit Gary approval.


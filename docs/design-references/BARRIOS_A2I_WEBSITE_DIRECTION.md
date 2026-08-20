# Barrios A2I Website Rebuild Direction

## Goal

Simplify BarriosA2I.com so a normal business owner understands exactly what Gary can do for them within the first screen.

The website should clearly state:

**Barrios A2I builds AI workers that automate repetitive computer tasks for businesses.**

This is not mainly a chatbot company, not mainly a website company, and not just an AI video/commercial lab. It is a business automation company.

## Core Message

If a business repeats a task on a computer, Barrios A2I can probably automate it.

Plain-English framing:
- Save time.
- Save money.
- Stop missing leads.
- Follow up faster.
- Organize files and documents.
- Automate boring office work.
- Help business owners get more done without hiring more people.

## Preferred Hero Direction

Strong preferred hero options:
- **We Build AI Workers For Your Business.**
- **Stop Busy Work. Start Saving Time.**
- **Save Time. Save Money. Let AI Do The Busy Work.**

Hero body direction:
> Barrios A2I automates the repetitive computer work that wastes your time, so you can focus on growing your business.

CTA direction:
- Book a Free Demo
- Book Meeting With Gary
- Show Us One Task You Hate Doing

Avoid overly abstract copy like:
- “Your Business. With a Nervous System.”
- “This is not automation.”
- “Operational intelligence” as the main public-facing message.

Those ideas can remain as secondary brand flavor, but the headline must be clear.

## What We Can Do For Clients

The site should specifically show broad service categories:

1. Customer Messages
   - Answer questions
   - Respond instantly
   - Never miss a customer again

2. Lead Follow-Up
   - Qualify leads
   - Chase prospects
   - Turn more leads into paying jobs

3. Scheduling
   - Book appointments
   - Send reminders
   - Reduce no-shows
   - Keep calendars organized

4. Office Tasks
   - Admin work
   - Data entry
   - Checklists
   - Reminders
   - Daily updates

5. Documents & Files
   - Search, summarize, organize, and find answers inside business files

6. Sales & Quotes
   - Prepare estimates
   - Answer pricing questions
   - Speed up quotes

7. Marketing Content
   - Create posts, ads, emails, scripts, videos, and offers

8. Reports & Insights
   - Turn data into simple reports, summaries, and smart business insights

9. Customer Support
   - Help customers 24/7
   - Collect issues
   - Send the right information

10. Forms & Intake
    - Collect the right information upfront
    - Keep intake organized

11. Follow-Ups & Reminders
    - Follow up on leads, customers, invoices, reviews, and appointments

12. Research & Decisions
    - Research, compare, analyze, and help owners make better business decisions

## Preferred Page Structure

1. Hero
   - Clear headline
   - Simple body copy
   - CTA
   - AI worker visual / robot worker / command-center visual

2. Problem
   - “Your business loses time every day.”
   - Missed messages
   - Slow follow-ups
   - Messy files
   - Wasted hours
   - Lost opportunities
   - Manual everything

3. Solution
   - “AI can handle it.”
   - Custom AI workers trained around how the client’s business actually runs

4. What We Automate
   - 8–12 specific cards
   - Keep this broad; do not narrow to only three automations

5. How It Works
   - Show us the task
   - We build the AI worker
   - You save hours every week

6. Why Businesses Choose Barrios A2I
   - Fast setup
   - Custom-built
   - Your data stays yours
   - Real ROI
   - Ongoing support
   - Always improving

7. Business Types
   - Contractors
   - Realtors
   - HVAC & plumbing
   - Auto shops
   - Home services
   - Retail stores
   - Restaurants
   - Agencies
   - Any business using a computer

8. Final CTA
   - “Let’s build your AI worker.”
   - “Show us one task you hate doing. We’ll show you how AI can handle it.”

9. Footer
   - Simple navigation
   - Clear service links
   - Contact/demo CTA

## Visual Direction

Preserve:
- Dark black/navy background
- Cyan/teal glow
- White futuristic typography
- Subtle amber/yellow accents only
- Premium command-center AI feel
- Strong cards and section separators
- HUD/neural grid energy, but less confusing

Avoid:
- Purple drift
- Bright green as a major brand color
- White section blocks that break the premium dark identity
- Cartoonish/childish style
- Too much sci-fi jargon
- Too many sub-brands in the homepage
- Technical model cards as primary selling points

## Favorite Elements From References

Keep/integrate:
- The first/current command-center version has the strongest premium visual identity.
- The AI workers version has the clearest message.
- The “What can we automate?” grid is essential.
- The “How it works” three-step row is strong.
- The “Why businesses choose Barrios A2I” row is good.
- The industry/business-types section is useful.
- The final CTA “Let’s build your AI worker” is strong.

Reject or revise:
- The overly abstract “nervous system” hero as the first headline.
- White-background automation section from one mockup; it breaks the dark brand.
- Too much purple/green icon coloring.
- Too much wording around models, tokens, RAG, and sci-fi systems before customers understand the service.

## Implementation Safety

Work in:
- Branch: feat/homepage-ai-workers-rewrite

Primary live homepage:
- public/index.html

Do not touch unless explicitly approved:
- Stripe
- billing
- auth
- Prisma schema
- middleware
- API routes
- .env
- .vercel
- DNS / IONOS

Workflow:
1. Use frontend design skill first.
2. Review this brief and image references.
3. Audit public/index.html.
4. Create a simple section plan.
5. Implement in public/index.new.html first.
6. Compare in browser with Playwright/Chrome tools.
7. Promote to public/index.html only after approval.
8. Run safe verification.
9. Commit and push branch.
10. Use Vercel preview only.
11. Do not production deploy unless Gary explicitly says: deploy production.

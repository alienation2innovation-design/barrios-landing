---
name: frontend-design
description: Create distinctive, production-grade frontend interfaces for Barrios A2I. Tech stack: shadcn-ui + Tailwind. Aesthetic: Tesla minimalism meets cyberpunk - tech-forward yet spartan with strategic color accents and Claude-like ease.
---

## Design Direction for Barrios A2I

**Core Aesthetic**: Tesla minimalism + cyberpunk accents + Claude's approachability
- Monochrome base (deep blacks, clean whites, subtle grays)
- Strategic accent color: Crystalline teal (#00CED1) or neural purple (#8B5CF6)
- Typography: Clean, technical fonts - avoid generic (no Inter, Roboto)
- Motion: Subtle, purposeful micro-interactions
- Spatial: Generous whitespace, asymmetric layouts, grid-breaking hero elements

## Technical Stack
- Tailwind CSS for utility classes
- shadcn/ui for components
- Framer Motion for animations (React) or CSS animations (vanilla)
- Google Fonts: Space Grotesk, JetBrains Mono, or Syne for headers

## Color System
```css
:root {
  --bg-primary: #0a0a0a;
  --bg-secondary: #141414;
  --bg-tertiary: #1a1a1a;
  --text-primary: #fafafa;
  --text-secondary: #a1a1aa;
  --accent-cyan: #00CED1;
  --accent-purple: #8B5CF6;
  --accent-glow: rgba(0, 206, 209, 0.15);
}
```

## Component Patterns

### Nexus Brain Chat UI
- Glass morphism panels: `bg-white/5 backdrop-blur-xl border border-white/10`
- Message bubbles with subtle glow on hover
- Typing indicator: 3 dots with staggered pulse animation
- Floating launcher: magnetic hover effect, neural pulse when active

### Cards & Panels
- Subtle border: `border border-white/5`
- Hover state: `hover:border-accent-cyan/30 hover:shadow-[0_0_30px_rgba(0,206,209,0.1)]`
- No harsh rounded corners - use `rounded-lg` max, prefer `rounded-md`

### Buttons
- Primary: Solid accent with glow on hover
- Secondary: Ghost style with border highlight
- Micro-interaction: Scale 0.98 on click, smooth color transition

## Anti-Patterns (Never Do)
- Purple gradients on white backgrounds
- Generic card grids with uniform spacing
- Overused fonts (Inter, Roboto, Arial, system-ui)
- Cookie-cutter SaaS aesthetic
- Excessive border-radius (no pill shapes except badges)
- Busy backgrounds that compete with content

## Animation Principles
- Entrance: Fade up with slight delay stagger (50-100ms between elements)
- Hover: Subtle scale (1.02 max) + glow intensify
- Click: Quick scale down (0.98) + instant feedback
- Loading: Skeleton shimmer or neural pulse pattern

---

# BARRIOS A2I BRAND OVERRIDE

For BarriosA2I.com work, this override is authoritative.

Use:
- black/navy backgrounds
- cyan/teal as the primary accent/glow
- white futuristic typography
- amber/yellow only as a subtle secondary accent

Do not use purple as a co-equal accent.
Do not introduce off-brand green as a primary accent.
Do not drift into generic purple/green AI SaaS styling.

The design goal is:
premium AI command-center + simple business-owner clarity.

Barrios A2I sells AI workers and automation systems for businesses.
The homepage must clearly explain that Barrios A2I automates repetitive computer tasks.


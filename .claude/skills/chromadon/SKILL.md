# CHROMADON v2.0 APEX - Browser Automation & Frontend Engineering
## Barrios A2I | Ralph-Powered Autonomous Agent
## For Claude Code Integration with frontend-barrios-landing

---

## IDENTITY

**CHROMADON** is Barrios A2I's autonomous browser automation and frontend engineering system.

**Trigger Phrases:**
- "use CHROMADON..."
- "CHROMADON test..."
- "CHROMADON fix..."
- "check the frontend..."
- "test this in the browser..."
- "verify the deployment..."

**When Triggered, Claude Code Must:**
1. Read this skill file for project context
2. Read `frontend-design/SKILL.md` for design patterns
3. Apply Ralph-style iteration (retry until success)
4. Use Chrome MCP tools for browser automation
5. Know exact file paths in `frontend-barrios-landing`
6. Output completion signals when done

---

## DOMAIN RESTRICTIONS (CRITICAL)

CHROMADON may ONLY navigate to these domains:

**ALLOWED:**
- ✅ barriosa2i.com
- ✅ www.barriosa2i.com
- ✅ barrios-landing.vercel.app
- ✅ localhost
- ✅ 127.0.0.1

**BLOCKED (Never navigate to):**
Before ANY navigation, check if the URL is allowed:
- If URL domain is not in ALLOWED list → REFUSE
- Say: "CHROMADON only operates on Barrios A2I properties. Cannot navigate to [domain]."

This prevents Cloudflare/CAPTCHA blocks on third-party sites.

---

## PROJECT: frontend-barrios-landing

### Locations
```
Local:       C:\Users\gary\frontend-barrios-landing
Production:  https://www.barriosa2i.com
Staging:     https://barrios-landing.vercel.app
Backend:     https://api.barriosa2i.com
Local Dev:   http://localhost:3000
```

### Tech Stack
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14 | App Router, SSR/SSG |
| TypeScript | 5.6 | Type safety |
| React | 18 | UI components |
| Tailwind CSS | 3.4 | Styling |
| Clerk | 6.36 | Authentication |
| Prisma | 5.22 | Database ORM |
| Stripe | 20.2 | Payments |
| Framer Motion | 12 | Animations |

### Brand Colors (ALWAYS USE THESE)
```css
/* Primary - Teal/Cyan Family */
--cyan-primary: #00CED1;
--cyan-light: #40E0D0;
--cyan-dark: #00B4B4;
--cyan-glow: rgba(0, 206, 209, 0.5);

/* Accent - Gold/Bronze */
--gold: #FFD700;
--bronze: #CD7F32;
--gold-glow: rgba(255, 215, 0, 0.3);

/* Backgrounds - Dark */
--bg-darkest: #030303;
--bg-dark: #0a0a0a;
--bg-card: #0f0f0f;
--bg-card-hover: #151515;
--bg-glass: rgba(0, 0, 0, 0.6);

/* Text */
--text-primary: #ffffff;
--text-secondary: #a0a0a0;
--text-muted: #666666;
```

### Logo Assets
```
Primary:    /brand/barrios-a2i-logo.png
Alt Path:   /public/logos/barrios-a2i-logo.png
CDN URL:    https://barrios-a2i-website-yvh6.vercel.app/logo.png
Small:      /brand/barrios-a2i-logo-small.png
Icon:       /brand/favicon.ico
```

---

## FILE STRUCTURE

### App Router Pages
```
app/
├── layout.tsx              # Root layout (ClerkProvider, fonts, metadata)
├── page.tsx                # Homepage
├── globals.css             # Global styles & CSS variables
├── not-found.tsx           # 404 page
│
├── (auth)/                 # Auth group (no layout)
│   ├── sign-in/[[...sign-in]]/page.tsx
│   └── sign-up/[[...sign-up]]/page.tsx
│
├── about/page.tsx
├── services/
│   ├── page.tsx            # Services list
│   └── [slug]/page.tsx     # Individual service
├── pricing/page.tsx
├── contact/page.tsx
├── chat/page.tsx           # NEXUS Chat interface
│
├── dashboard/              # Protected routes
│   ├── layout.tsx          # Dashboard layout with sidebar
│   ├── page.tsx            # Dashboard home
│   ├── projects/page.tsx
│   ├── settings/page.tsx
│   └── billing/page.tsx
│
└── api/                    # API Routes
    ├── chat/route.ts       # Chat endpoint
    ├── webhook/
    │   └── stripe/route.ts # Stripe webhooks
    └── health/route.ts     # Health check
```

### Components Library
```
components/
├── ui/                     # Base UI (shadcn/ui pattern)
│   ├── button.tsx
│   ├── card.tsx
│   ├── input.tsx
│   ├── textarea.tsx
│   ├── dialog.tsx
│   ├── dropdown-menu.tsx
│   ├── badge.tsx
│   ├── avatar.tsx
│   └── skeleton.tsx
│
├── layout/
│   ├── SiteHeader.tsx      # ⭐ MAIN HEADER - Logo, Nav
│   ├── SiteFooter.tsx      # Footer with links
│   ├── Navigation.tsx      # Nav links component
│   ├── MobileMenu.tsx      # Mobile hamburger menu
│   └── PageWrapper.tsx     # Page transition wrapper
│
├── sections/               # Homepage & landing sections
│   ├── HeroSection.tsx
│   ├── ServicesSection.tsx
│   ├── AboutSection.tsx
│   ├── TestimonialsSection.tsx
│   ├── CTASection.tsx
│   ├── PricingSection.tsx
│   ├── FAQSection.tsx
│   └── ContactSection.tsx
│
├── chat/                   # NEXUS Chat components
│   ├── ChatInterface.tsx
│   ├── ChatWindow.tsx
│   ├── MessageList.tsx
│   ├── MessageBubble.tsx
│   ├── ChatInput.tsx
│   ├── StreamingMessage.tsx
│   └── GenerativeUI/       # Generative UI cards
│       ├── CompetitorCard.tsx
│       ├── PersonaCard.tsx
│       ├── ScriptPreviewCard.tsx
│       └── ROICalculatorCard.tsx
│
├── dashboard/
│   ├── DashboardNav.tsx
│   ├── DashboardHeader.tsx
│   ├── ProjectCard.tsx
│   ├── ProjectList.tsx
│   ├── StatsWidget.tsx
│   └── UsageChart.tsx
│
├── forms/
│   ├── ContactForm.tsx
│   ├── LeadCaptureForm.tsx
│   ├── NewsletterForm.tsx
│   └── DemoRequestForm.tsx
│
├── effects/                # Visual effects & backgrounds
│   ├── NeuralLattice.tsx   # Animated neural network bg
│   ├── ParticleField.tsx   # Floating particles
│   ├── GlowOrb.tsx         # Glowing orbs
│   ├── CyberpunkGrid.tsx   # Grid lines effect
│   ├── ScanLines.tsx       # CRT scanline effect
│   └── GradientBlur.tsx    # Blur gradient shapes
│
└── shared/                 # Shared components
    ├── Logo.tsx            # Barrios A2I logo component
    ├── LoadingSpinner.tsx
    ├── ErrorBoundary.tsx
    └── SEO.tsx
```

### Utilities
```
lib/
├── utils.ts                # cn(), formatters, helpers
├── api.ts                  # API client (fetch wrappers)
├── constants.ts            # App constants, routes
├── validations.ts          # Zod schemas
├── stripe.ts               # Stripe client config
└── prisma.ts               # Prisma client singleton

hooks/
├── useChat.ts              # Chat state & actions
├── useStreaming.ts         # SSE/streaming hook
├── useAuth.ts              # Auth convenience hooks
├── useMediaQuery.ts        # Responsive breakpoint hook
├── useLocalStorage.ts      # LocalStorage hook
└── useScrollPosition.ts    # Scroll tracking hook
```

### Config Files
```
Root:
├── package.json
├── package-lock.json
├── tsconfig.json
├── tailwind.config.ts      # ⭐ Tailwind customizations
├── next.config.js
├── postcss.config.js
├── middleware.ts           # ⭐ Clerk auth middleware
├── .env.local              # Environment variables
├── .eslintrc.json
├── .prettierrc
└── components.json         # shadcn/ui config
```

---

## CODE PATTERNS

### Component Template (Client)
```tsx
// components/[category]/[ComponentName].tsx
"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface ComponentNameProps {
  className?: string;
  children?: React.ReactNode;
}

export function ComponentName({ className, children }: ComponentNameProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  return (
    <motion.div
      className={cn(
        "relative",
        className
      )}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: isVisible ? 1 : 0, y: isVisible ? 0 : 20 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      {children}
    </motion.div>
  );
}
```

### Page Template
```tsx
// app/[page]/page.tsx
import { Metadata } from "next";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SomeSection } from "@/components/sections/SomeSection";

export const metadata: Metadata = {
  title: "Page Title | Barrios A2I",
  description: "Alienation 2 Innovation - Your description here",
  openGraph: {
    title: "Page Title | Barrios A2I",
    description: "Your description here",
    images: ["/og-image.png"],
  },
};

export default function PageName() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-screen bg-[#0a0a0a]">
        <SomeSection />
      </main>
      <SiteFooter />
    </>
  );
}
```

### API Route Template
```tsx
// app/api/[route]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export async function POST(req: NextRequest) {
  try {
    // Auth check (if needed)
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Parse body
    const body = await req.json();
    
    // Validate input
    if (!body.requiredField) {
      return NextResponse.json(
        { error: "Missing required field" },
        { status: 400 }
      );
    }

    // Process request
    const result = await processRequest(body);

    // Return success
    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[API_ROUTE_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
```

---

## STYLING SYSTEM

### Cyberpunk Card
```tsx
<div className="
  relative overflow-hidden
  bg-black/60 backdrop-blur-xl
  border border-cyan-500/20
  rounded-2xl p-6
  shadow-[0_0_50px_rgba(0,206,209,0.1)]
  hover:border-cyan-500/40
  hover:shadow-[0_0_80px_rgba(0,206,209,0.2)]
  transition-all duration-500
">
  {/* Glow effect on hover */}
  <div className="
    absolute inset-0 opacity-0 group-hover:opacity-100
    bg-gradient-to-r from-cyan-500/5 via-transparent to-cyan-500/5
    transition-opacity duration-500
  " />
  
  {/* Content */}
  <div className="relative z-10">
    {/* ... */}
  </div>
</div>
```

### Glowing Text
```tsx
<h2 className="
  text-4xl md:text-5xl lg:text-6xl
  font-bold tracking-tight
  bg-gradient-to-r from-cyan-400 via-cyan-300 to-cyan-400
  bg-clip-text text-transparent
  drop-shadow-[0_0_30px_rgba(0,206,209,0.5)]
">
  Legendary Heading
</h2>
```

### CTA Button
```tsx
<motion.button
  className="
    relative px-8 py-4
    bg-gradient-to-r from-cyan-500 to-cyan-400
    text-black font-bold text-lg
    rounded-lg overflow-hidden
    shadow-[0_0_30px_rgba(0,206,209,0.3)]
    hover:shadow-[0_0_50px_rgba(0,206,209,0.5)]
    transition-shadow duration-300
  "
  whileHover={{ scale: 1.02 }}
  whileTap={{ scale: 0.98 }}
>
  {/* Shine effect */}
  <span className="
    absolute inset-0 bg-gradient-to-r
    from-transparent via-white/20 to-transparent
    translate-x-[-100%] group-hover:translate-x-[100%]
    transition-transform duration-700
  " />
  <span className="relative">Get Started</span>
</motion.button>
```

### Glass Panel
```tsx
<div className="
  bg-white/5
  backdrop-blur-md
  border border-white/10
  rounded-xl p-8
">
```

### Animation Variants
```tsx
// Fade in from bottom
const fadeInUp = {
  initial: { opacity: 0, y: 30 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] }
};

// Stagger children
const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

// Scale in
const scaleIn = {
  initial: { scale: 0.9, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  transition: { type: "spring", stiffness: 200, damping: 20 }
};

// Slide in from left
const slideInLeft = {
  initial: { x: -50, opacity: 0 },
  animate: { x: 0, opacity: 1 },
  transition: { duration: 0.5, ease: "easeOut" }
};
```

---

## CHROMADON BROWSER AUTOMATION

### Chrome MCP Tools Reference

| Tool | Usage | Purpose |
|------|-------|---------|
| `tabs_context_mcp` | `tabs_context_mcp(createIfEmpty=true)` | Get/create tab group |
| `tabs_create_mcp` | `tabs_create_mcp()` | Create new tab |
| `navigate` | `navigate(tabId, url)` | Go to URL |
| `computer` | `computer(tabId, action, ...)` | Interact with page |
| `read_page` | `read_page(tabId)` | Get page structure |
| `find` | `find(tabId, query)` | Find element by description |
| `form_input` | `form_input(tabId, ref, value)` | Fill form field |
| `get_page_text` | `get_page_text(tabId)` | Extract text |
| `read_console_messages` | `read_console_messages(tabId)` | Get console logs |
| `read_network_requests` | `read_network_requests(tabId)` | Get network activity |
| `resize_window` | `resize_window(tabId, w, h)` | Change viewport |
| `javascript_tool` | `javascript_tool(tabId, code)` | Execute JS |

### Ralph Loop Pattern
```
INITIALIZE:
  context = tabs_context_mcp(createIfEmpty=true)
  tab = tabs_create_mcp()
  tabId = tab.tabId

LOOP (max 20 iterations):
  │
  ├─► NAVIGATE
  │   navigate(tabId, targetUrl)
  │   computer(tabId, action="wait", duration=3)
  │
  ├─► OBSERVE
  │   screenshot = computer(tabId, action="screenshot")
  │   errors = read_console_messages(tabId, onlyErrors=true)
  │   page = read_page(tabId)
  │
  ├─► ACT (if needed)
  │   element = find(tabId, query="target element")
  │   computer(tabId, action="left_click", ref=element.ref)
  │   OR form_input(tabId, ref=element.ref, value="text")
  │
  ├─► VERIFY
  │   Check expected state achieved
  │   If SUCCESS → EXIT with completion signal
  │   If FAILURE → Increment iteration, try alternate
  │
  └─► iteration++

COMPLETE:
  <chromadon>TASK_COMPLETE</chromadon>
```

### Workflow: Test & Fix Component
```
1. READ PROJECT CONTEXT
   - Load this skill file
   - Load frontend-design/SKILL.md
   - Identify target component file

2. START BROWSER
   tabs_context_mcp(createIfEmpty=true)
   tabId = tabs_create_mcp().tabId

3. NAVIGATE TO PAGE
   navigate(tabId, "http://localhost:3000/target-page")
   computer(tabId, action="wait", duration=3)

4. DIAGNOSE ISSUE
   screenshot = computer(tabId, action="screenshot")
   errors = read_console_messages(tabId, onlyErrors=true)
   page = read_page(tabId)
   
   IDENTIFY:
   - Visual bugs (wrong colors, spacing, layout)
   - Console errors (React errors, undefined)
   - Missing elements
   - Broken interactions

5. FIX IN CODE
   - Edit component file following patterns in this skill
   - Apply brand colors from this skill
   - Use Framer Motion for animations
   - Follow TypeScript conventions

6. VERIFY FIX (Ralph Loop)
   REPEAT until fixed or max iterations:
     navigate(tabId, url)  # Refresh
     computer(action="wait", duration=2)
     computer(action="screenshot")
     errors = read_console_messages(onlyErrors=true)
     
     IF no errors AND visual correct:
       <chromadon>FIX_COMPLETE</chromadon>
       EXIT
     ELSE:
       Log issue, try alternate fix

7. COMMIT
   git add -A
   git commit -m "CHROMADON: Fixed [description]"
```

### Workflow: Verify Deployment
```
1. NAVIGATE TO PRODUCTION
   navigate(tabId, "https://www.barriosa2i.com")
   computer(action="wait", duration=5)

2. CHECK HOMEPAGE
   screenshot = computer(action="screenshot")
   errors = read_console_messages(onlyErrors=true)
   requests = read_network_requests()
   
   ASSERT:
   - No console errors
   - No failed network requests
   - Page renders correctly

3. TEST NAVIGATION
   FOR each main nav link:
     find(query="nav link for [page]")
     click the link
     wait for page load
     screenshot
     verify content loads

4. TEST CRITICAL FLOWS
   - Auth flow (if applicable)
   - Contact form submission
   - Chat interface loads
   - Dashboard accessible (if logged in)

5. TEST RESPONSIVE
   resize_window(375, 812)   # Mobile
   screenshot + verify
   
   resize_window(768, 1024)  # Tablet
   screenshot + verify
   
   resize_window(1920, 1080) # Desktop
   screenshot + verify

6. REPORT
   <chromadon>DEPLOYMENT_VERIFIED</chromadon>
   OR
   <chromadon>DEPLOYMENT_ISSUES: [list issues]</chromadon>
```

---

## COMMON FIXES

### Fix: "use client" Missing
```tsx
// ERROR: useState is not defined
// FIX: Add directive at top of file
"use client";

import { useState } from "react";
```

### Fix: Wrong Colors
```tsx
// WRONG - Generic colors
className="text-blue-500 bg-gray-800"

// RIGHT - Brand colors
className="text-cyan-400 bg-[#0a0a0a]"
// OR use CSS variables
style={{ color: 'var(--cyan-primary)' }}
```

### Fix: No Animation
```tsx
// WRONG - Static element
<div className="card">

// RIGHT - Animated with Framer Motion
<motion.div
  className="card"
  initial={{ opacity: 0, y: 20 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.5 }}
>
```

### Fix: API Call to Backend
```tsx
// WRONG - Relative path won't work
const response = await fetch('/api/genesis/chat');

// RIGHT - Absolute URL to GENESIS backend
const GENESIS_URL = "https://api.barriosa2i.com";
const response = await fetch(`${GENESIS_URL}/api/genesis/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});
```

### Fix: Image Not Loading
```tsx
// WRONG - Wrong path
<img src="/logo.png" />

// RIGHT - Correct path
<img src="/brand/barrios-a2i-logo.png" alt="Barrios A2I" />

// BEST - Next.js Image component
import Image from "next/image";
<Image
  src="/brand/barrios-a2i-logo.png"
  alt="Barrios A2I"
  width={200}
  height={50}
  priority
/>
```

### Fix: Hydration Error
```tsx
// ERROR: Text content does not match server-rendered HTML
// CAUSE: Using browser-only APIs during SSR

// FIX: Use useEffect for client-only code
"use client";
import { useState, useEffect } from "react";

export function Component() {
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);
  
  if (!mounted) return null; // Or skeleton
  
  return <div>{window.innerWidth}</div>;
}
```

### Fix: Clerk Auth Not Working
```tsx
// Check 1: middleware.ts exists at root
// middleware.ts
import { clerkMiddleware } from "@clerk/nextjs/server";
export default clerkMiddleware();
export const config = {
  matcher: ["/((?!.*\\..*|_next).*)", "/", "/(api|trpc)(.*)"],
};

// Check 2: ClerkProvider in layout
// app/layout.tsx
import { ClerkProvider } from "@clerk/nextjs";

export default function RootLayout({ children }) {
  return (
    <ClerkProvider>
      <html><body>{children}</body></html>
    </ClerkProvider>
  );
}

// Check 3: Environment variables set
// .env.local
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

---

## COMPLETION SIGNALS

Output these when tasks complete:

| Signal | When |
|--------|------|
| `<chromadon>FIX_COMPLETE</chromadon>` | Code fix verified working |
| `<chromadon>TEST_PASS</chromadon>` | Test passed successfully |
| `<chromadon>BUILD_SUCCESS</chromadon>` | npm run build succeeded |
| `<chromadon>DEPLOYMENT_VERIFIED</chromadon>` | Production site working |
| `<chromadon>RESPONSIVE_VERIFIED</chromadon>` | All viewports working |
| `<chromadon>FORM_SUBMITTED</chromadon>` | Form automation done |
| `<chromadon>SCRAPE_COMPLETE</chromadon>` | Data extraction done |
| `<chromadon>TASK_COMPLETE</chromadon>` | Generic success |
| `<chromadon>TASK_FAILED: [reason]</chromadon>` | Could not complete |

---

## ANTI-PATTERNS

| ❌ DON'T | ✅ DO |
|---------|------|
| One-shot browser tests | Ralph loop until verified |
| Skip screenshots | Screenshot every state change |
| Ignore console errors | Always check `read_console_messages` |
| Use generic colors | Use brand colors from this skill |
| Use Inter/Arial fonts | Use distinctive fonts |
| Hardcode API URLs | Use environment variables |
| Forget "use client" | Add for any interactive component |
| Skip mobile testing | Always test responsive |
| Assume API works | Check network requests |

---

*CHROMADON v2.0 APEX | Ralph-Powered Browser Automation*
*Barrios A2I | Alienation 2 Innovation*
*Integrates with: frontend-design/SKILL.md*

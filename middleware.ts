import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';

// Define public routes that don't require authentication
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/forgot-password(.*)',
  '/api/webhooks/(.*)',
  '/api/nexus/(.*)',
  '/api/checkout/(.*)',
  '/api/checkout/nexus',
  '/api/checkout/nexus/(.*)',
  '/api/commercial-request(.*)',
  '/api/mulligan(.*)',
  '/mulligan(.*)',  // Feedback page for email links
  '/nexus-personal(.*)',
  '/contact(.*)',
  '/founder(.*)',
  '/creative-director(.*)',
  '/command-center(.*)',
  '/checkout(.*)',
  '/thanks(.*)',
  '/privacy(.*)',
  '/terms(.*)',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await (auth as any).protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files (including video files)
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|mp4|webm|ogg|mov|avi)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtectedRoute = createRouteMatcher([
  "/routines(.*)",
  "/settings(.*)",
  "/posts/new",
  "/posts/(.*)/edit",
  "/saved(.*)",
  "/orgs/create",
  "/orgs/(.*)/settings",
  "/messages(.*)",

  // Migrated Convex routes below call queries/mutations that require a
  // completed Clerk-backed user profile. Redirect unauthenticated requests
  // through Clerk before Convex can surface UNAUTHORIZED errors in the UI.
  // Public competition pages such as listing/detail/entries/results/live stay
  // intentionally omitted.
  "/partners(.*)",
  "/competitions/create",
  "/competitions/(.*)/dashboard(.*)",
  "/competitions/(.*)/register(.*)",
  "/competitions/(.*)/add-drop",
  "/competitions/(.*)/feedback",
  "/competitions/(.*)/tba",
  "/competitions/(.*)/team-match",
  "/orgs/(.*)/competitions/(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals, static files, and Sentry tunnel route
    "/((?!monitoring|_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

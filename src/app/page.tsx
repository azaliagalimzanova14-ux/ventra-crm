/**
 * Root route (/).
 * Middleware (src/middleware.ts) redirects this path to /dashboard or /login
 * before the page ever renders. This component is a silent fallback only.
 */
export default function Home() {
  return null;
}

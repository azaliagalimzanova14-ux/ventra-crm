/**
 * src/lib/analytics.ts
 *
 * Client-side analytics helper.
 * Fire-and-forget — never throws, never blocks UI.
 *
 * Usage:
 *   import { trackEvent } from "@/lib/analytics";
 *   trackEvent("client_created", { client_id: id });
 */

export type AnalyticsEventName =
  | "conversation_opened"
  | "message_sent"
  | "client_created"
  | "deal_created"
  | "task_completed"
  | "ai_used"
  | "feedback_submitted"
  | "demo_loaded"
  | "onboarding_step_completed";

/**
 * Send a product analytics event to the server.
 * Safe to call at any time — silently ignores errors.
 */
export function trackEvent(
  event:       AnalyticsEventName,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  properties?: Record<string, any>,
): void {
  if (typeof window === "undefined") return;

  void fetch("/api/analytics/event", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body:    JSON.stringify({ event, properties }),
    // keepalive allows the request to outlive page unloads
    keepalive: true,
  }).catch(() => { /* silent */ });
}

/**
 * Report a client-side error to the server monitoring endpoint.
 * Called from error boundaries and global window.onerror.
 */
export function reportError(
  error: string,
  options?: { page?: string; stack?: string },
): void {
  if (typeof window === "undefined") return;

  void fetch("/api/errors", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body:    JSON.stringify({
      error: error.slice(0, 2000),
      page:  options?.page  ?? (typeof window !== "undefined" ? window.location.pathname : undefined),
      stack: options?.stack?.slice(0, 5000),
    }),
    keepalive: true,
  }).catch(() => { /* silent */ });
}

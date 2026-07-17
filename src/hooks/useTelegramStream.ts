"use client";

/**
 * useTelegramStream
 *
 * React hook that subscribes to the Telegram SSE stream for a workspace.
 * Replaces the 3-second polling interval in the Inbox page with true server
 * push — messages appear in the UI the moment the webhook handler saves them.
 *
 * Features:
 *   • Zero-latency delivery: SSE push from webhook → EventBus → client
 *   • Initial snapshot: server sends the full conversation list on connect
 *   • Auto-reconnect: EventSource retries automatically on network blip
 *   • Exponential backoff: manual reconnect guard for server-side errors
 *   • Graceful degradation: `status` lets the UI show a connection indicator
 *   • Cleanup: EventSource is closed on unmount
 *
 * @param workspaceId  Workspace to subscribe to (default: "default")
 * @param enabled      Set to false to pause the connection (e.g. when tab is hidden)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import type { TelegramConversation }                 from "@/lib/telegram-types";
import type { TelegramStreamEvent }                  from "@/lib/telegram-event-bus";

export type StreamStatus = "connecting" | "open" | "closed" | "error";

export interface UseTelegramStreamResult {
  conversations: TelegramConversation[];
  status:        StreamStatus;
  /** Call to force-reconnect after a user-initiated action (e.g. connect bot) */
  reconnect:     () => void;
}

// Backoff: 1 s → 2 s → 4 s → 8 s → 16 s (cap)
const MAX_BACKOFF_MS = 16_000;

export function useTelegramStream(
  workspaceId: string = "default",
  enabled:     boolean = true,
): UseTelegramStreamResult {
  const [conversations, setConversations] = useState<TelegramConversation[]>([]);
  const [status,        setStatus]        = useState<StreamStatus>("connecting");
  const [generation,    setGeneration]    = useState(0);  // bump to force reconnect

  const esRef        = useRef<EventSource | null>(null);
  const backoffRef   = useRef<number>(1_000);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reconnect = useCallback(() => {
    backoffRef.current = 1_000;  // reset backoff on manual reconnect
    setGeneration((g) => g + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus("closed");
      return;
    }

    // Close any existing connection before opening a new one
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    setStatus("connecting");

    const url = `/api/integrations/telegram/stream/${workspaceId}`;
    const es  = new EventSource(url);
    esRef.current = es;

    // ── Handle conversation_update events ─────────────────────────────────
    es.addEventListener("conversation_update", (e: MessageEvent<string>) => {
      try {
        const payload = JSON.parse(e.data) as TelegramStreamEvent;
        if (payload.type === "conversation_update") {
          setConversations(payload.conversations);
        }
      } catch { /* malformed event — ignore */ }
    });

    es.onopen = () => {
      setStatus("open");
      backoffRef.current = 1_000;  // reset backoff on successful open
    };

    es.onerror = () => {
      setStatus("error");
      es.close();
      esRef.current = null;

      // Schedule reconnect with backoff
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);

      retryTimerRef.current = setTimeout(() => {
        setGeneration((g) => g + 1);
      }, delay);
    };

    return () => {
      es.close();
      esRef.current = null;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [workspaceId, enabled, generation]);

  return { conversations, status, reconnect };
}

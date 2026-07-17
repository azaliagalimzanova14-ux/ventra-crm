/**
 * src/lib/telegram-event-bus.ts
 *
 * In-memory pub/sub for real-time Telegram message delivery.
 *
 * Architecture:
 *   • Webhook handler calls publish() after each upsert — O(1), sync.
 *   • SSE endpoint calls subscribe() on connect and unsubscribe() on disconnect.
 *   • One EventEmitter per workspaceId; the singleton map lives on the global
 *     object so it survives Next.js module hot-reloads in development.
 *
 * Topology:
 *   SQLite write → webhook → publish() → EventEmitter → N SSE clients
 *
 * Multi-workspace:
 *   Each workspace has an isolated emitter keyed by workspaceId.
 *   A subscriber for workspace "acme" never receives events for "default".
 *
 * Scalability note:
 *   This is an in-process bus — correct for SQLite deployments (single writer).
 *   For multi-process / multi-instance deployments, replace with Redis Pub/Sub
 *   while keeping this module's interface unchanged.
 */

import { EventEmitter } from "node:events";
import type { TelegramConversation } from "./telegram-types";

// ── Event payload ─────────────────────────────────────────────────────────────

export interface TelegramStreamEvent {
  type:          "conversation_update";
  workspaceId:   string;
  conversations: TelegramConversation[];
  timestamp:     string;   // ISO 8601
}

// ── Singleton global map ──────────────────────────────────────────────────────

const GLOBAL_KEY = "__ventraTelegramEventBus__";

type BusMap = Map<string, EventEmitter>;

function getBusMap(): BusMap {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, EventEmitter>();
  }
  return g[GLOBAL_KEY] as BusMap;
}

function getEmitter(workspaceId: string): EventEmitter {
  const map = getBusMap();
  if (!map.has(workspaceId)) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100); // support up to 100 concurrent SSE clients per workspace
    map.set(workspaceId, emitter);
  }
  return map.get(workspaceId)!;
}

// ── Public API ─────────────────────────────────────────────────────────────────

const EVENT_NAME = "update";

export type TelegramEventCallback = (event: TelegramStreamEvent) => void;

/**
 * Publish a conversation_update event to all SSE clients connected to the
 * given workspace. Called by webhook handlers after each successful upsert.
 */
export function publishTelegramEvent(
  workspaceId:   string,
  conversations: TelegramConversation[],
): void {
  const event: TelegramStreamEvent = {
    type:          "conversation_update",
    workspaceId,
    conversations,
    timestamp:     new Date().toISOString(),
  };
  getEmitter(workspaceId).emit(EVENT_NAME, event);
}

/**
 * Subscribe to events for a workspace.
 * Returns an unsubscribe function — always call it when the SSE connection closes.
 */
export function subscribeTelegramEvents(
  workspaceId: string,
  callback:    TelegramEventCallback,
): () => void {
  const emitter = getEmitter(workspaceId);
  emitter.on(EVENT_NAME, callback);
  return () => emitter.off(EVENT_NAME, callback);
}

/** Return the number of active listeners for a workspace (diagnostics). */
export function listenerCount(workspaceId: string): number {
  return getEmitter(workspaceId).listenerCount(EVENT_NAME);
}

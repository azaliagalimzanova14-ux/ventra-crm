/**
 * src/lib/personal-event-bus.ts
 *
 * In-memory pub/sub for real-time personal Telegram account message delivery.
 * Same pattern as telegram-event-bus.ts but carries PersonalInboxEvent payloads
 * instead of bot conversation arrays.
 *
 * Scalability note: single-process only (same as bot bus).
 */

import { EventEmitter } from "node:events";
import type { PersonalDialog, PersonalMessage } from "./mtproto-types";

// ── Event payload ─────────────────────────────────────────────────────────────

export interface PersonalStreamEvent {
  type:        "new_message" | "dialog_update";
  workspaceId: string;
  dialog:      PersonalDialog;
  message:     PersonalMessage;
  timestamp:   string;
}

// ── Singleton global map ──────────────────────────────────────────────────────

const GLOBAL_KEY = "__ventraPersonalEventBus__";

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
    emitter.setMaxListeners(50);
    map.set(workspaceId, emitter);
  }
  return map.get(workspaceId)!;
}

// ── Public API ────────────────────────────────────────────────────────────────

const EVENT_NAME = "personal_update";

export type PersonalEventCallback = (event: PersonalStreamEvent) => void;

export function publishPersonalEvent(
  workspaceId: string,
  payload: Omit<PersonalStreamEvent, "workspaceId" | "timestamp">,
): void {
  const event: PersonalStreamEvent = {
    ...payload,
    workspaceId,
    timestamp: new Date().toISOString(),
  };
  getEmitter(workspaceId).emit(EVENT_NAME, event);
}

export function subscribePersonalEvents(
  workspaceId: string,
  callback:    PersonalEventCallback,
): () => void {
  const emitter = getEmitter(workspaceId);
  emitter.on(EVENT_NAME, callback);
  return () => emitter.off(EVENT_NAME, callback);
}

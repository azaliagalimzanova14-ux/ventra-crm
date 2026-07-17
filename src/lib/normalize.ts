/**
 * Shared data normalization helpers.
 * Single source of truth — import from here, never re-define inline.
 */

import type { Client } from "./types";

/** Fill in any optional fields that may be missing from older localStorage records. */
export function normalizeClient(c: Client): Client {
  return {
    ...c,
    avatar:       c.avatar       || (c.name ?? "?").trim().slice(0, 2).toUpperCase(),
    totalValue:   typeof c.totalValue   === "number" ? c.totalValue   : 0,
    projectCount: typeof c.projectCount === "number" ? c.projectCount : 0,
    tags:         Array.isArray(c.tags) ? c.tags : [],
    location:     c.location    ?? "",
    lastContact:  c.lastContact ?? new Date().toISOString().split("T")[0],
    joinedAt:     c.joinedAt    ?? new Date().toISOString().split("T")[0],
    phone:        c.phone       ?? "",
    industry:     c.industry    ?? "",
    // Ownership fields — undefined if not set (no default needed)
    ownerId:        c.ownerId,
    ownerName:      c.ownerName,
    ownerAvatar:    c.ownerAvatar,
    assignedId:     c.assignedId,
    assignedName:   c.assignedName,
    assignedAvatar: c.assignedAvatar,
    teamLabel:      c.teamLabel,
  };
}

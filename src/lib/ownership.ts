/**
 * Client ownership & assignment helpers.
 *
 * Wraps team member lookups + client storage mutations + activity logging.
 * All mutations write through to localStorage (DEV ONLY) via storage.ts.
 */

import { getTeamMembers, type TeamMember } from "./team";
import { getClients, saveClients, logActivity } from "./storage";

// ── Assignee options ───────────────────────────────────────────────────────────

/**
 * Returns all active team members as potential owners / managers.
 * Includes invited members so recently-added users can be assigned immediately.
 */
export function getAssignableMembers(): TeamMember[] {
  return getTeamMembers().filter((m) => m.status !== "inactive");
}

// ── Assign manager ─────────────────────────────────────────────────────────────

/**
 * Assigns an account manager to a client.
 * Logs the change to the activity feed.
 * Pass `null` to clear the assignment.
 */
export function assignClient(
  clientId:  string,
  member:    TeamMember | null,
  actorName: string,
): void {
  const clients = getClients();
  const client  = clients.find((c) => c.id === clientId);
  if (!client) return;

  const updated = clients.map((c) =>
    c.id === clientId
      ? {
          ...c,
          assignedId:     member?.id     ?? undefined,
          assignedName:   member?.name   ?? undefined,
          assignedAvatar: member?.avatar ?? undefined,
        }
      : c,
  );
  saveClients(updated);

  const target = member?.name ?? "no one";
  logActivity({
    type:        "client_updated",
    title:       `${client.name} assigned to ${target}`,
    description: member
      ? `${actorName} assigned ${client.name} to ${member.name}`
      : `${actorName} cleared assignment for ${client.name}`,
    avatar: client.avatar,
  });
}

// ── Transfer ownership ────────────────────────────────────────────────────────

/**
 * Transfers ownership of a client to another team member.
 * Logs the transfer to the activity feed.
 */
export function transferOwnership(
  clientId:  string,
  member:    TeamMember,
  actorName: string,
): void {
  const clients = getClients();
  const client  = clients.find((c) => c.id === clientId);
  if (!client) return;

  const prevOwner = client.ownerName ?? "Unassigned";

  const updated = clients.map((c) =>
    c.id === clientId
      ? {
          ...c,
          ownerId:     member.id,
          ownerName:   member.name,
          ownerAvatar: member.avatar,
        }
      : c,
  );
  saveClients(updated);

  logActivity({
    type:        "client_updated",
    title:       `${client.name} ownership transferred`,
    description: `${actorName} transferred ownership from ${prevOwner} to ${member.name}`,
    avatar: client.avatar,
  });
}

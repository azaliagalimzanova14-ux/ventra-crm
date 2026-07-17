"use client";

/**
 * src/context/team-context.tsx
 *
 * Team Provider — Milestone 4
 *
 * Exposes workspace member data to the React tree.
 * Architecture is prepared for:
 *   - Invitations (member.status = "invited")
 *   - Task ownership (members[].id as foreign key)
 *   - Conversation ownership (assign conversations to member IDs)
 *   - Employee assignments
 *
 * The provider re-fetches when the workspace switches (via workspaceId change).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useWorkspace } from "@/context/workspace-context";
import { useAuth }      from "@/context/auth-context";
import type { MemberRole } from "@/lib/permissions";

// ── Shapes ────────────────────────────────────────────────────────────────────

/** A fully resolved team member suitable for UI display and data binding. */
export interface TeamMember {
  /** workspace_members.id — use as FK for task/conversation ownership */
  id:           string;
  /** users.id (null if the member hasn't created an account yet) */
  userId:       string | null;
  email:        string;
  /**
   * Resolved display name:
   *   1. user.name (if linked)
   *   2. workspace_members.display_name (if set by the inviter)
   *   3. email prefix as fallback
   */
  name:         string;
  avatarUrl:    string | null;
  role:         MemberRole;
  /** "active" | "invited" | "inactive" */
  status:       string;
  invitedAt:    string;
  joinedAt:     string | null;
  /** True if this member record belongs to the currently logged-in user. */
  isCurrentUser: boolean;
}

// ── Context type ──────────────────────────────────────────────────────────────

interface TeamContextValue {
  /** All workspace members (active + invited + inactive). */
  members:        TeamMember[];
  /** The logged-in user's own membership record for the current workspace. */
  currentMember:  TeamMember | null;
  loading:        boolean;
  /** Re-fetch team from server. Call after any add/edit/remove operation. */
  refreshMembers: () => Promise<void>;
}

// ── API response shape ────────────────────────────────────────────────────────

interface ApiTeamMember {
  id:          string;
  userId:      string | null;
  email:       string;
  name:        string;
  avatarUrl:   string | null;
  role:        string;
  status:      string;
  invitedAt:   string;
  joinedAt:    string | null;
}

// ── Context ───────────────────────────────────────────────────────────────────

const TeamContext = createContext<TeamContextValue>({
  members:        [],
  currentMember:  null,
  loading:        true,
  refreshMembers: async () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function TeamProvider({ children }: { children: ReactNode }) {
  const { workspaceId } = useWorkspace();
  const { sessionUser } = useAuth();

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchMembers = useCallback(async (): Promise<void> => {
    if (!workspaceId) {
      setMembers([]);
      setLoading(false);
      return;
    }
    try {
      const res  = await fetch("/api/team", { credentials: "include" });
      if (!res.ok) { setMembers([]); return; }

      const data = await res.json() as { members: ApiTeamMember[] };

      const resolved: TeamMember[] = data.members.map((m) => ({
        id:            m.id,
        userId:        m.userId,
        email:         m.email,
        name:          m.name,
        avatarUrl:     m.avatarUrl,
        role:          m.role as MemberRole,
        status:        m.status,
        invitedAt:     m.invitedAt,
        joinedAt:      m.joinedAt,
        isCurrentUser: m.userId === sessionUser?.id,
      }));

      setMembers(resolved);
    } catch {
      setMembers([]);
    }
  }, [workspaceId, sessionUser?.id]);

  const refreshMembers = useCallback(async (): Promise<void> => {
    await fetchMembers();
  }, [fetchMembers]);

  // Hydrate on mount and when workspace changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      await fetchMembers();
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [fetchMembers]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const currentMember = members.find((m) => m.isCurrentUser) ?? null;

  return (
    <TeamContext.Provider value={{ members, currentMember, loading, refreshMembers }}>
      {children}
    </TeamContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useTeam(): TeamContextValue {
  return useContext(TeamContext);
}

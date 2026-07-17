"use client";

/**
 * src/context/auth-context.tsx
 *
 * Session-aware authentication context.
 *
 * Architecture
 * ────────────
 * SessionProvider
 *   - On mount: fetches GET /api/auth/me to hydrate state from the server.
 *   - login()    → POST /api/auth/login   → sets cookie, updates state
 *   - register() → POST /api/auth/register → sets cookie, updates state
 *   - logout()   → POST /api/auth/logout  → clears cookie, clears state
 *
 * Backward compatibility
 * ──────────────────────
 * All existing components call useAuth() and expect:
 *   { user: User | null, loading, login, register, logout }
 *
 * The legacy User shape { id, name, email, company, role } is synthesised
 * from the API response: company ← workspace.name, role ← membership.role.
 *
 * New fields are also exposed for Block 1+ consumers:
 *   sessionUser, workspace, membership
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/types";

// ── Session data shapes ───────────────────────────────────────────────────────

export interface SessionUser {
  id:        string;
  name:      string;
  email:     string;
  avatarUrl: string | null;
  timezone:  string;
  locale:    string;
}

export interface SessionWorkspace {
  id:       string;
  name:     string;
  slug:     string;
  plan:     string;
  settings: Record<string, unknown>;
}

export interface SessionMembership {
  id:     string;
  role:   string;
  status: string;
}

interface SessionData {
  user:       SessionUser;
  workspace:  SessionWorkspace;
  membership: SessionMembership;
}

// ── Context type ──────────────────────────────────────────────────────────────

interface AuthContextValue {
  /** Legacy User shape — synthesised for backward compat. */
  user:       User | null;
  loading:    boolean;

  /** Full session data (new — use these in Block 1+ code). */
  sessionUser:  SessionUser   | null;
  workspace:    SessionWorkspace | null;
  membership:   SessionMembership | null;

  login:    (email: string, password: string) => Promise<string | null>;
  register: (data: {
    name:      string;
    email:     string;
    password:  string;
    /** Maps to workspace name on the API side. */
    company:   string;
  }) => Promise<string | null>;
  logout:   () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Converts new session data to the legacy User shape expected by existing components. */
function toCompatUser(data: SessionData): User {
  return {
    id:      data.user.id,
    name:    data.user.name,
    email:   data.user.email,
    company: data.workspace.name,
    role:    data.membership.role,
  };
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [session,  setSession]  = useState<SessionData | null>(null);
  const [loading,  setLoading]  = useState(true);

  // ── Hydrate on mount ───────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    async function fetchMe() {
      try {
        const res = await fetch("/api/auth/me", { credentials: "include" });
        if (!cancelled) {
          if (res.ok) {
            const data = await res.json() as SessionData;
            setSession(data);
          } else {
            setSession(null);
          }
        }
      } catch {
        if (!cancelled) setSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void fetchMe();
    return () => { cancelled = true; };
  }, []);

  // ── Actions ────────────────────────────────────────────────────────────────

  const login = useCallback(
    async (email: string, password: string): Promise<string | null> => {
      try {
        const res = await fetch("/api/auth/login", {
          method:      "POST",
          headers:     { "Content-Type": "application/json" },
          credentials: "include",
          body:        JSON.stringify({ email, password }),
        });
        const data = await res.json() as SessionData & { error?: string };

        if (!res.ok) return data.error ?? "Login failed";

        setSession(data);
        router.push("/dashboard");
        return null;
      } catch {
        return "Network error. Please try again.";
      }
    },
    [router],
  );

  const register = useCallback(
    async (data: {
      name:     string;
      email:    string;
      password: string;
      company:  string;
    }): Promise<string | null> => {
      try {
        const res = await fetch("/api/auth/register", {
          method:      "POST",
          headers:     { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            name:          data.name,
            email:         data.email,
            password:      data.password,
            workspaceName: data.company,   // 'company' field maps to workspace name
          }),
        });
        const json = await res.json() as SessionData & { error?: string };

        if (!res.ok) return json.error ?? "Registration failed";

        setSession(json);
        router.push("/dashboard");
        return null;
      } catch {
        return "Network error. Please try again.";
      }
    },
    [router],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method:      "POST",
        credentials: "include",
      });
    } catch {
      // Best-effort; clear state regardless
    }
    setSession(null);
    router.push("/login");
  }, [router]);

  // ── Derived values ─────────────────────────────────────────────────────────

  const compatUser = session ? toCompatUser(session) : null;

  return (
    <AuthContext.Provider
      value={{
        user:        compatUser,
        loading,
        sessionUser: session?.user       ?? null,
        workspace:   session?.workspace  ?? null,
        membership:  session?.membership ?? null,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

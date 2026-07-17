"use client";

/**
 * /invite/[token] — Public invitation acceptance page.
 *
 * Lives outside (app)/(auth) route groups so it uses only the root layout
 * (ThemeProvider + LanguageProvider + AuthProvider).
 *
 * Two states:
 *  - Logged in: show "Accept invitation" button
 *  - Not logged in: show name + password registration form
 */

import { useState, useEffect, use } from "react";
import { useRouter }                 from "next/navigation";
import { useAuth }                   from "@/context/auth-context";
import { Loader2, Building2, ShieldCheck, AlertTriangle } from "lucide-react";
import { cn }                        from "@/lib/utils";

// ── Role display labels ───────────────────────────────────────────────────────

const ROLE_LABELS: Record<string, string> = {
  owner:         "Owner",
  admin:         "Admin",
  team_lead:     "Manager",
  sales_manager: "Sales",
  support:       "Support",
};

// ── Types ─────────────────────────────────────────────────────────────────────

interface InviteData {
  invitation: {
    id:        string;
    email:     string;
    role:      string;
    status:    "pending" | "accepted" | "revoked" | "expired";
    expiresAt: string;
  };
  workspace: { id: string; name: string } | null;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token }           = use(params);
  const { user, loading: authLoading } = useAuth();
  const router              = useRouter();

  const [invite,      setInvite]      = useState<InviteData | null>(null);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const [fetching,    setFetching]    = useState(true);

  const [form,        setForm]        = useState({ name: "", password: "" });
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Load invitation details ─────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      try {
        const res  = await fetch(`/api/invitations/validate?token=${token}`);
        const data = await res.json() as InviteData & { error?: string };
        if (!res.ok || data.error) {
          setFetchError(data.error ?? "Failed to load invitation");
        } else {
          setInvite(data);
        }
      } catch {
        setFetchError("Network error. Please check your connection.");
      } finally {
        setFetching(false);
      }
    }
    void load();
  }, [token]);

  // ── Accept (for logged-in user) ─────────────────────────────────────────────

  async function handleAccept() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res  = await fetch("/api/invitations/accept", {
        method:      "POST",
        headers:     { "Content-Type": "application/json" },
        credentials: "include",
        body:        JSON.stringify({ token }),
      });
      const data = await res.json() as { error?: string; workspace?: { id: string; name: string } };
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to accept invitation");
      } else {
        // Redirect to dashboard — workspace is already set via session
        router.replace("/dashboard");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Register + accept (for new user) ────────────────────────────────────────

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setSubmitError("Name is required"); return; }
    if (!form.password)    { setSubmitError("Password is required"); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res  = await fetch("/api/invitations/accept", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, name: form.name.trim(), password: form.password }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) {
        setSubmitError(data.error ?? "Failed to create account");
      } else {
        router.replace("/dashboard");
      }
    } catch {
      setSubmitError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render: loading ─────────────────────────────────────────────────────────

  if (fetching || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)]">
        <Loader2 size={28} className="animate-spin text-[var(--color-fg-faint)]" />
      </div>
    );
  }

  // ── Render: error / invalid token ───────────────────────────────────────────

  if (fetchError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-red-50 border border-red-100 flex items-center justify-center mx-auto">
            <AlertTriangle size={24} className="text-red-400" />
          </div>
          <h1 className="text-[20px] font-bold text-[var(--color-fg)]">Invitation not valid</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)] leading-relaxed">
            {fetchError ?? "This invitation link is no longer valid."}
          </p>
          <button
            onClick={() => router.replace("/login")}
            className="text-[13px] font-medium text-[var(--color-accent)] hover:underline"
          >
            Go to login →
          </button>
        </div>
      </div>
    );
  }

  // ── Render: expired / used / revoked ────────────────────────────────────────

  if (invite.invitation.status !== "pending") {
    const labels: Record<string, string> = {
      accepted: "This invitation has already been accepted.",
      revoked:  "This invitation has been cancelled.",
      expired:  "This invitation has expired.",
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] p-4">
        <div className="w-full max-w-sm text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center mx-auto">
            <AlertTriangle size={24} className="text-amber-400" />
          </div>
          <h1 className="text-[20px] font-bold text-[var(--color-fg)]">Invitation unavailable</h1>
          <p className="text-[13px] text-[var(--color-fg-muted)]">
            {labels[invite.invitation.status] ?? "This invitation is no longer valid."}
          </p>
          <button
            onClick={() => router.replace(user ? "/dashboard" : "/login")}
            className="text-[13px] font-medium text-[var(--color-accent)] hover:underline"
          >
            {user ? "Go to dashboard →" : "Go to login →"}
          </button>
        </div>
      </div>
    );
  }

  // ── Render: logged-in accept flow ───────────────────────────────────────────

  const workspaceName = invite.workspace?.name ?? "a workspace";
  const roleLabel     = ROLE_LABELS[invite.invitation.role] ?? invite.invitation.role;

  if (user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] p-4">
        <div className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-lg overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-7 pb-5 text-center border-b border-[var(--color-border)]/60">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent-subtle)] flex items-center justify-center mx-auto mb-4">
              <Building2 size={24} className="text-[var(--color-accent)]" />
            </div>
            <h1 className="text-[20px] font-bold text-[var(--color-fg)]">You&apos;ve been invited</h1>
            <p className="mt-1.5 text-[13px] text-[var(--color-fg-muted)] leading-relaxed">
              Join <span className="font-semibold text-[var(--color-fg)]">{workspaceName}</span>{" "}
              as a <span className="font-semibold text-[var(--color-fg)]">{roleLabel}</span>
            </p>
          </div>

          {/* User info */}
          <div className="px-6 py-4 border-b border-[var(--color-border)]/60">
            <p className="text-[11px] font-semibold text-[var(--color-fg-faint)] uppercase tracking-wider mb-2">
              Accepting as
            </p>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-white text-[13px] font-bold flex-shrink-0">
                {user.name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="text-[13px] font-semibold text-[var(--color-fg)]">{user.name}</p>
                <p className="text-[11px] text-[var(--color-fg-faint)]">{user.email}</p>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="px-6 py-5 space-y-3">
            {submitError && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
                {submitError}
              </p>
            )}
            <button
              onClick={() => { void handleAccept(); }}
              disabled={submitting}
              className="w-full h-10 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Accept invitation
            </button>
            <button
              onClick={() => router.replace("/dashboard")}
              className="w-full h-9 rounded-xl border border-[var(--color-border)] text-[13px] font-medium text-[var(--color-fg-muted)] hover:text-[var(--color-fg)] transition-colors"
            >
              Decline
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: new user registration flow ──────────────────────────────────────

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-canvas)] p-4">
      <div className="w-full max-w-sm bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-7 pb-5 text-center border-b border-[var(--color-border)]/60">
          <div className="w-14 h-14 rounded-2xl bg-[var(--color-accent-subtle)] flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={24} className="text-[var(--color-accent)]" />
          </div>
          <h1 className="text-[20px] font-bold text-[var(--color-fg)]">Join {workspaceName}</h1>
          <p className="mt-1.5 text-[13px] text-[var(--color-fg-muted)]">
            You&apos;ve been invited as a{" "}
            <span className="font-semibold text-[var(--color-fg)]">{roleLabel}</span>
          </p>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => { void handleRegister(e); }}
          className="px-6 py-5 space-y-4"
        >
          {/* Email (pre-filled, read-only) */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">
              Email
            </label>
            <input
              type="email"
              value={invite.invitation.email}
              readOnly
              className="w-full h-9 px-3 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[var(--color-fg-muted)] cursor-not-allowed select-none"
            />
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">
              Full name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => { setForm({ ...form, name: e.target.value }); setSubmitError(null); }}
              placeholder="Alex Morgan"
              autoFocus
              required
              className="w-full h-9 px-3 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>

          {/* Password */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-medium text-[var(--color-fg-muted)]">
              Password <span className="text-red-400">*</span>
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => { setForm({ ...form, password: e.target.value }); setSubmitError(null); }}
              placeholder="At least 8 characters"
              required
              className="w-full h-9 px-3 text-[13px] bg-[var(--color-canvas)] border border-[var(--color-border)] rounded-lg text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
            />
          </div>

          {submitError && (
            <p className={cn(
              "rounded-lg border px-3 py-2 text-[12px]",
              submitError.includes("already exists")
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : "border-red-200 bg-red-50 text-red-600",
            )}>
              {submitError}
              {submitError.includes("already exists") && (
                <button
                  type="button"
                  onClick={() => router.replace(`/login?from=/invite/${token}`)}
                  className="block mt-1 font-medium underline"
                >
                  Log in instead →
                </button>
              )}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-10 rounded-xl bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 size={14} className="animate-spin" />}
            Create account & join
          </button>

          <p className="text-center text-[11px] text-[var(--color-fg-faint)]">
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => router.replace(`/login?from=/invite/${token}`)}
              className="text-[var(--color-accent)] hover:underline font-medium"
            >
              Log in
            </button>
          </p>
        </form>
      </div>
    </div>
  );
}

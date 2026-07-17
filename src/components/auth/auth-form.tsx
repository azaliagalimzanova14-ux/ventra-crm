"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2, Eye, EyeOff } from "lucide-react";

interface AuthFormProps {
  mode:     "login" | "register";
  onSubmit: (data: Record<string, string>) => Promise<string | null>;
}

function Field({
  id, label, type = "text", placeholder, value, onChange, required, minLength,
}: {
  id:          string;
  label:       string;
  type?:       string;
  placeholder?: string;
  value:       string;
  onChange:    (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?:   boolean;
  minLength?:  number;
}) {
  const [show, setShow]   = useState(false);
  const isPassword        = type === "password";

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-[13px] font-medium text-[var(--color-fg)]"
      >
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? "text" : type}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
          className="w-full h-10 px-3 text-[14px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-[var(--color-fg)] placeholder:text-[var(--color-fg-placeholder)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent transition-shadow"
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-fg-faint)] hover:text-[var(--color-fg-muted)] transition-colors"
            aria-label={show ? "Hide password" : "Show password"}
          >
            {show ? <EyeOff size={14} /> : <Eye size={14} />}
          </button>
        )}
      </div>
    </div>
  );
}

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [form, setForm]       = useState({
    name:     "",
    email:    "",
    password: "",
    company:  "",     // maps to workspace name on the API side
  });

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const errMsg = await onSubmit(form);
    if (errMsg) setError(errMsg);
    setLoading(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "register" && (
        <>
          <Field
            id="name"
            label="Full name"
            placeholder="Alex Morgan"
            value={form.name}
            onChange={set("name")}
            required
          />
          <Field
            id="company"
            label="Workspace name"
            placeholder="My Company"
            value={form.company}
            onChange={set("company")}
            required
          />
        </>
      )}

      <Field
        id="email"
        label="Email"
        type="email"
        placeholder="you@company.com"
        value={form.email}
        onChange={set("email")}
        required
      />
      <Field
        id="password"
        label="Password"
        type="password"
        placeholder="••••••••"
        value={form.password}
        onChange={set("password")}
        required
        minLength={8}
      />

      {error && (
        <p className="rounded-lg border border-[var(--color-danger-subtle)] bg-[var(--color-danger-subtle)] px-3 py-2 text-[13px] text-[var(--color-danger)]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full h-10 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white text-[14px] font-semibold rounded-lg transition-colors shadow-sm flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {mode === "login" ? "Sign in" : "Create account"}
      </button>

      <p className="text-center text-[13px] text-[var(--color-fg-muted)]">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="text-[var(--color-accent)] hover:underline font-medium"
            >
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-[var(--color-accent)] hover:underline font-medium"
            >
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

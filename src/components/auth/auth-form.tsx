"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/auth";

interface AuthFormProps {
  mode: "login" | "register";
  onSubmit: (data: Record<string, string>) => Promise<string | null>;
}

export function AuthForm({ mode, onSubmit }: AuthFormProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    company: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const err = await onSubmit(form);
    if (err) setError(err);
    setLoading(false);
  };

  const fillDemo = () => {
    setForm((f) => ({ ...f, email: DEMO_EMAIL, password: DEMO_PASSWORD }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {mode === "register" && (
        <>
          <Input
            id="name"
            label="Full name"
            placeholder="Alex Morgan"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
          />
          <Input
            id="company"
            label="Company"
            placeholder="Acme Inc"
            value={form.company}
            onChange={(e) => setForm({ ...form, company: e.target.value })}
            required
          />
        </>
      )}
      <Input
        id="email"
        label="Email"
        type="email"
        placeholder="you@company.com"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        required
      />
      <Input
        id="password"
        label="Password"
        type="password"
        placeholder="••••••••"
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
        required
        minLength={6}
      />

      {error && (
        <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      <Button type="submit" className="w-full" size="lg" disabled={loading}>
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {mode === "login" ? "Sign in" : "Create account"}
      </Button>

      {mode === "login" && (
        <button
          type="button"
          onClick={fillDemo}
          className="w-full text-center text-xs text-zinc-500 transition-colors hover:text-violet-400"
        >
          Use demo account
        </button>
      )}

      <p className="text-center text-sm text-zinc-500">
        {mode === "login" ? (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/register" className="text-violet-400 hover:text-violet-300">
              Sign up
            </Link>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-violet-400 hover:text-violet-300">
              Sign in
            </Link>
          </>
        )}
      </p>
    </form>
  );
}

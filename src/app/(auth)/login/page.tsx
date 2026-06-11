"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { useAuth } from "@/context/auth-context";

export default function LoginPage() {
  const { user, loading, login } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight text-[var(--color-fg)]">
        Welcome back
      </h1>
      <p className="mt-1.5 text-[14px] text-[var(--color-fg-muted)]">Sign in to your workspace</p>
      <div className="mt-8">
        <AuthForm
          mode="login"
          onSubmit={async (data) => login(data.email, data.password)}
        />
      </div>
    </div>
  );
}

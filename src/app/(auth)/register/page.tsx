"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { useAuth } from "@/context/auth-context";

export default function RegisterPage() {
  const { user, loading, register } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/dashboard");
  }, [user, loading, router]);

  return (
    <div>
      <h1 className="text-[24px] font-bold tracking-tight text-[var(--color-fg)]">
        Create your account
      </h1>
      <p className="mt-1.5 text-[14px] text-[var(--color-fg-muted)]">Start for free, no credit card required</p>
      <div className="mt-8">
        <AuthForm
          mode="register"
          onSubmit={async (data) =>
            register({
              name: data.name,
              email: data.email,
              password: data.password,
              company: data.company,
            })
          }
        />
      </div>
    </div>
  );
}

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
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-50">
        Welcome back
      </h1>
      <p className="mt-2 text-sm text-zinc-500">Sign in to your workspace</p>
      <div className="mt-8">
        <AuthForm
          mode="login"
          onSubmit={async (data) => login(data.email, data.password)}
        />
      </div>
    </div>
  );
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import * as auth from "@/lib/auth";
import type { User } from "@/lib/types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (data: {
    name: string;
    email: string;
    password: string;
    company: string;
  }) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    setUser(auth.getSession());
    setLoading(false);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = auth.login(email, password);
      if (!result.success) return result.error;
      setUser(result.user);
      router.push("/dashboard");
      return null;
    },
    [router],
  );

  const register = useCallback(
    async (data: {
      name: string;
      email: string;
      password: string;
      company: string;
    }) => {
      const result = auth.register(data);
      if (!result.success) return result.error;
      setUser(result.user);
      router.push("/dashboard");
      return null;
    },
    [router],
  );

  const logout = useCallback(() => {
    auth.clearSession();
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

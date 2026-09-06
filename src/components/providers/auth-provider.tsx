"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AppUser = {
  id: string;
  churchId: string | null;
  role: "STUDENT" | "SERVANT" | "CHURCH_ADMIN" | "SUPER_ADMIN";
  fullName: string;
  phone: string;
  secondaryPhone?: string | null;
  address?: string | null;
  grade?: string | null;
  birthDate?: string | null;
  confessionFather?: string | null;
  fatherJob?: string | null;
  motherJob?: string | null;
  isMotherWorking?: boolean;
  qrCodeId: string;
  createdAt?: string;
};

export type AppChurch = {
  id: string;
  name: string;
  licenseKey?: string;
};

type AuthState = {
  user: AppUser | null;
  church: AppChurch | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
  setAuth: (user: AppUser, church: AppChurch | null) => void;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [church, setChurch] = useState<AppChurch | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        setChurch(null);
        return;
      }
      const data = await res.json();
      setUser(data.user);
      setChurch(data.church);
    } catch {
      setUser(null);
      setChurch(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null);
    setChurch(null);
    window.location.href = "/";
  }, []);

  const setAuth = useCallback((u: AppUser, c: AppChurch | null) => {
    setUser(u);
    setChurch(c);
  }, []);

  const value = useMemo(
    () => ({ user, church, loading, refresh, logout, setAuth }),
    [user, church, loading, refresh, logout, setAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

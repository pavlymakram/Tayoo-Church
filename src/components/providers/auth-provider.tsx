"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { can as canDo, type Capability } from "@/lib/permissions";
import { normalizeRole, type Role } from "@/lib/utils";

export type AppUser = {
  id: string;
  churchId: string | null;
  role: Role;
  fullName: string;
  username?: string | null;
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
  initialPassword?: string | null;
  phaseId?: string | null;
  phaseName?: string | null;
  phaseAbbreviation?: string | null;
  className?: string | null;
  sector?: string | null;
  isFirstAdmin?: boolean;
};

export type AppChurch = {
  id: string;
  name: string;
  abbreviation?: string;
  licenseKey?: string;
};

type AuthState = {
  user: AppUser | null;
  church: AppChurch | null;
  role: Role;
  loading: boolean;
  can: (capability: Capability) => boolean;
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
      const res = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
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
    const currentRole = normalizeRole(user?.role);
    const isStaffRole =
      currentRole === "PHASE_SERVANT" ||
      currentRole === "PHASE_ADMIN" ||
      currentRole === "CHURCH_ADMIN" ||
      currentRole === "SUPER_ADMIN";
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {
      // Cookie is HttpOnly — local state still clears even if the call fails.
    }
    setUser(null);
    setChurch(null);
    // Absolute route isolation: staff gates live under /admin121210,
    // the student portal lives under `/` — never cross them.
    window.location.href = isStaffRole ? "/admin121210" : "/";
  }, [user?.role]);

  const setAuth = useCallback((u: AppUser, c: AppChurch | null) => {
    setUser(u);
    setChurch(c);
  }, []);

  const role = normalizeRole(user?.role);
  const can = useCallback((capability: Capability) => canDo(role, capability), [role]);

  const value = useMemo(
    () => ({ user, church, role, loading, can, refresh, logout, setAuth }),
    [user, church, role, loading, can, refresh, logout, setAuth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}


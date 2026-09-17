"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Church,
  Home,
  LogOut,
  ScanLine,
  Settings2,
  Users,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/auth-provider";

export function BrandMark({
  size = "md",
  light,
}: {
  size?: "sm" | "md" | "lg";
  light?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          "grid place-items-center rounded-2xl shadow-lg shadow-slate-900/15",
          light
            ? "bg-white/15 text-[var(--color-gold-soft)]"
            : "bg-[var(--color-navy)] text-[var(--color-gold-soft)]",
          size === "sm" && "h-10 w-10",
          size === "md" && "h-12 w-12",
          size === "lg" && "h-16 w-16"
        )}
      >
        <Church className={cn(size === "lg" ? "h-8 w-8" : "h-6 w-6")} />
      </div>
      <div>
        <p
          className={cn(
            "font-black tracking-tight",
            light ? "text-white" : "text-[var(--color-navy)]",
            size === "lg" ? "text-3xl" : size === "md" ? "text-xl" : "text-lg"
          )}
        >
          طايو
        </p>
        <p className={cn("text-xs font-medium", light ? "text-slate-200" : "text-slate-500")}>
          نظام إدارة الخدمة والنقاط
        </p>
      </div>
    </div>
  );
}

export function StaffBottomNav() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const isAdmin = user?.role === "CHURCH_ADMIN";

  const items = [
    { href: "/servant", label: "الرئيسية", icon: Home },
    { href: "/servant/scan", label: "مسح", icon: ScanLine },
    { href: "/servant/students", label: "المستخدمين", icon: Users },
    ...(isAdmin
      ? [
          { href: "/servant/events", label: "المناسبات", icon: CalendarDays },
          { href: "/servant/settings", label: "إعدادات", icon: Settings2 },
        ]
      : []),
  ];

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/80 bg-white/90 backdrop-blur-xl safe-bottom">
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-2">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-bold transition",
                active ? "text-[var(--color-emerald)]" : "text-slate-500"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "scale-110")} />
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => logout()}
          className="flex flex-1 flex-col items-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-bold text-slate-500"
        >
          <LogOut className="h-5 w-5" />
          خروج
        </button>
      </div>
    </nav>
  );
}

export function PageShell({
  children,
  withStaffNav,
}: {
  children: React.ReactNode;
  withStaffNav?: boolean;
}) {
  return (
    <div className={cn("mx-auto min-h-dvh w-full max-w-5xl px-4 py-5", withStaffNav && "pb-28")}>
      {children}
    </div>
  );
}

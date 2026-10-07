"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Church,
  ClipboardList,
  Home,
  LayoutGrid,
  LogOut,
  ScanLine,
  Settings2,
  UserCog,
  UserRound,
  Users,
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
  const { role, can, logout } = useAuth();

  const items = [
    { href: "/servant", label: "الرئيسية", icon: Home, show: true },
    { href: "/servant/quick-scan", label: "مسح", icon: ScanLine, show: can("scanQr") },
    { href: "/servant/students", label: "المخدومين", icon: Users, show: role !== "CHURCH_ADMIN" },
    { href: "/servant/staff", label: "الخدام", icon: UserCog, show: can("managePhaseServants") },
    { href: "/servant/classes", label: "الفصول", icon: LayoutGrid, show: can("createClasses") || can("manageClasses") },
    { href: "/servant/attendance", label: "الحضور والتقارير", icon: ClipboardList, show: can("viewAttendanceLogs") },
    { href: "/servant/settings", label: "إعدادات", icon: Settings2, show: role === "CHURCH_ADMIN" },
    { href: "/servant/profile", label: "حسابي", icon: UserRound, show: true },
  ].filter((item) => item.show);

  // Keep every icon + label legible on narrow screens: chips share one row,
  // shrink gracefully, wrap on very small widths, and truncate long labels.
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-200/80 bg-white/95 backdrop-blur-xl safe-bottom">
      <div className="mx-auto grid w-full max-w-5xl auto-cols-fr grid-flow-col gap-1 overflow-x-auto px-2 pt-2 sm:gap-2 sm:px-4">
        {items.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href + item.label}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-2xl px-1.5 py-2 text-center text-[10px] font-bold leading-tight transition sm:px-3 sm:text-[11px]",
                active ? "bg-teal-50 text-[var(--color-emerald)]" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Icon className={cn("h-5 w-5 shrink-0", active && "scale-110")} />
              <span className="max-w-full truncate">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => logout()}
          title="خروج"
          className="flex min-w-0 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-2xl px-1.5 py-2 text-center text-[10px] font-bold leading-tight text-slate-500 transition hover:text-slate-700 sm:px-3 sm:text-[11px]"
        >
          <LogOut className="h-5 w-5 shrink-0" />
          <span className="max-w-full truncate">خروج</span>
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

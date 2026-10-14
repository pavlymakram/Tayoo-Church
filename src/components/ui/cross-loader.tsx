"use client";

import { Cross } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Custom cross-circle loading spinner.
 * Small crosses (صلبان صغيرة) arranged in a rotating circle.
 * Used globally whenever data is being fetched or revalidated —
 * replaces empty screens / blank states / "لا يوجد ..." texts during loading.
 */
export function CrossLoader({
  size = "md",
  label = "جارٍ التحميل...",
  className,
}: {
  size?: "sm" | "md" | "lg";
  label?: string | null;
  className?: string;
}) {
  const dims =
    size === "sm" ? "h-12 w-12" : size === "lg" ? "h-24 w-24" : "h-16 w-16";
  const crossSize =
    size === "sm" ? "h-3 w-3" : size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const count = 8;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? "جارٍ التحميل"}
      className={cn("flex flex-col items-center justify-center gap-3 py-10", className)}
    >
      <div className={cn("relative", dims)}>
        <div className="cross-spin absolute inset-0">
          {Array.from({ length: count }).map((_, i) => {
            const angle = (360 / count) * i;
            return (
              <span
                key={i}
                className="absolute left-1/2 top-1/2"
                style={{ transform: `rotate(${angle}deg) translateY(calc(${size === "sm" ? "-1.25rem" : size === "lg" ? "-2.5rem" : "-1.75rem"})) translate(-50%, -50%)` }}
              >
                <span
                  className="block"
                  style={{ transform: `rotate(${-angle}deg)`, animationDelay: `${i * 0.12}s` }}
                >
                  <Cross
                    className={cn(crossSize, "cross-pulse text-[var(--color-gold)]")}
                    strokeWidth={3}
                  />
                </span>
              </span>
            );
          })}
        </div>
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <Cross
            className={cn(
              size === "sm" ? "h-4 w-4" : size === "lg" ? "h-7 w-7" : "h-5 w-5",
              "text-[var(--color-navy)]"
            )}
            strokeWidth={3}
          />
        </span>
      </div>
      {label && (
        <p className="text-sm font-bold text-slate-500">{label}</p>
      )}
      <style jsx>{`
        .cross-spin {
          animation: cross-rotate 1.4s linear infinite;
        }
        @keyframes cross-rotate {
          to {
            transform: rotate(360deg);
          }
        }
        .cross-pulse {
          animation: cross-pulse 1.4s ease-in-out infinite;
          display: block;
        }
        @keyframes cross-pulse {
          0%,
          100% {
            opacity: 0.35;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.15);
          }
        }
      `}</style>
    </div>
  );
}

export default CrossLoader;

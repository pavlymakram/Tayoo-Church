import { cn } from "@/lib/utils";

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "gold";
  size?: "sm" | "md" | "lg";
}) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-2xl font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        size === "sm" && "px-3 py-2 text-sm",
        size === "md" && "px-4 py-3 text-base",
        size === "lg" && "px-5 py-4 text-lg",
        variant === "primary" && "bg-[var(--color-navy)] text-white shadow-lg shadow-slate-900/10 hover:bg-[var(--color-navy-deep)]",
        variant === "secondary" && "bg-white text-[var(--color-navy)] border border-slate-200 hover:bg-slate-50",
        variant === "ghost" && "bg-transparent text-[var(--color-navy)] hover:bg-white/60",
        variant === "danger" && "bg-rose-700 text-white hover:bg-rose-800",
        variant === "gold" && "bg-[var(--color-gold)] text-white shadow-lg shadow-amber-700/20 hover:bg-amber-700",
        className
      )}
      {...props}
    />
  );
}

export function Input({
  className,
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label?: string; error?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-semibold text-slate-700">{label}</span>}
      <input
        className={cn(
          "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-[var(--color-ink)] outline-none transition focus:border-[var(--color-emerald)] focus:ring-4 focus:ring-teal-500/10",
          error && "border-rose-400",
          className
        )}
        {...props}
      />
      {error && <span className="text-xs text-rose-600">{error}</span>}
    </label>
  );
}

export function TextArea({
  className,
  label,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-semibold text-slate-700">{label}</span>}
      <textarea
        className={cn(
          "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--color-emerald)] focus:ring-4 focus:ring-teal-500/10 min-h-24",
          className
        )}
        {...props}
      />
    </label>
  );
}

export function Select({
  className,
  label,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block space-y-1.5">
      {label && <span className="text-sm font-semibold text-slate-700">{label}</span>}
      <select
        className={cn(
          "w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-[var(--color-emerald)] focus:ring-4 focus:ring-teal-500/10",
          className
        )}
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("glass rounded-3xl p-5 shadow-sm shadow-slate-900/5", className)}>
      {children}
    </div>
  );
}

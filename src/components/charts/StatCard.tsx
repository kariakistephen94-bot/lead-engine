import Link from "next/link";

import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  sub,
  tone = "default",
  href,
  icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "default" | "positive" | "warning" | "danger" | "brand";
  href?: string;
  icon?: React.ReactNode;
}) {
  const body = (
    <div
      className={cn(
        "rounded-lg border border-line bg-surface p-3.5 shadow-xs transition-colors",
        href && "hover:border-line-strong hover:bg-canvas",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-soft">{label}</p>
        {icon && <span className="text-ink-faint">{icon}</span>}
      </div>
      <p
        className={cn(
          "tabular mt-1.5 text-xl font-semibold",
          tone === "positive" && "text-positive",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
          tone === "brand" && "text-brand",
          tone === "default" && "text-ink",
        )}
      >
        {value}
      </p>
      {sub && <p className="mt-0.5 text-xs text-ink-faint">{sub}</p>}
    </div>
  );

  return href ? (
    <Link href={href} className="block">
      {body}
    </Link>
  ) : (
    body
  );
}

export function ProgressBar({
  value,
  target,
  className,
}: {
  value: number;
  target: number;
  className?: string;
}) {
  const percent = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const complete = value >= target && target > 0;

  return (
    <div className={cn("w-full", className)}>
      <div className="mb-1 flex items-baseline justify-between">
        <span className="tabular text-sm font-semibold text-ink">
          {value} <span className="font-normal text-ink-faint">/ {target}</span>
        </span>
        <span className={cn("tabular text-xs", complete ? "text-positive" : "text-ink-soft")}>
          {Math.round(percent)}%
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            complete ? "bg-positive" : "bg-brand",
          )}
          style={{ width: `${Math.max(percent, value > 0 ? 2 : 0)}%` }}
        />
      </div>
    </div>
  );
}

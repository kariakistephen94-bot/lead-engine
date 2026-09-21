import { cn } from "@/lib/utils";

/**
 * Horizontal bar list — the right form for ranked categorical data (leads by
 * niche, by source). Bars are drawn with a div width, not SVG, so labels stay
 * selectable text.
 */
export function BarList({
  items,
  valueFormatter = (v) => String(v),
  emptyLabel = "No data yet",
  className,
}: {
  items: { label: string; value: number; color?: string; href?: string }[];
  valueFormatter?: (value: number) => string;
  emptyLabel?: string;
  className?: string;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));

  if (!items.length) {
    return <p className={cn("py-6 text-center text-xs text-ink-faint", className)}>{emptyLabel}</p>;
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {items.map((item) => (
        <li key={item.label}>
          <div className="mb-1 flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-xs text-ink-soft">{item.label}</span>
            <span className="tabular shrink-0 text-xs font-medium text-ink">
              {valueFormatter(item.value)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width] duration-300"
              style={{
                width: `${Math.max(2, (item.value / max) * 100)}%`,
                background: item.color ?? "var(--color-brand)",
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

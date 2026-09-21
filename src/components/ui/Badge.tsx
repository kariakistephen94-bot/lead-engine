import { cn } from "@/lib/utils";
import type { StatusTone } from "@/lib/constants";

const TONES: Record<StatusTone, string> = {
  slate: "bg-muted text-ink-soft ring-line-strong/60",
  blue: "bg-brand-soft text-brand-ink ring-brand/20",
  indigo: "bg-info-soft text-info ring-info/20",
  amber: "bg-warning-soft text-warning ring-warning/20",
  green: "bg-positive-soft text-positive ring-positive/20",
  red: "bg-danger-soft text-danger ring-danger/20",
};

export function Badge({
  tone = "slate",
  children,
  className,
  dot,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        TONES[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

/** 0–100 lead score with a colour ramp so scanning a column is instant. */
export function ScorePill({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span className="text-xs text-ink-faint">—</span>;
  }
  const tone: StatusTone =
    score >= 80 ? "green" : score >= 60 ? "blue" : score >= 40 ? "amber" : "slate";
  return (
    <Badge tone={tone} className="tabular font-semibold">
      {score}
    </Badge>
  );
}

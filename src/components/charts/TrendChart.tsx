"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

type Point = { date: string; [key: string]: string | number };

/**
 * Two-series area/line chart drawn as inline SVG — no chart library, and it
 * scales to the container with a viewBox rather than a resize observer.
 */
export function TrendChart({
  data,
  series,
  height = 180,
  className,
}: {
  data: Point[];
  series: { key: string; label: string; color: string }[];
  height?: number;
  className?: string;
}) {
  const gradientId = useId();
  const [hover, setHover] = useState<number | null>(null);

  const width = 600;
  const padding = { top: 8, right: 8, bottom: 20, left: 28 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;

  const max = Math.max(
    1,
    ...data.flatMap((d) => series.map((s) => Number(d[s.key] ?? 0))),
  );
  // Round the axis up to a friendly number so gridlines read cleanly.
  const step = Math.pow(10, Math.floor(Math.log10(max)));
  const niceMax = Math.ceil(max / step) * step;

  const x = (i: number) => padding.left + (data.length <= 1 ? 0 : (i / (data.length - 1)) * innerWidth);
  const y = (value: number) => padding.top + innerHeight - (value / niceMax) * innerHeight;

  function path(key: string, close: boolean) {
    if (!data.length) return "";
    const points = data.map((d, i) => `${x(i)},${y(Number(d[key] ?? 0))}`);
    const line = `M ${points.join(" L ")}`;
    return close
      ? `${line} L ${x(data.length - 1)},${padding.top + innerHeight} L ${x(0)},${padding.top + innerHeight} Z`
      : line;
  }

  if (!data.length) {
    return <p className="py-10 text-center text-xs text-ink-faint">No activity yet</p>;
  }

  const active = hover !== null ? data[hover] : null;

  return (
    <div className={cn("relative", className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        role="img"
        aria-label={`Trend of ${series.map((s) => s.label).join(" and ")}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = ((e.clientX - rect.left) / rect.width) * width;
          const index = Math.round(((ratio - padding.left) / innerWidth) * (data.length - 1));
          setHover(Math.min(data.length - 1, Math.max(0, index)));
        }}
      >
        <defs>
          {series.map((s) => (
            <linearGradient key={s.key} id={`${gradientId}-${s.key}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>

        {[0, 0.5, 1].map((fraction) => {
          const value = niceMax * (1 - fraction);
          const yy = padding.top + innerHeight * fraction;
          return (
            <g key={fraction}>
              <line
                x1={padding.left}
                x2={width - padding.right}
                y1={yy}
                y2={yy}
                stroke="var(--color-line)"
                strokeDasharray={fraction === 1 ? undefined : "3 3"}
              />
              <text x={0} y={yy + 3} fontSize="9" fill="var(--color-ink-faint)">
                {Math.round(value)}
              </text>
            </g>
          );
        })}

        {series.map((s) => (
          <g key={s.key}>
            <path d={path(s.key, true)} fill={`url(#${gradientId}-${s.key})`} />
            <path d={path(s.key, false)} fill="none" stroke={s.color} strokeWidth="1.75" strokeLinejoin="round" />
          </g>
        ))}

        {hover !== null && (
          <g>
            <line
              x1={x(hover)}
              x2={x(hover)}
              y1={padding.top}
              y2={padding.top + innerHeight}
              stroke="var(--color-line-strong)"
            />
            {series.map((s) => (
              <circle
                key={s.key}
                cx={x(hover)}
                cy={y(Number(data[hover][s.key] ?? 0))}
                r="3"
                fill="var(--color-surface)"
                stroke={s.color}
                strokeWidth="2"
              />
            ))}
          </g>
        )}

        {data.map((d, i) =>
          i % Math.ceil(data.length / 6) === 0 ? (
            <text
              key={d.date}
              x={x(i)}
              y={height - 4}
              fontSize="9"
              fill="var(--color-ink-faint)"
              textAnchor={i === 0 ? "start" : "middle"}
            >
              {new Date(d.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </text>
          ) : null,
        )}
      </svg>

      <div className="mt-1 flex items-center gap-4">
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-xs text-ink-soft">
            <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
            {s.label}
            {active && (
              <span className="tabular font-medium text-ink">{Number(active[s.key] ?? 0)}</span>
            )}
          </span>
        ))}
        {active && (
          <span className="ml-auto text-xs text-ink-faint">
            {new Date(active.date).toLocaleDateString("en-US", {
              weekday: "short",
              month: "short",
              day: "numeric",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

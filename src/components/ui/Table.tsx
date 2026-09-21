"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { cn } from "@/lib/utils";

export function TableShell({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full min-w-max border-collapse text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
  sortKey,
  activeSort,
  direction,
  onSort,
  align = "left",
  sticky,
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  sortKey?: string;
  activeSort?: string;
  direction?: "asc" | "desc";
  onSort?: (key: string) => void;
  align?: "left" | "right" | "center";
  sticky?: boolean;
}) {
  const sortable = Boolean(sortKey && onSort);
  const active = sortable && activeSort === sortKey;

  return (
    <th
      scope="col"
      style={style}
      className={cn(
        "sticky top-0 z-10 border-b border-line bg-canvas px-3 py-2 text-[11px] font-semibold tracking-wide text-ink-faint uppercase whitespace-nowrap",
        align === "right" && "text-right",
        align === "center" && "text-center",
        sticky && "left-0 z-20",
        className,
      )}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort?.(sortKey!)}
          className={cn(
            "inline-flex items-center gap-1 transition-colors hover:text-ink",
            active && "text-ink",
          )}
        >
          {children}
          {active ? (
            direction === "asc" ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            )
          ) : (
            <ChevronsUpDown className="h-3 w-3 opacity-40" />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export function Td({
  children,
  className,
  align = "left",
  sticky,
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  align?: "left" | "right" | "center";
  sticky?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <td
      style={style}
      className={cn(
        "border-b border-line px-3 py-2 align-middle text-ink-soft",
        align === "right" && "text-right",
        align === "center" && "text-center",
        sticky && "sticky left-0 z-10 bg-surface",
        className,
      )}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  className,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "group transition-colors",
        selected ? "bg-brand-soft/60" : "bg-surface hover:bg-canvas",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Checkbox({
  checked,
  indeterminate,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  className?: string;
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      ref={(el) => {
        if (el) el.indeterminate = Boolean(indeterminate) && !checked;
      }}
      onChange={(e) => onChange(e.target.checked)}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "h-3.5 w-3.5 cursor-pointer rounded border-line-strong text-brand accent-[var(--color-brand)]",
        className,
      )}
    />
  );
}

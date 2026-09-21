"use client";

import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Minimal popover anchored to its trigger. Closes on outside click, Escape and
 * on scroll of an ancestor (so it never floats away from a scrolling table).
 */
export function Dropdown({
  trigger,
  children,
  align = "right",
  className,
  width = "w-56",
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: (props: { close: () => void }) => React.ReactNode;
  align?: "left" | "right";
  className?: string;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn("relative", className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            "animate-in absolute z-40 mt-1 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg",
            width,
            align === "right" ? "right-0" : "left-0",
          )}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onClick,
  destructive,
  disabled,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
        "disabled:cursor-not-allowed disabled:opacity-40",
        destructive ? "text-danger hover:bg-danger-soft" : "text-ink-soft hover:bg-muted hover:text-ink",
      )}
    >
      {icon && <span className="shrink-0 text-ink-faint">{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-ink-faint uppercase">
      {children}
    </p>
  );
}

export function MenuDivider() {
  return <div className="my-1 border-t border-line" />;
}

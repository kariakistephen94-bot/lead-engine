import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg" | "icon";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white border border-brand hover:bg-brand-ink hover:border-brand-ink shadow-xs",
  secondary:
    "bg-surface text-ink border border-line hover:bg-muted hover:border-line-strong shadow-xs",
  subtle: "bg-muted text-ink-soft border border-transparent hover:bg-line hover:text-ink",
  ghost: "bg-transparent text-ink-soft border border-transparent hover:bg-muted hover:text-ink",
  danger: "bg-danger text-white border border-danger hover:brightness-95 shadow-xs",
};

const SIZES: Record<Size, string> = {
  sm: "h-7 px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-8.5 px-3 text-sm gap-1.5 rounded-md",
  lg: "h-10 px-4 text-sm gap-2 rounded-lg",
  icon: "h-8.5 w-8.5 rounded-md justify-center",
};

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", className, type = "button", ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        "inline-flex items-center font-medium transition-colors select-none",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  );
});

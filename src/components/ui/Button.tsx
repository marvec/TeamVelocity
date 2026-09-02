import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

type Variant = "primary" | "outline" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90 border border-transparent",
  outline: "border border-border bg-surface text-foreground hover:bg-muted",
  ghost: "border border-transparent text-foreground-muted hover:bg-muted hover:text-foreground",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  active?: boolean;
}

export function Button({ variant = "outline", active = false, className, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-8 items-center justify-center gap-1.5 rounded-control px-3 text-sm font-medium transition-colors",
        "focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50",
        VARIANTS[variant],
        active && "ring-2 ring-ring",
        className,
      )}
      {...props}
    />
  );
}

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "../../lib/cn";

type DivProps = ComponentPropsWithoutRef<"div">;

export function Card({ className, children, ...rest }: DivProps) {
  return (
    <div
      className={cn("rounded-card border-(length:--border-w) border-border bg-card shadow-card", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className, children, ...rest }: DivProps) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 pt-4", className)} {...rest}>
      {children}
    </div>
  );
}

export function CardTitle({ className, children, ...rest }: ComponentPropsWithoutRef<"h2">) {
  return (
    <h2 className={cn("card-title", className)} {...rest}>
      {children}
    </h2>
  );
}

export function CardBody({ className, children, ...rest }: DivProps) {
  return (
    <div className={cn("p-4", className)} {...rest}>
      {children}
    </div>
  );
}

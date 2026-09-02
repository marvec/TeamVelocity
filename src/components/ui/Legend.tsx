import { CATEGORIES } from "../../lib/format";
import { cn } from "../../lib/cn";

export function CategoryLegend({ className }: { className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted", className)}>
      {CATEGORIES.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: c.colorVar }} />
          {c.legendLabel}
        </span>
      ))}
    </div>
  );
}

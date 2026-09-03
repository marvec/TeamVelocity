import type { VelocityBand } from "../../../shared/types";
import { CATEGORIES, bandVar } from "../../lib/format";
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

/** Velocity band legend (red / yellow / green) with the team's threshold ranges. */
export function BandLegend({
  thresholds,
  className,
}: {
  thresholds: { red: number; green: number };
  className?: string;
}) {
  const items: { band: VelocityBand; label: string }[] = [
    { band: "red", label: `< ${String(thresholds.red)}` },
    { band: "yellow", label: `${String(thresholds.red)}–${String(thresholds.green)}` },
    { band: "green", label: `≥ ${String(thresholds.green)}` },
  ];
  return (
    <div className={cn("tabular flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-foreground-muted", className)}>
      {items.map((it) => (
        <span key={it.band} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: bandVar(it.band) }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

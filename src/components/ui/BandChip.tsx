import type { VelocityBand } from "../../../shared/types";
import { bandBgClass } from "../../lib/format";
import { cn } from "../../lib/cn";

/**
 * The velocity band as a filled chip with dark text — the band colour is
 * carried by the fill, never by coloured text, so the yellow can stay bright.
 */
export function BandChip({
  band,
  thresholds,
  className,
}: {
  band: VelocityBand;
  thresholds?: { red: number; green: number };
  className?: string;
}) {
  const range = thresholds
    ? band === "red"
      ? `< ${String(thresholds.red)}`
      : band === "yellow"
        ? `${String(thresholds.red)}–${String(thresholds.green)}`
        : `≥ ${String(thresholds.green)}`
    : undefined;
  return (
    <span
      data-testid="band-chip"
      data-band={band}
      className={cn(
        "inline-flex h-5.5 items-center gap-1.5 rounded-chip px-2.5 text-xs leading-none font-bold tracking-wider uppercase text-on-band",
        bandBgClass(band),
        className,
      )}
    >
      {band}
      {range !== undefined && <span className="tabular tracking-normal normal-case">{range}</span>}
    </span>
  );
}

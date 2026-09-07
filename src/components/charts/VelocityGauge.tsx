import type { VelocityBand } from "../../../shared/types";
import { bandBgClass, bandVar, formatVelocity } from "../../lib/format";
import { cn } from "../../lib/cn";
import { BandChip } from "../ui/BandChip";

const R = 63; // ring centerline radius within a 150×150 box
const SW = 12; // ring thickness
const START = 220; // degrees (math convention: 0 = east, CCW positive)
const END = -40;

function polar(t: number): [number, number] {
  const a = ((START + ((END - START) * t) / 100) * Math.PI) / 180;
  return [75 + R * Math.cos(a), 75 - R * Math.sin(a)];
}

/** SVG arc path for the value range [t0, t1] on the 0–100 gauge (clockwise). */
function arc(t0: number, t1: number): string {
  if (t1 <= t0) return "";
  const [x0, y0] = polar(t0);
  const [x1, y1] = polar(t1);
  const large = Math.abs(((END - START) * (t1 - t0)) / 100) > 180 ? 1 : 0;
  return `M ${String(x0)} ${String(y0)} A ${String(R)} ${String(R)} 0 ${String(large)} 1 ${String(x1)} ${String(y1)}`;
}

export function VelocityGauge({
  value,
  band,
  thresholds = { red: 40, green: 70 },
  warmingUp = false,
  caption = "velocity",
}: {
  value: number;
  band: VelocityBand;
  thresholds?: { red: number; green: number };
  warmingUp?: boolean;
  caption?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  // The filled arc is split into its band portions so you can see how far the
  // value sits above red / into yellow / green; the track is the remaining 0–100.
  const segments: { d: string; stroke: string }[] = [
    { d: arc(0, 100), stroke: "var(--color-muted)" },
    { d: arc(0, Math.min(v, thresholds.red)), stroke: bandVar("red") },
    { d: arc(thresholds.red, Math.min(v, thresholds.green)), stroke: bandVar("yellow") },
    { d: arc(thresholds.green, v), stroke: bandVar("green") },
  ].filter((s) => s.d !== "");

  return (
    <div
      className="flex flex-col items-center gap-1.5"
      data-testid="velocity-gauge"
      data-velocity={formatVelocity(value)}
      data-band={band}
    >
      <div className="relative h-[150px] w-[150px]">
        {/* Soft band-coloured disc behind the arc; opacity is a theme knob (0 in most themes). */}
        <div aria-hidden className={cn("absolute inset-6 rounded-full opacity-(--gauge-halo)", bandBgClass(band))} />
        <svg viewBox="0 0 150 150" className="relative h-full w-full" aria-hidden>
          {segments.map((s) => (
            <path key={s.stroke} d={s.d} fill="none" stroke={s.stroke} strokeWidth={SW} strokeLinecap="round" />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl leading-none font-bold tracking-tight text-heading">{formatVelocity(value)}</span>
          <span className="mt-1 text-xs tracking-wide text-foreground-muted uppercase">{caption}</span>
          {warmingUp && <span className="mt-0.5 text-xs text-band-yellow-ink">warming up</span>}
        </div>
      </div>
      <BandChip band={band} thresholds={thresholds} />
    </div>
  );
}

import type { ReactElement } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VelocityBand } from "../../../shared/types";
import type { WeekSummary } from "../../../shared/schema/data";
import { bandTextClass, bandVar } from "../../lib/format";

interface HistoryDatum {
  x: string;
  full: string;
  velocity: number;
  band: VelocityBand;
  warmingUp: boolean;
}

function shortLabel(weekStart: string): string {
  return weekStart.slice(5).replace("-", "/");
}

interface LineTooltipProps {
  active?: boolean;
  payload?: { payload?: HistoryDatum }[];
}

function HistoryTooltip({ active, payload }: LineTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  return (
    <div className="rounded-control border border-border bg-card p-2 text-xs shadow-md">
      <div className="font-semibold text-heading">{d.full}</div>
      <div className={bandTextClass(d.band)}>velocity {Math.round(d.velocity)}</div>
      {d.warmingUp && <div className="text-band-yellow">warming up</div>}
    </div>
  );
}

const GRADIENT_ID = "velocity-history-gradient";

export function VelocityHistory({
  weeks,
  thresholds,
}: {
  weeks: WeekSummary[];
  thresholds: { red: number; green: number };
}) {
  const data: HistoryDatum[] = weeks.map((w) => ({
    x: shortLabel(w.weekStart),
    full: w.label,
    velocity: w.velocity,
    band: w.velocityBand,
    warmingUp: w.warmingUp,
  }));

  // Colour the line by score with a vertical gradient. objectBoundingBox maps
  // the gradient to the line's own vertical extent [lo, hi], so a threshold t
  // sits at offset (hi − t) / (hi − lo) — no chart-geometry math needed.
  const vels = data.map((d) => d.velocity);
  const hi = vels.length ? Math.max(...vels) : 100;
  const lo = vels.length ? Math.min(...vels) : 0;
  const span = hi - lo || 1;
  const off = (t: number): string => `${(Math.min(1, Math.max(0, (hi - t) / span)) * 100).toFixed(2)}%`;
  const gRed = bandVar("red");
  const gYellow = bandVar("yellow");
  const gGreen = bandVar("green");

  const renderDot = (props: unknown): ReactElement => {
    const { cx, cy, index, payload } = props as {
      cx?: number;
      cy?: number;
      index?: number;
      payload?: HistoryDatum;
    };
    const key = `dot-${String(index ?? 0)}`;
    if (cx == null || cy == null || !payload) return <g key={key} />;
    return <circle key={key} cx={cx} cy={cy} r={2.5} fill={bandVar(payload.band)} />;
  };

  return (
    <div className="h-[150px] w-full" data-testid="velocity-history">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={gGreen} />
              <stop offset={off(thresholds.green)} stopColor={gGreen} />
              <stop offset={off(thresholds.green)} stopColor={gYellow} />
              <stop offset={off(thresholds.red)} stopColor={gYellow} />
              <stop offset={off(thresholds.red)} stopColor={gRed} />
              <stop offset="100%" stopColor={gRed} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--color-foreground-muted)" }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-foreground-muted)" }} width={38} />
          <Tooltip content={<HistoryTooltip />} />
          <Line
            type="monotone"
            dataKey="velocity"
            stroke={`url(#${GRADIENT_ID})`}
            strokeWidth={2}
            dot={renderDot}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

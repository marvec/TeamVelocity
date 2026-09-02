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

export function VelocityHistory({ weeks, band }: { weeks: WeekSummary[]; band: VelocityBand }) {
  const data: HistoryDatum[] = weeks.map((w) => ({
    x: shortLabel(w.weekStart),
    full: w.label,
    velocity: w.velocity,
    band: w.velocityBand,
    warmingUp: w.warmingUp,
  }));

  return (
    <div className="h-[150px] w-full" data-testid="velocity-history">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--color-foreground-muted)" }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--color-foreground-muted)" }} width={38} />
          <Tooltip content={<HistoryTooltip />} />
          <Line
            type="monotone"
            dataKey="velocity"
            stroke={bandVar(band)}
            strokeWidth={2}
            dot={{ r: 2.5, fill: bandVar(band), strokeWidth: 0 }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

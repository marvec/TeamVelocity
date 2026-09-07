import type { ReactElement } from "react";
import { CartesianGrid, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VelocityBand } from "../../../shared/types";
import type { WeekSummary } from "../../../shared/schema/data";
import { bandVar } from "../../lib/format";
import { BandChip } from "../ui/BandChip";

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
    <div className="rounded-control border-(length:--border-w) border-border bg-card p-2 text-xs shadow-md">
      <div className="mb-1 font-semibold text-heading">{d.full}</div>
      <div className="flex items-center gap-2">
        <BandChip band={d.band} />
        <span className="tabular text-foreground">velocity {Math.round(d.velocity)}</span>
      </div>
      {d.warmingUp && <div className="mt-1 text-band-yellow-ink">warming up</div>}
    </div>
  );
}

const TICK = { fontSize: 10.5, fill: "var(--color-foreground-muted)" };

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
  const lastIndex = data.length - 1;

  // The line is ink; the band lives in the translucent zones behind it and in
  // the dots (band fill + surface ring), which stays legible on any theme.
  const renderDot = (props: unknown): ReactElement => {
    const { cx, cy, index, payload } = props as {
      cx?: number;
      cy?: number;
      index?: number;
      payload?: HistoryDatum;
    };
    const key = `dot-${String(index ?? 0)}`;
    if (cx == null || cy == null || !payload) return <g key={key} />;
    return (
      <g key={key}>
        <circle cx={cx} cy={cy} r={4} fill={bandVar(payload.band)} stroke="var(--color-card)" strokeWidth={2} />
        {index === lastIndex && (
          <text x={cx + 9} y={cy + 4} fontSize={12} fontWeight={700} fill="var(--color-heading)">
            {Math.round(payload.velocity)}
          </text>
        )}
      </g>
    );
  };

  return (
    <div className="h-[150px] w-full" data-testid="velocity-history">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 30, left: 0, bottom: 0 }}>
          <ReferenceArea y1={0} y2={thresholds.red} fill={bandVar("red")} fillOpacity={0.11} stroke="none" />
          <ReferenceArea
            y1={thresholds.red}
            y2={thresholds.green}
            fill={bandVar("yellow")}
            fillOpacity={0.18}
            stroke="none"
          />
          <ReferenceArea y1={thresholds.green} y2={100} fill={bandVar("green")} fillOpacity={0.11} stroke="none" />
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <XAxis dataKey="x" tick={TICK} interval="preserveStartEnd" minTickGap={16} />
          <YAxis domain={[0, 100]} tick={TICK} width={38} />
          <Tooltip content={<HistoryTooltip />} />
          <Line
            type="monotone"
            dataKey="velocity"
            stroke="var(--color-heading)"
            strokeWidth={2}
            dot={renderDot}
            activeDot={{ r: 6, stroke: "var(--color-card)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

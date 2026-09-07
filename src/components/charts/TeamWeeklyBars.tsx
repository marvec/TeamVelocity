import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VelocityBand } from "../../../shared/types";
import type { WeekSummary } from "../../../shared/schema/data";
import { CATEGORIES, toStackDatum, type StackDatum } from "../../lib/format";
import { makeSegmentShape } from "./BarSegment";
import { StackTooltip } from "./StackTooltip";

interface WeekBarDatum extends StackDatum {
  key: string;
  label: string;
  velocity: number;
  band: VelocityBand;
  warmingUp: boolean;
}

function shortLabel(weekStart: string): string {
  return weekStart.slice(5).replace("-", "/");
}

const KEYS = CATEGORIES.map((c) => c.key);
const SHAPES = Object.fromEntries(CATEGORIES.map((c) => [c.key, makeSegmentShape(c.key, KEYS, "column")]));

export function TeamWeeklyBars({
  weeks,
  selectedWeek,
  onSelectWeek,
}: {
  weeks: WeekSummary[];
  selectedWeek?: string;
  onSelectWeek: (weekStart: string) => void;
}) {
  const data: WeekBarDatum[] = weeks.map((w) => ({
    ...toStackDatum(w.totals),
    key: w.weekStart,
    label: w.label,
    velocity: w.velocity,
    band: w.velocityBand,
    warmingUp: w.warmingUp,
  }));

  const handleClick = (entry: unknown): void => {
    const payload = (entry as { payload?: WeekBarDatum }).payload;
    if (payload) onSelectWeek(payload.key);
  };

  // The focused week keeps its full colour; a tinted column marks it and its
  // label goes bold, instead of dimming every other week.
  const renderTick = (props: unknown): ReactElement<SVGElement> => {
    const { x, y, payload } = props as { x?: number; y?: number; payload?: { value?: string } };
    const key = payload?.value ?? "";
    const focused = key === selectedWeek;
    return (
      <text
        x={x}
        y={(y ?? 0) + 12}
        textAnchor="middle"
        fontSize={10.5}
        fontWeight={focused ? 700 : 400}
        fill={focused ? "var(--color-heading)" : "var(--color-foreground-muted)"}
      >
        {shortLabel(key)}
      </text>
    );
  };

  return (
    <div className="h-[280px] w-full" data-testid="team-weekly-bars">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%" maxBarSize={28}>
          {selectedWeek && (
            <ReferenceArea x1={selectedWeek} x2={selectedWeek} fill="var(--color-selection)" fillOpacity={1} stroke="none" />
          )}
          <CartesianGrid stroke="var(--color-grid)" vertical={false} />
          <XAxis dataKey="key" tick={renderTick} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tick={{ fontSize: 10.5, fill: "var(--color-foreground-muted)" }} width={36} />
          <Tooltip content={<StackTooltip />} cursor={{ fill: "var(--color-muted)", fillOpacity: 0.6 }} />
          {CATEGORIES.map((c) => (
            <Bar
              key={c.key}
              dataKey={c.key}
              stackId="a"
              fill={c.colorVar}
              shape={SHAPES[c.key]}
              onClick={handleClick}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} cursor="pointer" />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

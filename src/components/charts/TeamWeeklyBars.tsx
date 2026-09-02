import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VelocityBand } from "../../../shared/types";
import type { WeekSummary } from "../../../shared/schema/data";
import { CATEGORIES, toStackDatum, type StackDatum } from "../../lib/format";
import { StackTooltip } from "./StackTooltip";

interface WeekBarDatum extends StackDatum {
  key: string;
  x: string;
  label: string;
  velocity: number;
  band: VelocityBand;
  warmingUp: boolean;
}

function shortLabel(weekStart: string): string {
  return weekStart.slice(5).replace("-", "/");
}

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
    x: shortLabel(w.weekStart),
    label: w.label,
    velocity: w.velocity,
    band: w.velocityBand,
    warmingUp: w.warmingUp,
  }));

  const handleClick = (entry: unknown): void => {
    const payload = (entry as { payload?: WeekBarDatum }).payload;
    if (payload) onSelectWeek(payload.key);
  };

  return (
    <div className="h-[280px] w-full" data-testid="team-weekly-bars">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
          <XAxis dataKey="x" tick={{ fontSize: 10, fill: "var(--color-foreground-muted)" }} interval="preserveStartEnd" minTickGap={12} />
          <YAxis tick={{ fontSize: 10, fill: "var(--color-foreground-muted)" }} width={36} />
          <Tooltip content={<StackTooltip />} cursor={{ fill: "var(--color-muted)", fillOpacity: 0.4 }} />
          {CATEGORIES.map((c) => (
            <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.colorVar} onClick={handleClick} isAnimationActive={false}>
              {data.map((d) => (
                <Cell
                  key={d.key}
                  cursor="pointer"
                  fillOpacity={selectedWeek && d.key !== selectedWeek ? 0.3 : 1}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

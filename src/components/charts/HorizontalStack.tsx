import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VelocityBand } from "../../../shared/types";
import type { TotalsData } from "../../../shared/schema/data";
import { CATEGORIES, toStackDatum, type StackDatum } from "../../lib/format";
import { StackTooltip } from "./StackTooltip";

export interface StackRow {
  key: string;
  label: string;
  totals: TotalsData;
  velocity?: number;
  band?: VelocityBand;
}

interface RowDatum extends StackDatum {
  key: string;
  label: string;
  velocity?: number;
  band?: VelocityBand;
}

export function HorizontalStack({
  rows,
  selectedKey,
  onSelect,
  yWidth = 128,
}: {
  rows: StackRow[];
  selectedKey?: string;
  onSelect?: (key: string) => void;
  yWidth?: number;
}) {
  const data: RowDatum[] = rows.map((r) => ({
    ...toStackDatum(r.totals),
    key: r.key,
    label: r.label,
    velocity: r.velocity,
    band: r.band,
  }));
  const height = Math.max(80, rows.length * 38 + 16);

  const handleClick = (entry: unknown): void => {
    const payload = (entry as { payload?: RowDatum }).payload;
    if (payload && onSelect) onSelect(payload.key);
  };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }} barCategoryGap="26%">
          <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-foreground-muted)" }} />
          <YAxis
            type="category"
            dataKey="label"
            width={yWidth}
            tick={{ fontSize: 11, fill: "var(--color-foreground)" }}
          />
          <Tooltip content={<StackTooltip />} cursor={{ fill: "var(--color-muted)", fillOpacity: 0.4 }} />
          {CATEGORIES.map((c) => (
            <Bar
              key={c.key}
              dataKey={c.key}
              stackId="a"
              fill={c.colorVar}
              onClick={handleClick}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell
                  key={d.key}
                  cursor={onSelect ? "pointer" : "default"}
                  fillOpacity={selectedKey && d.key !== selectedKey ? 0.3 : 1}
                />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

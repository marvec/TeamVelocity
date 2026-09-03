import type { ReactElement } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VelocityBand } from "../../../shared/types";
import type { TotalsData } from "../../../shared/schema/data";
import { CATEGORIES, bandVar, toStackDatum, type StackDatum } from "../../lib/format";
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
  // Rows carry a velocity only for the per-member chart (repo rows don't); when
  // present, print the value at each bar's end so the score can't be confused
  // with the bar's raw contribution length.
  const showVelocity = rows.some((r) => r.velocity !== undefined);

  const handleClick = (entry: unknown): void => {
    const payload = (entry as { payload?: RowDatum }).payload;
    if (payload && onSelect) onSelect(payload.key);
  };

  const renderVelocityLabel = (props: unknown): ReactElement | null => {
    const { x, y, width, height: barHeight, index } = props as {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      index?: number;
    };
    const row = data[index ?? -1];
    if (!row || row.velocity === undefined || row.band === undefined) return null;
    return (
      <text
        x={Number(x ?? 0) + Number(width ?? 0) + 6}
        y={Number(y ?? 0) + Number(barHeight ?? 0) / 2}
        dy={4}
        fontSize={11}
        fontWeight={700}
        fill={bandVar(row.band)}
        textAnchor="start"
      >
        {Math.round(row.velocity)}
      </text>
    );
  };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: showVelocity ? 34 : 12, left: 4, bottom: 4 }}
          barCategoryGap="26%"
        >
          <XAxis type="number" tick={{ fontSize: 10, fill: "var(--color-foreground-muted)" }} />
          <YAxis
            type="category"
            dataKey="label"
            width={yWidth}
            tick={{ fontSize: 11, fill: "var(--color-foreground)" }}
          />
          <Tooltip content={<StackTooltip />} cursor={{ fill: "var(--color-muted)", fillOpacity: 0.4 }} />
          {CATEGORIES.map((c, ci) => (
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
              {showVelocity && ci === CATEGORIES.length - 1 && (
                <LabelList dataKey="velocity" content={renderVelocityLabel} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

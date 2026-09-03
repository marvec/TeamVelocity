import type { ReactElement } from "react";
import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VelocityBand } from "../../../shared/types";
import { CATEGORIES, bandVar, type StackDatum } from "../../lib/format";
import { StackTooltip } from "./StackTooltip";

export interface StackRow {
  key: string;
  label: string;
  /** Pre-scaled stacked segments (+ raw counts for the tooltip). */
  datum: StackDatum;
  /** Number printed at the bar's end (the bar total, e.g. a velocity). */
  value?: number;
  /** Velocity shown in the tooltip (members only). */
  velocity?: number;
  /** Colors the end label + tooltip; neutral when absent. */
  band?: VelocityBand;
}

interface RowDatum extends StackDatum {
  key: string;
  label: string;
  value?: number;
  velocity?: number;
  band?: VelocityBand;
}

export function HorizontalStack({
  rows,
  selectedKey,
  onSelect,
  yWidth = 128,
  xMax,
}: {
  rows: StackRow[];
  selectedKey?: string;
  onSelect?: (key: string) => void;
  yWidth?: number;
  /** Fixes the axis maximum (e.g. 100 for the 0–100 velocity scale). */
  xMax?: number;
}) {
  const data: RowDatum[] = rows.map((r) => ({
    ...r.datum,
    key: r.key,
    label: r.label,
    value: r.value,
    velocity: r.velocity,
    band: r.band,
  }));
  const height = Math.max(80, rows.length * 38 + 16);
  const showValue = rows.some((r) => r.value !== undefined);

  const handleClick = (entry: unknown): void => {
    const payload = (entry as { payload?: RowDatum }).payload;
    if (payload && onSelect) onSelect(payload.key);
  };

  const renderValueLabel = (props: unknown): ReactElement | null => {
    const { x, y, width, height: barHeight, index } = props as {
      x?: number;
      y?: number;
      width?: number;
      height?: number;
      index?: number;
    };
    const row = data[index ?? -1];
    if (!row || row.value === undefined) return null;
    return (
      <text
        x={Number(x ?? 0) + Number(width ?? 0) + 6}
        y={Number(y ?? 0) + Number(barHeight ?? 0) / 2}
        dy={4}
        fontSize={11}
        fontWeight={700}
        fill={row.band ? bandVar(row.band) : "var(--color-foreground-muted)"}
        textAnchor="start"
      >
        {Math.round(row.value)}
      </text>
    );
  };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: showValue ? 34 : 12, left: 4, bottom: 4 }}
          barCategoryGap="26%"
        >
          <XAxis
            type="number"
            domain={xMax !== undefined ? [0, xMax] : undefined}
            tick={{ fontSize: 10, fill: "var(--color-foreground-muted)" }}
          />
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
              {showValue && ci === CATEGORIES.length - 1 && (
                <LabelList dataKey="value" content={renderValueLabel} />
              )}
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

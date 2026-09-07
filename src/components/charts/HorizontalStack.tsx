import type { ReactElement } from "react";
import { Bar, BarChart, Cell, LabelList, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { VelocityBand } from "../../../shared/types";
import { CATEGORIES, bandVar, type StackDatum } from "../../lib/format";
import { makeSegmentShape } from "./BarSegment";
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
  /** Colors the end pill + tooltip; neutral when absent. */
  band?: VelocityBand;
}

interface RowDatum extends StackDatum {
  key: string;
  label: string;
  value?: number;
  velocity?: number;
  band?: VelocityBand;
}

const KEYS = CATEGORIES.map((c) => c.key);
const SHAPES = Object.fromEntries(CATEGORIES.map((c) => [c.key, makeSegmentShape(c.key, KEYS, "bar")]));

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
  const labels = new Map(rows.map((r) => [r.key, r.label]));
  const height = Math.max(80, rows.length * 38 + 16);
  const showValue = rows.some((r) => r.value !== undefined);

  const handleClick = (entry: unknown): void => {
    const payload = (entry as { payload?: RowDatum }).payload;
    if (payload && onSelect) onSelect(payload.key);
  };

  const selectKey = (key: string): void => {
    if (onSelect) onSelect(key);
  };

  // The selected row is highlighted with a wash and a bold label; the others
  // keep their full colour.
  // A row's axis label doubles as its click target — essential when a bar has
  // zero length (a member with velocity but no activity this week), where there
  // is otherwise nothing to click. A transparent rect widens the hit area to the
  // whole label column; group-hover underlines the name to signal it's clickable.
  const renderTick = (props: unknown): ReactElement<SVGElement> => {
    const { x, y, payload } = props as { x?: number; y?: number; payload?: { value?: string } };
    const key = payload?.value ?? "";
    const selected = key === selectedKey;
    const tx = Number(x ?? 0);
    const ty = Number(y ?? 0);
    const label = labels.get(key) ?? key;
    return (
      <g
        className={onSelect ? "group cursor-pointer" : undefined}
        onClick={onSelect ? () => { selectKey(key); } : undefined}
        role={onSelect ? "button" : undefined}
        aria-label={onSelect ? `Select ${label}` : undefined}
        data-testid={`stack-label-${key}`}
      >
        {onSelect && <rect x={tx - yWidth + 4} y={ty - 14} width={yWidth - 8} height={28} fill="transparent" />}
        <text
          x={tx}
          y={ty}
          dy={4}
          textAnchor="end"
          fontSize={11.5}
          fontWeight={selected ? 700 : 400}
          fill={selected ? "var(--color-heading)" : "var(--color-foreground)"}
          className={onSelect ? "group-hover:underline" : undefined}
        >
          {label}
        </text>
      </g>
    );
  };

  // Value at the bar tip as a pill in the band fill with dark text (or a plain
  // muted number when the row has no band).
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
    const text = String(Math.round(row.value));
    const cx = Number(x ?? 0) + Number(width ?? 0) + 8;
    const cy = Number(y ?? 0) + Number(barHeight ?? 0) / 2;
    if (!row.band) {
      return (
        <text x={cx} y={cy} dy={4} fontSize={11} fontWeight={700} fill="var(--color-foreground-muted)">
          {text}
        </text>
      );
    }
    const w = 12 + text.length * 7;
    return (
      <g>
        <rect x={cx} y={cy - 9} width={w} height={18} rx={9} fill={bandVar(row.band)} />
        <text
          x={cx + w / 2}
          y={cy}
          dy={4}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill="var(--color-on-band)"
          className="tabular"
        >
          {text}
        </text>
      </g>
    );
  };

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: showValue ? 44 : 12, left: 4, bottom: 4 }}
          barCategoryGap="26%"
          maxBarSize={18}
        >
          {selectedKey && (
            <ReferenceArea y1={selectedKey} y2={selectedKey} fill="var(--color-selection)" fillOpacity={1} stroke="none" />
          )}
          <XAxis
            type="number"
            domain={xMax !== undefined ? [0, xMax] : undefined}
            tick={{ fontSize: 10.5, fill: "var(--color-foreground-muted)" }}
          />
          <YAxis type="category" dataKey="key" width={yWidth} tick={renderTick} />
          <Tooltip content={<StackTooltip />} cursor={{ fill: "var(--color-muted)", fillOpacity: 0.6 }} />
          {CATEGORIES.map((c, ci) => (
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
                <Cell key={d.key} cursor={onSelect ? "pointer" : "default"} />
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

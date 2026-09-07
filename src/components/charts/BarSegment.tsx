import type { ReactElement } from "react";

/**
 * Custom Recharts bar `shape` for stacked series: every segment keeps a 2px
 * surface gap to the next one, and the data-end segment (top of a column,
 * right end of a bar) gets rounded corners. The end segment is found from the
 * datum itself — the last key in `keys` with a positive value — so a stack
 * whose upper categories are zero still rounds the segment that is visibly
 * on top.
 */

const GAP = 2;
const RADIUS = 4;

type Orientation = "column" | "bar";

interface ShapeProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  cursor?: string;
  payload?: Record<string, unknown>;
}

function isEndSegment(payload: Record<string, unknown> | undefined, key: string, keys: readonly string[]): boolean {
  if (!payload) return true;
  for (let i = keys.length - 1; i >= 0; i--) {
    const v = payload[keys[i]];
    if (typeof v === "number" && v > 0) return keys[i] === key;
  }
  return true;
}

function columnEndPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function barEndPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(RADIUS, h / 2, w);
  return `M${x},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h - r} Q${x + w},${y + h} ${x + w - r},${y + h} H${x} Z`;
}

/** Build the shape renderer for one series of a stack. */
export function makeSegmentShape(key: string, keys: readonly string[], orientation: Orientation) {
  return function Segment(props: unknown): ReactElement {
    const { x = 0, y = 0, width = 0, height = 0, fill, cursor, payload } = props as ShapeProps;
    if (width <= 0 || height <= 0) return <g />;
    const end = isEndSegment(payload, key, keys);
    const style = cursor ? { cursor } : undefined;

    if (orientation === "column") {
      if (end) return <path d={columnEndPath(x, y, width, height)} fill={fill} style={style} />;
      const h = Math.max(0, height - GAP);
      return <rect x={x} y={y + GAP} width={width} height={h} fill={fill} style={style} />;
    }
    if (end) return <path d={barEndPath(x, y, width, height)} fill={fill} style={style} />;
    const w = Math.max(0, width - GAP);
    return <rect x={x} y={y} width={w} height={height} fill={fill} style={style} />;
  };
}

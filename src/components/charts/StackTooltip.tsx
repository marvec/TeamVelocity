/** Shared tooltip for the stacked-category charts — shows EXACT counts + LOC. */

import type { VelocityBand } from "../../../shared/types";
import type { StackDatum } from "../../lib/format";
import { CATEGORIES, formatNumber } from "../../lib/format";
import { BandChip } from "../ui/BandChip";

interface StackPayload extends StackDatum {
  label?: string;
  velocity?: number;
  band?: VelocityBand;
}

interface TooltipItem {
  payload?: StackPayload;
}

export interface StackTooltipProps {
  active?: boolean;
  label?: string;
  payload?: TooltipItem[];
  /** Title override (e.g. a member/repo name); defaults to the datum label. */
  title?: string;
}

export function StackTooltip({ active, payload, title }: StackTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;
  const raw = datum.raw;
  return (
    <div className="rounded-control border-(length:--border-w) border-border bg-card p-2.5 text-xs shadow-md">
      <div className="mb-1 font-semibold text-heading">{title ?? datum.label}</div>
      {datum.velocity !== undefined && datum.band !== undefined && (
        <div className="mb-1 flex items-center gap-2">
          <BandChip band={datum.band} />
          <span className="tabular text-foreground">velocity {Math.round(datum.velocity)}</span>
        </div>
      )}
      <table className="mt-1">
        <tbody>
          {CATEGORIES.map((c) => (
            <tr key={c.key}>
              <td className="pr-2">
                <span className="mr-1.5 inline-block size-2 rounded-sm align-middle" style={{ backgroundColor: c.colorVar }} />
                {c.label}
              </td>
              <td className="tabular text-right text-foreground">{tooltipValue(c.key, raw)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function tooltipValue(key: string, raw: StackDatum["raw"]): string {
  switch (key) {
    case "prs":
      return formatNumber(raw.prsMerged);
    case "commits":
      return formatNumber(raw.commits);
    case "comments":
      return formatNumber(raw.comments);
    case "locAdd":
      return `+${formatNumber(raw.locAdded)}`;
    case "locRem":
      return `−${formatNumber(raw.locRemoved)}`;
    default:
      return "";
  }
}

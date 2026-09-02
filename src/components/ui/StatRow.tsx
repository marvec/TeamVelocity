import type { TotalsData } from "../../../shared/schema/data";
import { formatLoc, formatNumber } from "../../lib/format";
import { cn } from "../../lib/cn";

/** e.g. "3 PRs · 48 commits · 15 comments · 358 LOC +112/−246" (PRD §8 Section D). */
export function StatRow({ totals, className }: { totals: TotalsData; className?: string }) {
  const parts = [
    `${formatNumber(totals.prsMerged)} PRs`,
    `${formatNumber(totals.commits)} commits`,
    `${formatNumber(totals.comments)} comments`,
    formatLoc(totals.locAdded, totals.locRemoved),
  ];
  return (
    <div className={cn("tabular flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-foreground-muted", className)}>
      {parts.map((p, i) => (
        <span key={p} className="inline-flex items-center gap-2">
          {i > 0 && <span aria-hidden className="text-border">·</span>}
          <span>{p}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Display helpers: category/band → design tokens, number/LOC formatting, and
 * range selection. All colors reference @theme tokens (never hardcoded hex).
 */

import type { VelocityBand, VelocityWeights } from "../../shared/types";
import type { TotalsData, WeekSummary } from "../../shared/schema/data";
import { contributionSum, velocityContribution } from "../../shared/aggregate/velocity";
import type { RangePreset, Selection } from "./url-state";

/** LOC is scaled to hundreds of lines for stacked-bar heights (see PRD §8). */
export const LOC_SCALE = 100;

export type CategoryKey = "prs" | "commits" | "comments" | "locAdd" | "locRem";

export interface CategoryMeta {
  key: CategoryKey;
  label: string;
  /** Legend label (LOC series flags the ×100 scaling). */
  legendLabel: string;
  colorVar: string;
}

export const CATEGORIES: CategoryMeta[] = [
  { key: "prs", label: "PRs", legendLabel: "PRs merged", colorVar: "var(--color-cat-prs)" },
  { key: "commits", label: "Commits", legendLabel: "Commits", colorVar: "var(--color-cat-commits)" },
  { key: "comments", label: "Comments", legendLabel: "Comments", colorVar: "var(--color-cat-comments)" },
  { key: "locAdd", label: "LOC+", legendLabel: "LOC+ (×100)", colorVar: "var(--color-cat-loc-add)" },
  { key: "locRem", label: "LOC−", legendLabel: "LOC− (×100)", colorVar: "var(--color-cat-loc-remove)" },
];

/** One stacked-bar datum built from a Totals, with raw values kept for tooltips. */
export interface StackDatum {
  prs: number;
  commits: number;
  comments: number;
  locAdd: number;
  locRem: number;
  raw: TotalsData;
}

export function toStackDatum(totals: TotalsData): StackDatum {
  return {
    prs: totals.prsMerged,
    commits: totals.commits,
    comments: totals.comments,
    locAdd: totals.locAdded / LOC_SCALE,
    locRem: totals.locRemoved / LOC_SCALE,
    raw: totals,
  };
}

/**
 * A stacked datum whose segments are each category's contribution to the
 * velocity signal, scaled so the bar's total length equals `target` (a
 * velocity, or a repo's share of one). `raw` keeps the exact counts for the
 * tooltip. Use this — not `toStackDatum` — wherever the bar should read as
 * velocity rather than raw contribution volume.
 */
export function velocityStackDatum(totals: TotalsData, target: number, weights: VelocityWeights): StackDatum {
  const c = velocityContribution(totals, weights);
  const sum = contributionSum(c);
  const k = sum > 0 ? target / sum : 0;
  return {
    prs: c.prs * k,
    commits: c.commits * k,
    comments: c.comments * k,
    locAdd: c.locAdd * k,
    locRem: c.locRem * k,
    raw: totals,
  };
}

export function bandVar(band: VelocityBand): string {
  return `var(--color-band-${band})`;
}

/** Text in a band colour uses the readable `-ink` step, never the bright fill. */
export function bandTextClass(band: VelocityBand): string {
  return band === "green" ? "text-band-green-ink" : band === "yellow" ? "text-band-yellow-ink" : "text-band-red-ink";
}

export function bandBgClass(band: VelocityBand): string {
  return band === "green" ? "bg-band-green" : band === "yellow" ? "bg-band-yellow" : "bg-band-red";
}

const NUMBER_FMT = new Intl.NumberFormat("en-US");

export function formatNumber(n: number): string {
  return NUMBER_FMT.format(Math.round(n));
}

/** e.g. "358 LOC +112/−246". */
export function formatLoc(added: number, removed: number): string {
  return `${formatNumber(added + removed)} LOC +${formatNumber(added)}/−${formatNumber(removed)}`;
}

export function formatScore(score: number): string {
  return `${Math.round(score)}%`;
}

export function formatVelocity(v: number): number {
  return Math.round(v);
}

function shiftMonths(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1 - months, d);
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

const PRESET_MONTHS: Record<Exclude<RangePreset, "all" | "custom">, number> = {
  "1m": 1,
  "3m": 3,
  "6m": 6,
};

/**
 * The weeks within the selected range. Preset ranges are anchored to the most
 * recent week; custom uses explicit from/to. ISO date strings compare
 * lexicographically, so no Date math is needed for filtering.
 */
export function weeksInRange(weeks: WeekSummary[], selection: Selection): WeekSummary[] {
  if (weeks.length === 0) return [];
  if (selection.range === "all") return weeks;

  if (selection.range === "custom") {
    const from = selection.from ?? weeks[0].weekStart;
    const to = selection.to ?? weeks[weeks.length - 1].weekStart;
    return weeks.filter((w) => w.weekStart >= from && w.weekStart <= to);
  }

  const anchor = weeks[weeks.length - 1].weekStart;
  const cutoff = shiftMonths(anchor, PRESET_MONTHS[selection.range]);
  return weeks.filter((w) => w.weekStart >= cutoff);
}

/**
 * Pure derivations from a loaded WeekDetail: the "scope" (a member, or the whole
 * team) that Sections D drives off, plus repo aggregation. No I/O.
 */

import type { VelocityBand } from "../../shared/types";
import type {
  CommentRow,
  MemberWeekDetail,
  RepoRefLite,
  ScoredPr,
  TotalsData,
  WeekDetail,
} from "../../shared/schema/data";
import { emptyTotals, addTotals } from "../../shared/types";

export interface RepoTotals {
  repo: RepoRefLite;
  totals: TotalsData;
}

export interface Scope {
  /** Stable key: member handle, or "__team__". */
  key: string;
  name: string;
  totals: TotalsData;
  repos: RepoTotals[];
  prs: ScoredPr[];
  comments: CommentRow[];
  velocity?: number;
  band?: VelocityBand;
  warmingUp?: boolean;
}

export const TEAM_SCOPE_KEY = "__team__";

export function repoRefKey(repo: Pick<RepoRefLite, "owner" | "name">): string {
  return `${repo.owner}/${repo.name}`;
}

/** Sum per-repo totals across all members (team-wide repo breakdown). */
export function aggregateRepos(members: MemberWeekDetail[]): RepoTotals[] {
  const map = new Map<string, RepoTotals>();
  for (const m of members) {
    for (const rt of m.repos) {
      const key = repoRefKey(rt.repo);
      const existing = map.get(key);
      if (existing) addTotals(existing.totals, rt.totals);
      else map.set(key, { repo: rt.repo, totals: { ...rt.totals } });
    }
  }
  return [...map.values()].sort((a, b) => repoRefKey(a.repo).localeCompare(repoRefKey(b.repo)));
}

export function memberScope(m: MemberWeekDetail): Scope {
  return {
    key: m.handle,
    name: m.name,
    totals: m.totals,
    repos: [...m.repos].sort((a, b) => repoRefKey(a.repo).localeCompare(repoRefKey(b.repo))),
    prs: m.prs,
    comments: m.comments,
    velocity: m.velocity,
    band: m.velocityBand,
    warmingUp: m.warmingUp,
  };
}

export function teamScope(week: WeekDetail): Scope {
  const comments = week.members
    .flatMap((m) => m.comments)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.url.localeCompare(b.url));
  return {
    key: TEAM_SCOPE_KEY,
    name: "Whole team",
    totals: week.totals,
    repos: aggregateRepos(week.members),
    prs: week.prs,
    comments,
    velocity: week.velocity,
    band: week.velocityBand,
    warmingUp: week.warmingUp,
  };
}

/** Aggregate a set of week summaries into a single Totals (range overview). */
export function sumTotals(list: TotalsData[]): TotalsData {
  return list.reduce<TotalsData>((acc, t) => addTotals(acc, t), emptyTotals());
}

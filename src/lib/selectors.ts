/**
 * Pure derivations from a loaded WeekDetail: the "scope" (a member, or the whole
 * team) that Sections D drives off, plus repo aggregation. No I/O.
 */

import type { VelocityBand } from "../../shared/types";
import type {
  CommentRow,
  CommitRow,
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
  /** The repo's own velocity for this scope+week (independent, vs its own baseline). */
  velocity: number;
  velocityBand: VelocityBand;
  warmingUp: boolean;
}

export interface Scope {
  /** Stable key: member handle, or "__team__". */
  key: string;
  name: string;
  totals: TotalsData;
  repos: RepoTotals[];
  prs: ScoredPr[];
  comments: CommentRow[];
  commits: CommitRow[];
  velocity?: number;
  band?: VelocityBand;
  warmingUp?: boolean;
}

export const TEAM_SCOPE_KEY = "__team__";

export function repoRefKey(repo: Pick<RepoRefLite, "owner" | "name">): string {
  return `${repo.owner}/${repo.name}`;
}

export function memberScope(m: MemberWeekDetail): Scope {
  return {
    key: m.handle,
    name: m.name,
    totals: m.totals,
    repos: [...m.repos].sort((a, b) => repoRefKey(a.repo).localeCompare(repoRefKey(b.repo))),
    prs: m.prs,
    comments: m.comments,
    commits: m.commits,
    velocity: m.velocity,
    band: m.velocityBand,
    warmingUp: m.warmingUp,
  };
}

export function teamScope(week: WeekDetail): Scope {
  const comments = week.members
    .flatMap((m) => m.comments)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.url.localeCompare(b.url));
  const commits = week.members
    .flatMap((m) => m.commits)
    .sort((a, b) => a.committedAt.localeCompare(b.committedAt) || a.sha.localeCompare(b.sha));
  return {
    key: TEAM_SCOPE_KEY,
    name: "Whole team",
    totals: week.totals,
    repos: week.repos,
    prs: week.prs,
    comments,
    commits,
    velocity: week.velocity,
    band: week.velocityBand,
    warmingUp: week.warmingUp,
  };
}

/** Aggregate a set of week summaries into a single Totals (range overview). */
export function sumTotals(list: TotalsData[]): TotalsData {
  return list.reduce<TotalsData>((acc, t) => addTotals(acc, t), emptyTotals());
}

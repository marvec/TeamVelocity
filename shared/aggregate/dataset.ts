/**
 * Build the on-disk dataset (meta + weekly index + per-week detail) from
 * normalized connector entities. Pure and **source-agnostic** (PRD §3 invariant
 * #2): all metric math lives here and in the modules it composes, identical
 * across sources. The CLI writer validates the output against the Zod schema
 * before writing.
 */

import type {
  Commit,
  Comment,
  PrScoreWeights,
  PullRequest,
  RepoRef,
  SourceId,
  Totals,
  VelocityWeights,
} from "../types";
import { emptyTotals, repoKey } from "../types";
import type { Weekday, WeekWindow } from "./weeks";
import { enumerateWeeks, isoDate, weekKeyFor } from "./weeks";
import type { VelocityThresholds, WeekVelocity } from "./velocity";
import {
  DEFAULT_VELOCITY_WEIGHTS,
  computeVelocitySeries,
  rawWeeklySignal,
  velocityBand,
} from "./velocity";
import type { PrScoreInput } from "./pr-score";
import { DEFAULT_PR_SCORE_WEIGHTS, scorePullRequests } from "./pr-score";
import type {
  CommentRow,
  MemberWeekDetail,
  RepoRefLite,
  ScoredPr,
  TeamIndex,
  TeamMeta,
  WeekDetail,
  WeekSummary,
} from "../schema/data";

export interface DatasetMember {
  name: string;
  /** The source handle used to attribute contributions (e.g. GitHub login). */
  handle: string;
}

export interface DatasetTeam {
  id: string;
  name: string;
  source: SourceId;
  members: DatasetMember[];
  sprintStartsOn: Weekday;
  sprintStartHour: number;
  thresholds: VelocityThresholds;
  velocityWeights?: VelocityWeights;
  prScoreWeights?: PrScoreWeights;
}

export interface DatasetInput {
  team: DatasetTeam;
  since: Date;
  until: Date;
  pullRequests: PullRequest[];
  commits: Commit[];
  comments: Comment[];
  /** Timestamp recorded as `meta.lastPulledAt`. */
  now: Date;
}

export interface BuiltDataset {
  meta: TeamMeta;
  index: TeamIndex;
  /** Per-week detail keyed by weekStart id. */
  weeks: Record<string, WeekDetail>;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function toLite(repo: RepoRef): RepoRefLite {
  return { source: repo.source, owner: repo.owner, name: repo.name, url: repo.url };
}

type TotalsField = keyof Totals;

interface RepoTotals {
  repo: RepoRefLite;
  totals: Totals;
}

interface MemberAccum {
  totals: Totals;
  review: number;
  repoTotals: Map<string, RepoTotals>;
  prNumbers: Set<string>; // primary-week PRs, keyed repoKey#number
  comments: Comment[];
}

interface WeekAccum {
  window: WeekWindow;
  teamTotals: Totals;
  teamReview: number;
  prs: PullRequest[]; // PRs whose primary week is this window
  members: Map<string, MemberAccum>;
}

function newMemberAccum(): MemberAccum {
  return {
    totals: emptyTotals(),
    review: 0,
    repoTotals: new Map(),
    prNumbers: new Set(),
    comments: [],
  };
}

function prKey(pr: PullRequest): string {
  return `${repoKey(pr.repo)}#${pr.number}`;
}

function toScoreInput(pr: PullRequest): PrScoreInput {
  return {
    additions: pr.additions,
    deletions: pr.deletions,
    changedFiles: pr.changedFiles,
    reviewCommentsCount: pr.reviewCommentsCount,
    issueCommentsCount: pr.issueCommentsCount,
    reviewsCount: pr.reviewsCount,
    participants: pr.participants.length,
    commits: pr.commits,
    linkedIssues: pr.linkedIssues,
  };
}

export function buildTeamDataset(input: DatasetInput): BuiltDataset {
  const { team } = input;
  const weekCfg = { sprintStartsOn: team.sprintStartsOn, sprintStartHour: team.sprintStartHour };
  const windows = enumerateWeeks(input.since, input.until, weekCfg);
  const keyIndex = new Map(windows.map((w, i) => [w.key, i]));

  const memberByHandle = new Map<string, DatasetMember>();
  for (const m of team.members) memberByHandle.set(m.handle.toLowerCase(), m);

  const weeks: WeekAccum[] = windows.map((window) => {
    const members = new Map<string, MemberAccum>();
    for (const m of team.members) members.set(m.handle.toLowerCase(), newMemberAccum());
    return { window, teamTotals: emptyTotals(), teamReview: 0, prs: [], members };
  });

  const weekIdxOf = (date: Date): number | undefined => keyIndex.get(weekKeyFor(date, weekCfg));
  const matchMember = (handle: string): string | undefined => {
    const lower = handle.toLowerCase();
    return memberByHandle.has(lower) ? lower : undefined;
  };

  /** Add to team + (matched) member totals, and the member's repo totals. */
  function add(idx: number, memberLower: string | undefined, repo: RepoRef, field: TotalsField, amount: number): void {
    const w = weeks[idx];
    w.teamTotals[field] += amount;
    if (memberLower === undefined) return;
    const ma = w.members.get(memberLower);
    if (!ma) return;
    ma.totals[field] += amount;
    const rk = repoKey(repo);
    let rt = ma.repoTotals.get(rk);
    if (!rt) {
      rt = { repo: toLite(repo), totals: emptyTotals() };
      ma.repoTotals.set(rk, rt);
    }
    rt.totals[field] += amount;
  }

  // --- Pull requests ---
  for (const pr of input.pullRequests) {
    const member = matchMember(pr.authorHandle);

    const openedIdx = weekIdxOf(pr.createdAt);
    if (openedIdx !== undefined) add(openedIdx, member, pr.repo, "prsOpened", 1);

    if (pr.state === "merged" && pr.mergedAt) {
      const mergedIdx = weekIdxOf(pr.mergedAt);
      if (mergedIdx !== undefined) add(mergedIdx, member, pr.repo, "prsMerged", 1);
    }
    if (pr.state === "closed" && pr.closedAt) {
      const closedIdx = weekIdxOf(pr.closedAt);
      if (closedIdx !== undefined) add(closedIdx, member, pr.repo, "prsClosed", 1);
    }

    // LOC attributed to the delivery week (merged, else opened).
    const deliveryIdx = weekIdxOf(pr.mergedAt ?? pr.createdAt);
    if (deliveryIdx !== undefined) {
      add(deliveryIdx, member, pr.repo, "locAdded", pr.additions);
      add(deliveryIdx, member, pr.repo, "locRemoved", pr.deletions);
    }

    // Primary week for the detail PR list (merged, else closed, else opened).
    const primaryDate = pr.mergedAt ?? pr.closedAt ?? pr.createdAt;
    const primaryIdx = weekIdxOf(primaryDate);
    if (primaryIdx !== undefined) {
      weeks[primaryIdx].prs.push(pr);
      if (member !== undefined) weeks[primaryIdx].members.get(member)?.prNumbers.add(prKey(pr));
    }
  }

  // --- Commits ---
  for (const c of input.commits) {
    const idx = weekIdxOf(c.committedAt);
    if (idx === undefined) continue;
    add(idx, matchMember(c.authorHandle), c.repo, "commits", 1);
  }

  // --- Comments ---
  for (const cm of input.comments) {
    const idx = weekIdxOf(cm.createdAt);
    if (idx === undefined) continue;
    const member = matchMember(cm.authorHandle);
    add(idx, member, cm.repo, "comments", 1);
    if (cm.kind === "review" || cm.kind === "review_summary") {
      weeks[idx].teamReview += 1;
      if (member !== undefined) {
        const ma = weeks[idx].members.get(member);
        if (ma) ma.review += 1;
      }
    }
    if (member !== undefined) weeks[idx].members.get(member)?.comments.push(cm);
  }

  // --- Velocity series (team + per member) ---
  const velWeights = team.velocityWeights ?? DEFAULT_VELOCITY_WEIGHTS;
  const velOpts = { thresholds: team.thresholds };

  const teamRaw = weeks.map((w) =>
    rawWeeklySignal(
      {
        mergedPRs: w.teamTotals.prsMerged,
        prsOpened: w.teamTotals.prsOpened,
        reviewActivity: w.teamReview,
        commits: w.teamTotals.commits,
        locChanged: w.teamTotals.locAdded + w.teamTotals.locRemoved,
      },
      velWeights,
    ),
  );
  const teamVel = computeVelocitySeries(teamRaw, velOpts);

  const memberVel = new Map<string, WeekVelocity[]>();
  for (const m of team.members) {
    const lower = m.handle.toLowerCase();
    const raw = weeks.map((w) => {
      const ma = w.members.get(lower);
      if (!ma) return 0;
      return rawWeeklySignal(
        {
          mergedPRs: ma.totals.prsMerged,
          prsOpened: ma.totals.prsOpened,
          reviewActivity: ma.review,
          commits: ma.totals.commits,
          locChanged: ma.totals.locAdded + ma.totals.locRemoved,
        },
        velWeights,
      );
    });
    memberVel.set(lower, computeVelocitySeries(raw, velOpts));
  }

  // --- Score PRs within each week's set ---
  const prScoreWeights = team.prScoreWeights ?? DEFAULT_PR_SCORE_WEIGHTS;
  const scoredByWeek: ScoredPr[][] = weeks.map((w) => {
    const scores = scorePullRequests(w.prs.map(toScoreInput), prScoreWeights);
    const rows = w.prs.map((pr, i): ScoredPr => {
      const s = scores[i];
      const author = memberByHandle.get(pr.authorHandle.toLowerCase());
      return {
        source: pr.source,
        repo: toLite(pr.repo),
        number: pr.number,
        title: pr.title,
        authorHandle: pr.authorHandle,
        authorName: author?.name ?? null,
        state: pr.state,
        url: pr.url,
        createdAt: pr.createdAt.toISOString(),
        mergedAt: pr.mergedAt ? pr.mergedAt.toISOString() : null,
        closedAt: pr.closedAt ? pr.closedAt.toISOString() : null,
        score: round1(s.score),
        breakdown: {
          loc: round2(s.breakdown.loc),
          reviewActivity: round2(s.breakdown.reviewActivity),
          participants: round2(s.breakdown.participants),
          files: round2(s.breakdown.files),
          commits: round2(s.breakdown.commits),
          linkedIssues: round2(s.breakdown.linkedIssues),
        },
        stats: {
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changedFiles,
          commits: pr.commits,
          reviewComments: pr.reviewCommentsCount,
          issueComments: pr.issueCommentsCount,
          reviews: pr.reviewsCount,
          participants: pr.participants.length,
          linkedIssues: pr.linkedIssues,
        },
      };
    });
    return sortScoredPrs(rows);
  });

  // --- Assemble output ---
  const bandAt = (v: number): "red" | "yellow" | "green" => velocityBand(v, team.thresholds);

  const summaries: WeekSummary[] = weeks.map((w, i): WeekSummary => {
    const v = round1(teamVel[i].velocity);
    return {
      weekStart: w.window.key,
      weekEnd: isoDate(w.window.weekEnd),
      label: w.window.label,
      velocity: v,
      velocityBand: bandAt(v),
      warmingUp: teamVel[i].warmingUp,
      totals: w.teamTotals,
      members: team.members.map((m) => {
        const lower = m.handle.toLowerCase();
        const ma = w.members.get(lower);
        const mv = round1((memberVel.get(lower) ?? [])[i]?.velocity ?? 0);
        return {
          handle: m.handle,
          name: m.name,
          velocity: mv,
          velocityBand: bandAt(mv),
          warmingUp: (memberVel.get(lower) ?? [])[i]?.warmingUp ?? true,
          totals: ma ? ma.totals : emptyTotals(),
        };
      }),
    };
  });

  const weekDetails: Record<string, WeekDetail> = {};
  weeks.forEach((w, i) => {
    const scored = scoredByWeek[i];
    const scoredByPrKey = new Map(scored.map((s) => [`${repoKey(s.repo)}#${s.number}`, s]));
    const v = round1(teamVel[i].velocity);

    const members: MemberWeekDetail[] = team.members.map((m) => {
      const lower = m.handle.toLowerCase();
      const ma = w.members.get(lower) ?? newMemberAccum();
      const mv = round1((memberVel.get(lower) ?? [])[i]?.velocity ?? 0);
      const repos: RepoTotals[] = [...ma.repoTotals.values()].sort((a, b) =>
        `${a.repo.owner}/${a.repo.name}`.localeCompare(`${b.repo.owner}/${b.repo.name}`),
      );
      const prs = [...ma.prNumbers]
        .map((k) => scoredByPrKey.get(k))
        .filter((s): s is ScoredPr => s !== undefined);
      const comments: CommentRow[] = ma.comments
        .map(
          (c): CommentRow => ({
            kind: c.kind,
            repo: toLite(c.repo),
            prNumber: c.prNumber ?? null,
            createdAt: c.createdAt.toISOString(),
            url: c.url,
          }),
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.url.localeCompare(b.url));
      return {
        handle: m.handle,
        name: m.name,
        velocity: mv,
        velocityBand: bandAt(mv),
        warmingUp: (memberVel.get(lower) ?? [])[i]?.warmingUp ?? true,
        totals: ma.totals,
        repos,
        prs: sortScoredPrs(prs),
        comments,
      };
    });

    weekDetails[w.window.key] = {
      weekStart: w.window.key,
      weekEnd: isoDate(w.window.weekEnd),
      label: w.window.label,
      velocity: v,
      velocityBand: bandAt(v),
      warmingUp: teamVel[i].warmingUp,
      totals: w.teamTotals,
      prs: scored,
      members,
    };
  });

  const firstStable = teamVel.findIndex((v) => !v.warmingUp);
  const warmingUpUntil = firstStable >= 0 ? windows[firstStable]?.key ?? null : null;

  const meta: TeamMeta = {
    teamId: team.id,
    name: team.name,
    source: team.source,
    lastPulledAt: input.now.toISOString(),
    rangeStart: windows.length > 0 ? windows[0].key : isoDate(input.since),
    rangeEnd: windows.length > 0 ? isoDate(windows[windows.length - 1].weekEnd) : isoDate(input.until),
    sprintStartsOn: team.sprintStartsOn,
    sprintStartHour: team.sprintStartHour,
    warmingUpUntil,
    thresholds: team.thresholds,
  };

  return { meta, index: { weeks: summaries }, weeks: weekDetails };
}

/** Deterministic ordering: score desc, then repo, then PR number. */
function sortScoredPrs(rows: ScoredPr[]): ScoredPr[] {
  return [...rows].sort(
    (a, b) =>
      b.score - a.score ||
      `${a.repo.owner}/${a.repo.name}`.localeCompare(`${b.repo.owner}/${b.repo.name}`) ||
      a.number - b.number,
  );
}

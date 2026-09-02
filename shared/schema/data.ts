/**
 * Zod schemas for the on-disk JSON contract under public/data/ (PRD §6.2).
 * The CLI writer validates before writing; the SPA loader validates after
 * fetching. Both import THIS file so drift fails loud on either side.
 *
 * Dates are ISO strings on disk: `YYYY-MM-DD` for day-granular fields and full
 * ISO datetimes for timestamps.
 */

import { z } from "zod";

export const SourceIdSchema = z.enum(["github", "bitbucket", "jira"]);
export const PrStateSchema = z.enum(["open", "merged", "closed"]);
export const CommentKindSchema = z.enum(["issue", "review", "review_summary"]);
export const VelocityBandSchema = z.enum(["red", "yellow", "green"]);

const isoDate = z.iso.date();
const isoDateTime = z.iso.datetime();
const count = z.number().int().nonnegative();
const score01to100 = z.number().min(0).max(100);

/** teams.json — the team-select index (no member/token data). */
export const TeamsIndexSchema = z.array(
  z.strictObject({
    id: z.string(),
    name: z.string(),
  }),
);
export type TeamsIndex = z.infer<typeof TeamsIndexSchema>;

/** The five contribution categories + split LOC. */
export const TotalsSchema = z.strictObject({
  prsOpened: count,
  prsMerged: count,
  prsClosed: count,
  commits: count,
  comments: count,
  locAdded: count,
  locRemoved: count,
});
export type TotalsData = z.infer<typeof TotalsSchema>;

/** <teamId>/meta.json */
export const TeamMetaSchema = z.strictObject({
  teamId: z.string(),
  name: z.string(),
  source: SourceIdSchema,
  lastPulledAt: isoDateTime,
  rangeStart: isoDate,
  rangeEnd: isoDate,
  sprintStartsOn: z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]),
  sprintStartHour: z.number().int().min(0).max(23),
  /** ISO date until which velocity is provisional, or null once history is stable. */
  warmingUpUntil: isoDate.nullable(),
  thresholds: z.strictObject({ red: score01to100, green: score01to100 }),
});
export type TeamMeta = z.infer<typeof TeamMetaSchema>;

const RepoRefLiteSchema = z.strictObject({
  source: SourceIdSchema,
  owner: z.string(),
  name: z.string(),
  url: z.string(),
});
export type RepoRefLite = z.infer<typeof RepoRefLiteSchema>;

const MemberWeekSummarySchema = z.strictObject({
  handle: z.string(),
  name: z.string(),
  velocity: score01to100,
  velocityBand: VelocityBandSchema,
  warmingUp: z.boolean(),
  totals: TotalsSchema,
});

const WeekSummarySchema = z.strictObject({
  weekStart: isoDate,
  weekEnd: isoDate,
  label: z.string(),
  velocity: score01to100,
  velocityBand: VelocityBandSchema,
  warmingUp: z.boolean(),
  totals: TotalsSchema,
  members: z.array(MemberWeekSummarySchema),
});
export type WeekSummary = z.infer<typeof WeekSummarySchema>;

/** <teamId>/index.json — the full weekly series, loaded up front. */
export const TeamIndexSchema = z.strictObject({
  weeks: z.array(WeekSummarySchema),
});
export type TeamIndex = z.infer<typeof TeamIndexSchema>;

/** Per-signal weighted contributions to a PR score (sum ≈ score). */
const PrScoreBreakdownSchema = z.strictObject({
  loc: z.number().nonnegative(),
  reviewActivity: z.number().nonnegative(),
  participants: z.number().nonnegative(),
  files: z.number().nonnegative(),
  commits: z.number().nonnegative(),
  linkedIssues: z.number().nonnegative(),
});

/** Raw counts behind a PR (for tooltips + the repo stat row). */
const PrStatsSchema = z.strictObject({
  additions: count,
  deletions: count,
  changedFiles: count,
  commits: count,
  reviewComments: count,
  issueComments: count,
  reviews: count,
  participants: count,
  linkedIssues: count,
});

/** A scored PR row in a week's detail. */
export const ScoredPrSchema = z.strictObject({
  source: SourceIdSchema,
  repo: RepoRefLiteSchema,
  number: z.number().int().positive(),
  title: z.string(),
  authorHandle: z.string(),
  authorName: z.string().nullable(),
  state: PrStateSchema,
  url: z.string(),
  createdAt: isoDateTime,
  mergedAt: isoDateTime.nullable(),
  closedAt: isoDateTime.nullable(),
  score: score01to100,
  breakdown: PrScoreBreakdownSchema,
  stats: PrStatsSchema,
});
export type ScoredPr = z.infer<typeof ScoredPrSchema>;

const CommentRowSchema = z.strictObject({
  kind: CommentKindSchema,
  repo: RepoRefLiteSchema,
  prNumber: z.number().int().positive().nullable(),
  createdAt: isoDateTime,
  url: z.string(),
});
export type CommentRow = z.infer<typeof CommentRowSchema>;

const RepoTotalsSchema = z.strictObject({
  repo: RepoRefLiteSchema,
  totals: TotalsSchema,
});

const MemberWeekDetailSchema = z.strictObject({
  handle: z.string(),
  name: z.string(),
  velocity: score01to100,
  velocityBand: VelocityBandSchema,
  warmingUp: z.boolean(),
  totals: TotalsSchema,
  repos: z.array(RepoTotalsSchema),
  prs: z.array(ScoredPrSchema),
  comments: z.array(CommentRowSchema),
});
export type MemberWeekDetail = z.infer<typeof MemberWeekDetailSchema>;

/** <teamId>/weeks/<weekStart>.json — one week's drill-down detail. */
export const WeekDetailSchema = z.strictObject({
  weekStart: isoDate,
  weekEnd: isoDate,
  label: z.string(),
  velocity: score01to100,
  velocityBand: VelocityBandSchema,
  warmingUp: z.boolean(),
  totals: TotalsSchema,
  prs: z.array(ScoredPrSchema),
  members: z.array(MemberWeekDetailSchema),
});
export type WeekDetail = z.infer<typeof WeekDetailSchema>;

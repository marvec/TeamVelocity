/**
 * Zod schema for `teamvelocity.config.json` (PRD §4). Parsing is pure so it can
 * be unit-tested directly; the CLI wraps it with file I/O in `cli/config.ts`.
 */

import { z } from "zod";

export const WeekdaySchema = z.enum(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);

/** Strip a full GitHub profile URL / leading @ down to a bare handle. */
export function normalizeGithubHandle(input: string): string {
  let handle = input.trim();
  const urlMatch = /^https?:\/\/github\.com\/([^/?#]+)/i.exec(handle);
  if (urlMatch) handle = urlMatch[1];
  if (handle.startsWith("@")) handle = handle.slice(1);
  return handle.replace(/\/+$/, "");
}

const GithubHandleSchema = z
  .string()
  .min(1)
  .transform(normalizeGithubHandle)
  .refine((h) => /^[A-Za-z0-9-]+$/.test(h), {
    error: 'github must be a handle or https://github.com/<handle> URL',
  });

export const MemberSchema = z
  .strictObject({
    name: z.string().min(1),
    github: GithubHandleSchema.optional(),
    bitbucket: z.string().min(1).optional(),
  })
  .refine((m) => m.github !== undefined || m.bitbucket !== undefined, {
    error: "member needs at least one source handle (github or bitbucket)",
  });

const RepoSlugSchema = z
  .string()
  .regex(/^[^/\s]+\/[^/\s]+$/, { error: 'repo must be in "owner/name" form' });

export const VelocityWeightsSchema = z
  .strictObject({
    wPR: z.number().nonnegative(),
    wReview: z.number().nonnegative(),
    wCommit: z.number().nonnegative(),
    wOpen: z.number().nonnegative(),
    wLoc: z.number().nonnegative(),
  })
  .partial();

export const PrScoreWeightsSchema = z
  .strictObject({
    loc: z.number().nonnegative(),
    reviewActivity: z.number().nonnegative(),
    participants: z.number().nonnegative(),
    files: z.number().nonnegative(),
    commits: z.number().nonnegative(),
    linkedIssues: z.number().nonnegative(),
  })
  .partial();

export const ThresholdsSchema = z.strictObject({
  red: z.number().min(0).max(100),
  green: z.number().min(0).max(100),
});

export const TeamConfigSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, {
    error: "team id must be a slug (lowercase letters, digits, hyphens)",
  }),
  name: z.string().min(1),
  sprintStartsOn: WeekdaySchema.default("Mon"),
  sprintStartHour: z.number().int().min(0).max(23).default(0),
  members: z.array(MemberSchema).min(1),
  repos: z.array(RepoSlugSchema).default([]),
  velocityWeights: VelocityWeightsSchema.optional(),
  prScoreWeights: PrScoreWeightsSchema.optional(),
  thresholds: ThresholdsSchema.optional(),
});

export const AppConfigSchema = z
  .strictObject({
    teams: z.array(TeamConfigSchema).min(1),
  })
  .refine(
    (cfg) => new Set(cfg.teams.map((t) => t.id)).size === cfg.teams.length,
    { error: "team ids must be unique" },
  );

export type AppConfig = z.infer<typeof AppConfigSchema>;
export type TeamConfig = z.infer<typeof TeamConfigSchema>;
export type Member = z.infer<typeof MemberSchema>;
export type Weekday = z.infer<typeof WeekdaySchema>;

/** Thrown when config validation fails, carrying a human-readable message. */
export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Validate an already-parsed config object. Throws {@link ConfigError} with a
 * clean multi-line message on any problem. Pure — no file I/O.
 */
export function parseAppConfig(raw: unknown): AppConfig {
  const result = AppConfigSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigError(z.prettifyError(result.error));
  }
  return result.data;
}

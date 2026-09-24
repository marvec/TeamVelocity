/**
 * Zod schema for the pull cache under `.cache/pull/<source>/<handle>.json`
 * (design: docs/superpowers/specs/2026-09-15-incremental-pull-design.md §3).
 *
 * The cache stores **normalized, source-agnostic entities** — the same domain
 * model every connector produces — so one implementation serves GitHub today
 * and Bitbucket/JIRA later. Dates are `Date` in memory and ISO strings on disk.
 *
 * Unlike `public/data/` (invariant #4, fail loud), the cache is **disposable**:
 * callers are expected to catch a parse failure, warn, and re-fetch that handle.
 * The strictness here exists to detect drift, not to abort a pull.
 */

import { z } from "zod";
import type { Comment, Commit, PullRequest, RepoRef, SourceId } from "../types";
import { SourceIdSchema, PrStateSchema, CommentKindSchema } from "./data";

/** Bump when the on-disk shape changes; an older file is discarded, not migrated. */
export const CACHE_VERSION = 1;

const isoDateTime = z.iso.datetime();
const count = z.number().int().nonnegative();

const RepoRefSchema = z.strictObject({
  source: SourceIdSchema,
  owner: z.string(),
  name: z.string(),
  url: z.string(),
});

const StoredPrSchema = z.strictObject({
  source: SourceIdSchema,
  repo: RepoRefSchema,
  number: z.number().int().positive(),
  title: z.string(),
  authorHandle: z.string(),
  state: PrStateSchema,
  createdAt: isoDateTime,
  mergedAt: isoDateTime.nullable(),
  closedAt: isoDateTime.nullable(),
  additions: count,
  deletions: count,
  changedFiles: count,
  commits: count,
  reviewCommentsCount: count,
  issueCommentsCount: count,
  reviewsCount: count,
  participants: z.array(z.string()),
  linkedIssues: count,
  url: z.string(),
});

const StoredCommitSchema = z.strictObject({
  source: SourceIdSchema,
  repo: RepoRefSchema,
  sha: z.string(),
  authorHandle: z.string(),
  committedAt: isoDateTime,
  additions: count,
  deletions: count,
  url: z.string(),
});

const StoredCommentSchema = z.strictObject({
  source: SourceIdSchema,
  repo: RepoRefSchema,
  kind: CommentKindSchema,
  authorHandle: z.string(),
  createdAt: isoDateTime,
  prNumber: z.number().int().positive().nullable(),
  url: z.string(),
});

export const HandleCacheFileSchema = z.strictObject({
  version: z.literal(CACHE_VERSION),
  source: SourceIdSchema,
  handle: z.string().min(1),
  /** Absent until something has actually been fetched for this handle. */
  coverage: z.strictObject({ since: isoDateTime, until: isoDateTime }).nullable(),
  /** Keyed `${repoKey}#${number}`; a PR owns its commits so a re-fetch replaces them as a unit. */
  prs: z.record(z.string(), z.strictObject({ pr: StoredPrSchema, commits: z.array(StoredCommitSchema) })),
  /** Keyed by comment url. */
  comments: z.record(z.string(), StoredCommentSchema),
  /** Keyed by SHA — only commits owned by no PR. */
  commits: z.record(z.string(), StoredCommitSchema),
  repos: z.array(RepoRefSchema),
});

export type HandleCacheFile = z.infer<typeof HandleCacheFileSchema>;

/** A pull request together with the commits it owns. */
export interface CachedPr {
  pr: PullRequest;
  commits: Commit[];
}

/** The in-memory form: same data, `Date`s instead of ISO strings, maps instead of records. */
export interface HandleCache {
  source: SourceId;
  handle: string;
  /** The single interval of activity time fully fetched for this handle. */
  coverage?: { since: Date; until: Date };
  prs: Map<string, CachedPr>;
  comments: Map<string, Comment>;
  commits: Map<string, Commit>;
  repos: RepoRef[];
}

export function emptyHandleCache(source: SourceId, handle: string): HandleCache {
  return { source, handle, prs: new Map(), comments: new Map(), commits: new Map(), repos: [] };
}

function storePr(pr: PullRequest): z.input<typeof StoredPrSchema> {
  return {
    ...pr,
    createdAt: pr.createdAt.toISOString(),
    mergedAt: pr.mergedAt ? pr.mergedAt.toISOString() : null,
    closedAt: pr.closedAt ? pr.closedAt.toISOString() : null,
  };
}

function loadPr(raw: HandleCacheFile["prs"][string]["pr"]): PullRequest {
  const { createdAt, mergedAt, closedAt, ...rest } = raw;
  return {
    ...rest,
    createdAt: new Date(createdAt),
    ...(mergedAt === null ? {} : { mergedAt: new Date(mergedAt) }),
    ...(closedAt === null ? {} : { closedAt: new Date(closedAt) }),
  };
}

function storeCommit(commit: Commit): z.input<typeof StoredCommitSchema> {
  return { ...commit, committedAt: commit.committedAt.toISOString() };
}

function loadCommit(raw: z.infer<typeof StoredCommitSchema>): Commit {
  return { ...raw, committedAt: new Date(raw.committedAt) };
}

function storeComment(comment: Comment): z.input<typeof StoredCommentSchema> {
  return {
    ...comment,
    createdAt: comment.createdAt.toISOString(),
    prNumber: comment.prNumber ?? null,
  };
}

function loadComment(raw: z.infer<typeof StoredCommentSchema>): Comment {
  const { createdAt, prNumber, ...rest } = raw;
  return {
    ...rest,
    createdAt: new Date(createdAt),
    ...(prNumber === null ? {} : { prNumber }),
  };
}

function fromEntries<T, U>(map: Map<string, T>, to: (value: T) => U): Record<string, U> {
  const out: Record<string, U> = {};
  for (const [key, value] of map) out[key] = to(value);
  return out;
}

function toMap<T, U>(record: Record<string, T>, from: (value: T) => U): Map<string, U> {
  return new Map(Object.entries(record).map(([key, value]) => [key, from(value)]));
}

/** The JSON-ready form of a cache, validated on the way out. */
export function serializeHandleCache(cache: HandleCache): HandleCacheFile {
  return HandleCacheFileSchema.parse({
    version: CACHE_VERSION,
    source: cache.source,
    handle: cache.handle,
    coverage: cache.coverage
      ? { since: cache.coverage.since.toISOString(), until: cache.coverage.until.toISOString() }
      : null,
    prs: fromEntries(cache.prs, (entry) => ({
      pr: storePr(entry.pr),
      commits: entry.commits.map(storeCommit),
    })),
    comments: fromEntries(cache.comments, storeComment),
    commits: fromEntries(cache.commits, storeCommit),
    repos: cache.repos,
  });
}

/**
 * Validate and revive a cache file. **Throws** on any drift; the caller is
 * expected to warn and treat the handle as uncached rather than fail the pull.
 */
export function parseHandleCache(raw: unknown): HandleCache {
  const file = HandleCacheFileSchema.parse(raw);
  return {
    source: file.source,
    handle: file.handle,
    ...(file.coverage === null
      ? {}
      : { coverage: { since: new Date(file.coverage.since), until: new Date(file.coverage.until) } }),
    prs: toMap(file.prs, (entry) => ({ pr: loadPr(entry.pr), commits: entry.commits.map(loadCommit) })),
    comments: toMap(file.comments, loadComment),
    commits: toMap(file.commits, loadCommit),
    repos: file.repos,
  };
}

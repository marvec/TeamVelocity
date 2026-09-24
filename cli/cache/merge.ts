/**
 * Fold one fetched window into a handle's cache. Pure — returns a new cache and
 * never mutates the one it was given (design §6).
 *
 * Merging is last-write-wins per key, so callers fetch and merge windows
 * oldest-first and let the freshest observation of a record survive.
 */

import { repoKey } from "../../shared/types";
import type { HandleCache } from "../../shared/schema/cache";
import type { CollectResult } from "../connectors/types";
import type { Window } from "./plan";

function prKeyOf(repo: Parameters<typeof repoKey>[0], number: number): string {
  return `${repoKey(repo)}#${String(number)}`;
}

/** The smallest interval containing both, which is exact because windows touch or overlap. */
function unionCoverage(a: HandleCache["coverage"], b: Window | null): HandleCache["coverage"] {
  if (!b) return a;
  if (!a) return { since: b.since, until: b.until };
  return {
    since: new Date(Math.min(a.since.getTime(), b.since.getTime())),
    until: new Date(Math.max(a.until.getTime(), b.until.getTime())),
  };
}

/**
 * @param window the interval this fetch covered, or `null` when the fetch was
 * incomplete. Entities that did arrive are always kept — they are real — but a
 * partly-seen window must not be recorded as covered, or the missing slice is
 * never retried.
 */
export function mergeHandleCache(
  cache: HandleCache,
  fetched: CollectResult,
  window: Window | null,
): HandleCache {
  const prs = new Map(cache.prs);
  const comments = new Map(cache.comments);
  const commits = new Map(cache.commits);

  for (const collected of fetched.prs) {
    // The whole entry is replaced, commits included: a force-push rewrites SHAs,
    // and keeping the old ones would inflate the commit signal forever.
    prs.set(prKeyOf(collected.pr.repo, collected.pr.number), {
      pr: collected.pr,
      commits: [...collected.commits],
    });
  }
  for (const comment of fetched.comments) comments.set(comment.url, comment);
  for (const commit of fetched.commits) commits.set(commit.sha, commit);

  const repos = [...cache.repos];
  const seenRepos = new Set(repos.map(repoKey));
  for (const repo of fetched.repos) {
    const key = repoKey(repo);
    if (seenRepos.has(key)) continue;
    seenRepos.add(key);
    repos.push(repo);
  }

  return {
    source: cache.source,
    handle: cache.handle,
    coverage: unionCoverage(cache.coverage, window),
    prs,
    comments,
    commits,
    repos,
  };
}

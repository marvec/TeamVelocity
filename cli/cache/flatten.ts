/**
 * Collapse a set of collected/cached sources into the flat entity lists
 * `buildTeamDataset` consumes. Pure — no I/O.
 *
 * Every collection is de-duplicated here rather than at collection time, so a
 * source's own records never depend on what another source already contributed:
 *
 * - **PRs** by `prKey` — the same PR can surface from two handles.
 * - **Commits** by SHA — a SHA rides every PR that contains it (see
 *   {@link PrGroup}), so this is what keeps velocity's commit signal from
 *   double-counting a shared commit.
 * - **Comments** by author *and* url. A `review_summary` carries the reviewed
 *   PR's own url, so every reviewer of that PR shares it; url alone would keep
 *   one reviewer and silently drop the rest of the team's review activity.
 * - **Repos** by repo key.
 *
 * First occurrence wins; callers order sources so the preferred record is first.
 */

import type { Comment, Commit, PullRequest, RepoRef } from "../../shared/types";
import { prKey, repoKey } from "../../shared/types";
import type { CollectedEntities } from "../connectors/types";

export interface FlatEntities {
  pullRequests: PullRequest[];
  commits: Commit[];
  comments: Comment[];
  repos: RepoRef[];
}

/** Push `value` into `out` unless `key` was already taken. */
function addUnique<T>(seen: Set<string>, out: T[], key: string, value: T): void {
  if (seen.has(key)) return;
  seen.add(key);
  out.push(value);
}

export function flattenCollected(sources: readonly CollectedEntities[]): FlatEntities {
  const pullRequests: PullRequest[] = [];
  const commits: Commit[] = [];
  const comments: Comment[] = [];
  const repos: RepoRef[] = [];
  const seenPrs = new Set<string>();
  const seenCommits = new Set<string>();
  const seenComments = new Set<string>();
  const seenRepos = new Set<string>();

  for (const source of sources) {
    for (const collected of source.prs) {
      addUnique(seenPrs, pullRequests, prKey(collected.pr.repo, collected.pr.number), collected.pr);
      for (const commit of collected.commits) {
        addUnique(seenCommits, commits, commit.sha, commit);
      }
    }
    for (const commit of source.commits) {
      addUnique(seenCommits, commits, commit.sha, commit);
    }
    for (const comment of source.comments) {
      addUnique(seenComments, comments, `${comment.authorHandle}\u0000${comment.url}`, comment);
    }
    for (const repo of source.repos) {
      addUnique(seenRepos, repos, repoKey(repo), repo);
    }
  }

  return { pullRequests, commits, comments, repos };
}

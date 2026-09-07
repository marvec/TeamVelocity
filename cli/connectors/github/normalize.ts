/**
 * Pure normalization: raw GitHub shapes → source-agnostic domain entities
 * (PRD §6.1). No I/O, no metric math — just field mapping, so it is unit-tested
 * directly.
 */

import type { Comment, Commit, PrState, PullRequest, RepoRef } from "../../../shared/types";
import type { GhPullRequestNode, GhRepository, GhReviewedPrNode } from "./types";

export function repoFrom(repository: GhRepository): RepoRef {
  return {
    source: "github",
    owner: repository.owner.login,
    name: repository.name,
    url: repository.url,
  };
}

function prStateFrom(state: GhPullRequestNode["state"]): PrState {
  switch (state) {
    case "MERGED":
      return "merged";
    case "CLOSED":
      return "closed";
    default:
      return "open";
  }
}

export function normalizePullRequest(node: GhPullRequestNode, fallbackHandle: string): PullRequest {
  const repo = repoFrom(node.repository);
  return {
    source: "github",
    repo,
    number: node.number,
    title: node.title,
    authorHandle: node.author?.login ?? fallbackHandle,
    state: prStateFrom(node.state),
    createdAt: new Date(node.createdAt),
    mergedAt: node.mergedAt ? new Date(node.mergedAt) : undefined,
    closedAt: node.closedAt ? new Date(node.closedAt) : undefined,
    additions: node.additions,
    deletions: node.deletions,
    changedFiles: node.changedFiles,
    commits: node.commits.totalCount,
    // GraphQL has no per-review-comment count; reviewThreads (inline discussion
    // threads) is the closest single-query proxy (verified against the schema).
    reviewCommentsCount: node.reviewThreads.totalCount,
    issueCommentsCount: node.comments.totalCount,
    reviewsCount: node.reviews.totalCount,
    participants: node.participants.nodes.map((p) => p.login),
    linkedIssues: node.closingIssuesReferences.totalCount,
    url: node.url,
  };
}

/**
 * A member reviewing a PR is recorded as a single `review_summary` comment at
 * the PR's last-updated time — a lightweight, bounded proxy for review activity
 * that avoids per-comment pagination (documented v1 decision, PRD §5).
 */
export function normalizeReviewComment(node: GhReviewedPrNode, reviewerHandle: string): Comment {
  return {
    source: "github",
    repo: repoFrom(node.repository),
    kind: "review_summary",
    authorHandle: reviewerHandle,
    createdAt: new Date(node.updatedAt),
    prNumber: node.number,
    url: node.url,
  };
}

/**
 * A pull request's own commits, each attributed to the PR's author. GitHub
 * commit authorship is unreliable across OSS repos (squash/rebase rewrites,
 * unverified author emails whose GitHub user resolves to null), so we credit the
 * tracked member whose PR this is rather than the commit's own author. Per-commit
 * line stats stay 0: velocity's LOC signal comes from the PR's additions/deletions
 * (PRD §5), so counting commit LOC too would double-count.
 */
export function commitsFromPr(node: GhPullRequestNode, authorHandle: string): Commit[] {
  const repo = repoFrom(node.repository);
  return node.commits.nodes.map(
    ({ commit }): Commit => ({
      source: "github",
      repo,
      sha: commit.oid,
      authorHandle,
      committedAt: new Date(commit.committedDate),
      additions: 0,
      deletions: 0,
      url: commit.url,
    }),
  );
}

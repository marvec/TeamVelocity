/**
 * GitHub source connector (PRD §5). Orchestrates fetch (via the injected
 * `GitHubClient`) + normalization. Contains no metric math.
 */

import type { Comment, Commit, PullRequest, RepoRef } from "../../../shared/types";
import { repoKey } from "../../../shared/types";
import type { Member } from "../../../shared/schema/config";
import type { CollectContext, CollectResult, SourceConnector } from "../types";
import type { GitHubClient } from "./types";
import { normalizeCommit, normalizePullRequest, normalizeReviewComment } from "./normalize";

export function createGitHubConnector(client: GitHubClient): SourceConnector {
  return {
    id: "github",

    supportsMember(member: Member): boolean {
      return member.github !== undefined;
    },

    async collect(ctx: CollectContext): Promise<CollectResult> {
      const { since, until, logger } = ctx;
      const pullRequests: PullRequest[] = [];
      const comments: Comment[] = [];
      const commits: Commit[] = [];
      const seenPrs = new Set<string>();
      const seenCommits = new Set<string>();
      const repos = new Map<string, RepoRef>();

      const addRepo = (repo: RepoRef): void => {
        const key = repoKey(repo);
        if (!repos.has(key)) repos.set(key, repo);
      };
      for (const repo of ctx.explicitRepos) addRepo(repo);

      const members = ctx.members.filter((m) => m.github !== undefined);

      // --- Authored PRs + reviewed-PR activity, per member ---
      for (const member of members) {
        const handle = member.github as string;
        try {
          const authored = await client.searchPrsByAuthor(handle, since, until);
          for (const node of authored) {
            const pr = normalizePullRequest(node, handle);
            const key = `${repoKey(pr.repo)}#${pr.number}`;
            if (seenPrs.has(key)) continue;
            seenPrs.add(key);
            pullRequests.push(pr);
            addRepo(pr.repo);
          }
        } catch (err) {
          logger.warn(`github: failed to fetch PRs for @${handle}: ${errorText(err)}`);
        }

        try {
          const reviewed = await client.searchPrsReviewedBy(handle, since, until);
          for (const node of reviewed) {
            comments.push(normalizeReviewComment(node, handle));
            addRepo({
              source: "github",
              owner: node.repository.owner.login,
              name: node.repository.name,
              url: node.repository.url,
            });
          }
        } catch (err) {
          logger.warn(`github: failed to fetch reviews for @${handle}: ${errorText(err)}`);
        }
      }

      // --- Commits per (repo, member) over the union of discovered + explicit repos ---
      const repoList = [...repos.values()];
      for (const repo of repoList) {
        for (const member of members) {
          const handle = member.github as string;
          try {
            const repoCommits = await client.listCommits(repo, handle, since, until);
            for (const node of repoCommits) {
              if (seenCommits.has(node.sha)) continue;
              seenCommits.add(node.sha);
              commits.push(normalizeCommit(node, handle));
            }
          } catch (err) {
            logger.warn(
              `github: failed to fetch commits for @${handle} in ${repo.owner}/${repo.name}: ${errorText(err)}`,
            );
          }
        }
      }

      logger.info(
        `github: ${String(pullRequests.length)} PRs, ${String(commits.length)} commits, ${String(comments.length)} review comments across ${String(repoList.length)} repos`,
      );

      return { pullRequests, commits, comments, repos: repoList };
    },
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

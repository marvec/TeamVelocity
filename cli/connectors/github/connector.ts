/**
 * GitHub source connector (PRD §5). Orchestrates fetch (via the injected
 * `GitHubClient`) + normalization. Contains no metric math.
 */

import type { Comment, RepoRef } from "../../../shared/types";
import { prKey, repoKey } from "../../../shared/types";
import type { Member } from "../../../shared/schema/config";
import type { CollectContext, CollectedPr, CollectResult, SourceConnector } from "../types";
import type { GitHubClient } from "./types";
import { commitsFromPr, normalizePullRequest, normalizeReviewComment } from "./normalize";

export function createGitHubConnector(client: GitHubClient): SourceConnector {
  return {
    id: "github",

    supportsMember(member: Member): boolean {
      return member.github !== undefined;
    },

    async collect(ctx: CollectContext): Promise<CollectResult> {
      const { since, until, logger } = ctx;
      const prs: CollectedPr[] = [];
      const comments: Comment[] = [];
      // A failed search is warned and skipped, never fatal — but the caller
      // needs to know the window was only partly seen so it is not cached as
      // covered.
      let complete = true;
      const seenPrs = new Set<string>();
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
            const key = prKey(pr.repo, pr.number);
            if (seenPrs.has(key)) continue;
            seenPrs.add(key);
            addRepo(pr.repo);

            // A PR's own commits (PRD §5), attributed to its author and kept
            // with the PR rather than in a flat list — see CollectedPr.
            prs.push({ pr, commits: commitsFromPr(node, pr.authorHandle) });
            // A PR's commit connection is one GraphQL page (first: 100). When a
            // PR exceeds that we warn rather than silently truncate. The extra
            // commits' SHAs/dates are unfetched, so velocity's commit-count signal
            // (wCommit) sees at most 100/PR — acceptable: it is log-dampened and
            // >100-commit PRs are pathologically rare.
            if (node.commits.totalCount > node.commits.nodes.length) {
              logger.warn(
                `github: ${pr.repo.owner}/${pr.repo.name}#${String(pr.number)} has ${String(node.commits.totalCount)} commits; only the first ${String(node.commits.nodes.length)} were fetched`,
              );
            }
          }
        } catch (err) {
          complete = false;
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
          complete = false;
          logger.warn(`github: failed to fetch reviews for @${handle}: ${errorText(err)}`);
        }
      }

      const repoList = [...repos.values()];
      const commitCount = prs.reduce((n, c) => n + c.commits.length, 0);
      logger.info(
        `github: ${String(prs.length)} PRs, ${String(commitCount)} commits, ${String(comments.length)} review comments across ${String(repoList.length)} repos`,
      );

      // What the pull actually cost. Fixtures report 0, so dry runs stay quiet.
      const { cost, remaining } = client.usage();
      if (cost > 0) {
        const left = remaining === null ? "" : `, ${String(remaining)} remaining`;
        logger.info(`github: ${String(cost)} GraphQL rate-limit points spent so far${left}`);
      }

      return { prs, commits: [], comments, repos: repoList, complete };
    },
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

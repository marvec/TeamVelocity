/**
 * GitHub source connector (PRD §5). Orchestrates fetch (via the injected
 * `GitHubClient`) + normalization. Contains no metric math.
 *
 * Members are searched in batches: every search page costs a rate-limit point
 * however few results it holds, so one query per handle puts a floor of two
 * points per member under every pull — the bulk of what an incremental pull
 * spends. One query per batch removes that floor, and results are then split
 * back to the member they belong to.
 */

import type { Comment, RepoRef } from "../../../shared/types";
import { prKey, repoKey } from "../../../shared/types";
import type { Member } from "../../../shared/schema/config";
import type {
  CollectByHandle,
  CollectContext,
  CollectedPr,
  CollectResult,
  SourceConnector,
} from "../types";
import type { GhPullRequestNode, GhReviewedPrNode, GitHubClient } from "./types";
import { batchHandles } from "./octokit-client";
import { commitsFromPr, normalizePullRequest, normalizeReviewComment, repoFrom } from "./normalize";

/** What one member's collection has gathered so far. */
interface Accumulator {
  prs: CollectedPr[];
  comments: Comment[];
  repos: Map<string, RepoRef>;
  seenPrs: Set<string>;
  complete: boolean;
}

function addRepo(acc: Accumulator, repo: RepoRef): void {
  const key = repoKey(repo);
  if (!acc.repos.has(key)) acc.repos.set(key, repo);
}

function halves(batch: string[]): string[][] {
  const mid = Math.ceil(batch.length / 2);
  return [batch.slice(0, mid), batch.slice(mid)];
}

function sameLogin(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The batch member who authored `node`, or undefined when that cannot be told.
 * A lone handle owns everything its search returned — even a PR whose author
 * account was deleted, or a bot — exactly as an unbatched search always did.
 */
function authorOf(node: GhPullRequestNode, batch: string[]): string | undefined {
  if (batch.length === 1) return batch[0];
  const login = node.author?.login;
  return login === undefined ? undefined : batch.find((h) => sameLogin(h, login));
}

/**
 * The batch members who reviewed `node`, or undefined when that cannot be told:
 * the search matched, so at least one of them did, but a review list GitHub cut
 * short (over 100 reviews) or one that names none of them leaves it open which.
 */
function reviewersOf(node: GhReviewedPrNode, batch: string[]): string[] | undefined {
  if (batch.length === 1) return batch;
  if (node.reviews.totalCount > node.reviews.nodes.length) return undefined;
  const logins = node.reviews.nodes.flatMap((r) => (r.author ? [r.author.login] : []));
  const found = batch.filter((h) => logins.some((login) => sameLogin(h, login)));
  return found.length > 0 ? found : undefined;
}

function mentions(handles: string[]): string {
  return handles.map((h) => `@${h}`).join(", ");
}

export function createGitHubConnector(client: GitHubClient): SourceConnector {
  return {
    id: "github",

    supportsMember(member: Member): boolean {
      return member.github !== undefined;
    },

    async collect(ctx: CollectContext): Promise<CollectByHandle> {
      const { since, until, logger } = ctx;
      const handles = [
        ...new Set(ctx.members.flatMap((m) => (m.github === undefined ? [] : [m.github]))),
      ];

      const accumulators = new Map<string, Accumulator>();
      for (const handle of handles) {
        const acc: Accumulator = { prs: [], comments: [], repos: new Map(), seenPrs: new Set(), complete: true };
        for (const repo of ctx.explicitRepos) addRepo(acc, repo);
        accumulators.set(handle, acc);
      }
      const accOf = (handle: string): Accumulator => accumulators.get(handle) as Accumulator;

      // A failed search is warned and skipped, never fatal — but the caller
      // needs to know which members' windows were only partly seen, so those
      // are not cached as covered.
      const markIncomplete = (batch: string[]): void => {
        for (const handle of batch) accOf(handle).complete = false;
      };

      const addAuthored = (handle: string, node: GhPullRequestNode): void => {
        const acc = accOf(handle);
        const pr = normalizePullRequest(node, handle);
        const key = prKey(pr.repo, pr.number);
        if (acc.seenPrs.has(key)) return;
        acc.seenPrs.add(key);
        addRepo(acc, pr.repo);

        // A PR's own commits (PRD §5), attributed to its author and kept
        // with the PR rather than in a flat list — see CollectedPr.
        acc.prs.push({ pr, commits: commitsFromPr(node, pr.authorHandle) });
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
      };

      /**
       * Credit PRs that matched the batch's `author:` qualifiers but name none
       * of its members as author — seen live for PRs the Copilot agent opened
       * on a member's behalf, and possible for deleted accounts. Each is
       * credited only to a member whose own search returns it, asking members
       * who take part in those PRs first and stopping once all have turned up.
       * One that never does was updated after `until` in the meantime, and the
       * next pull's overlap collects it under the right member.
       */
      const resolveUnowned = async (batch: string[], unowned: GhPullRequestNode[]): Promise<void> => {
        const remaining = new Map(unowned.map((node) => [node.url, node]));
        const takingPart = (h: string): boolean =>
          unowned.some((node) => node.participants.nodes.some((p) => sameLogin(p.login, h)));
        const order = [...batch.filter(takingPart), ...batch.filter((h) => !takingPart(h))];
        logger.debug(`github: ${String(unowned.length)} PR(s) authored by none of ${mentions(batch)} — asking who`);

        for (const handle of order) {
          if (remaining.size === 0) return;
          let outcome;
          try {
            outcome = await client.searchPrsByAuthors([handle], since, until);
          } catch (err) {
            // Whoever owns the rest is unknown, so no one's window is whole.
            markIncomplete(batch);
            logger.warn(`github: failed to fetch PRs for @${handle}: ${errorText(err)}`);
            return;
          }
          if (outcome.truncated) markIncomplete([handle]);
          for (const node of outcome.nodes) {
            if (!remaining.has(node.url)) continue;
            remaining.delete(node.url);
            addAuthored(handle, node);
          }
        }
      };

      // Both searches narrow the same way. A batch over GitHub's 1000-result
      // ceiling is halved and re-asked, because only a lone handle can be
      // recorded as truncated without stranding its teammates' results too.
      const searchAuthored = async (batch: string[]): Promise<void> => {
        let outcome;
        try {
          outcome = await client.searchPrsByAuthors(batch, since, until, { bailOnCap: batch.length > 1 });
        } catch (err) {
          markIncomplete(batch);
          logger.warn(`github: failed to fetch PRs for ${mentions(batch)}: ${errorText(err)}`);
          return;
        }
        if (outcome.truncated && batch.length > 1) {
          for (const half of halves(batch)) await searchAuthored(half);
          return;
        }
        // A truncated search saw only part of the window. Treating it as
        // complete would cache the window as covered and strand the rest.
        if (outcome.truncated) markIncomplete(batch);
        const unowned: GhPullRequestNode[] = [];
        for (const node of outcome.nodes) {
          const owner = authorOf(node, batch);
          if (owner === undefined) unowned.push(node);
          else addAuthored(owner, node);
        }
        if (unowned.length > 0) await resolveUnowned(batch, unowned);
      };

      const searchReviewed = async (batch: string[]): Promise<void> => {
        let outcome;
        try {
          outcome = await client.searchPrsReviewedBy(batch, since, until, { bailOnCap: batch.length > 1 });
        } catch (err) {
          markIncomplete(batch);
          logger.warn(`github: failed to fetch reviews for ${mentions(batch)}: ${errorText(err)}`);
          return;
        }
        if (outcome.truncated && batch.length > 1) {
          for (const half of halves(batch)) await searchReviewed(half);
          return;
        }
        // Unlike an authored PR, a reviewed one can belong to several members,
        // so there is no stopping early: an unclear one re-asks every member.
        // It takes a review list cut short at 100, or one naming none of them —
        // neither turned up across both live teams.
        const reviewers = outcome.nodes.map((node) => reviewersOf(node, batch));
        if (reviewers.some((found) => found === undefined)) {
          logger.debug(`github: could not tell who of ${mentions(batch)} reviewed some PRs — asking one by one`);
          for (const handle of batch) await searchReviewed([handle]);
          return;
        }
        if (outcome.truncated) markIncomplete(batch);
        outcome.nodes.forEach((node, i) => {
          for (const handle of reviewers[i] as string[]) {
            const acc = accOf(handle);
            acc.comments.push(normalizeReviewComment(node, handle));
            addRepo(acc, repoFrom(node.repository));
          }
        });
      };

      for (const batch of batchHandles(handles, since, until)) {
        await searchAuthored(batch);
        await searchReviewed(batch);
      }

      const results: CollectByHandle = new Map();
      let prCount = 0;
      let commitCount = 0;
      let commentCount = 0;
      const allRepos = new Set<string>();
      for (const [handle, acc] of accumulators) {
        const result: CollectResult = {
          prs: acc.prs,
          commits: [],
          comments: acc.comments,
          repos: [...acc.repos.values()],
          complete: acc.complete,
        };
        results.set(handle, result);
        prCount += acc.prs.length;
        commitCount += acc.prs.reduce((n, c) => n + c.commits.length, 0);
        commentCount += acc.comments.length;
        for (const key of acc.repos.keys()) allRepos.add(key);
      }
      logger.info(
        `github: ${String(prCount)} PRs, ${String(commitCount)} commits, ${String(commentCount)} review comments across ${String(allRepos.size)} repos`,
      );

      // What the pull actually cost. Fixtures report 0, so dry runs stay quiet.
      const { cost, remaining } = client.usage();
      if (cost > 0) {
        const left = remaining === null ? "" : `, ${String(remaining)} remaining`;
        logger.info(`github: ${String(cost)} GraphQL rate-limit points spent so far${left}`);
      }

      return results;
    },
  };
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

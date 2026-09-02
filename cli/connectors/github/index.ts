/** GitHub connector barrel + token-based factory. */
import type { Logger, SourceConnector } from "../types";
import { createGitHubConnector } from "./connector";
import { createOctokitGitHubClient } from "./octokit-client";

export { createGitHubConnector } from "./connector";
export { createOctokitGitHubClient } from "./octokit-client";
export type { GitHubClient, GhCommit, GhPullRequestNode, GhReviewedPrNode } from "./types";

/** Build a live GitHub connector from a token. */
export function createGitHubConnectorFromToken(token: string, logger?: Logger): SourceConnector {
  return createGitHubConnector(createOctokitGitHubClient(token, logger));
}

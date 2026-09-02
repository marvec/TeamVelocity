/**
 * Registers the v1 connectors. Importing this module wires GitHub into the
 * registry. Bitbucket/JIRA register here in the future with no other changes.
 */

import { registerConnector } from "./registry";
import { createGitHubConnectorFromToken } from "./github";

registerConnector("github", (deps) => {
  const token = deps.tokens.github ?? "";
  return createGitHubConnectorFromToken(token, deps.logger);
});

export * from "./registry";
export * from "./types";

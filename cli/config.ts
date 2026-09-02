/**
 * Load and validate `teamvelocity.config.json` from disk, and read the token
 * from the environment. The token stays a local value — never written to
 * public/data/, never logged (invariant #6). Under Bun, `.env` is auto-loaded
 * into `process.env`.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ConfigError, parseAppConfig, type AppConfig } from "../shared/schema/config";

const PLACEHOLDER_TOKEN = "ghp_replace_me";

export function loadConfig(path = "teamvelocity.config.json"): AppConfig {
  const full = resolve(process.cwd(), path);
  let text: string;
  try {
    text = readFileSync(full, "utf8");
  } catch {
    throw new ConfigError(
      `Config file not found: ${full}\n` +
        "Copy teamvelocity.config.example.json to teamvelocity.config.json and edit it.",
    );
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new ConfigError(`Config is not valid JSON (${full}): ${(e as Error).message}`);
  }
  return parseAppConfig(json);
}

/** The GitHub token from the environment, or undefined if absent/placeholder. */
export function getGithubToken(): string | undefined {
  const token = process.env.GITHUB_TOKEN?.trim();
  if (!token || token === PLACEHOLDER_TOKEN) return undefined;
  return token;
}

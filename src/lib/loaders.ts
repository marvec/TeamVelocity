/**
 * Fetch + Zod-validate the on-disk JSON contract (invariant #4: fail loud on
 * drift). Uses the SAME schemas as the CLI writer, imported from shared/.
 */

import { z } from "zod";
import {
  TeamIndexSchema,
  TeamMetaSchema,
  TeamsIndexSchema,
  WeekDetailSchema,
  type TeamIndex,
  type TeamMeta,
  type TeamsIndex,
  type WeekDetail,
} from "../../shared/schema/data";

export type LoadErrorKind = "not-found" | "network" | "invalid";

export class LoadError extends Error {
  readonly kind: LoadErrorKind;
  constructor(kind: LoadErrorKind, message: string) {
    super(message);
    this.name = "LoadError";
    this.kind = kind;
  }
}

async function fetchJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (e) {
    throw new LoadError("network", `Network error loading ${url}: ${(e as Error).message}`);
  }
  if (!res.ok) {
    throw new LoadError(res.status === 404 ? "not-found" : "network", `Failed to load ${url} (${String(res.status)})`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    // A dev-server SPA fallback can return HTML for a missing file.
    throw new LoadError("not-found", `No JSON at ${url}`);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new LoadError("invalid", `Schema drift in ${url}:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function loadTeams(dataDir: string): Promise<TeamsIndex> {
  return fetchJson(`${dataDir}/teams.json`, TeamsIndexSchema);
}

export function loadTeamMeta(dataDir: string, teamId: string): Promise<TeamMeta> {
  return fetchJson(`${dataDir}/${teamId}/meta.json`, TeamMetaSchema);
}

export function loadTeamIndex(dataDir: string, teamId: string): Promise<TeamIndex> {
  return fetchJson(`${dataDir}/${teamId}/index.json`, TeamIndexSchema);
}

export function loadWeekDetail(dataDir: string, teamId: string, weekStart: string): Promise<WeekDetail> {
  return fetchJson(`${dataDir}/${teamId}/weeks/${weekStart}.json`, WeekDetailSchema);
}

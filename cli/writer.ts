/**
 * Emit the public/data/ JSON contract. Every file is **validated against the
 * shared Zod schema before writing** (invariant #4); a validation failure aborts
 * the write. Output is pretty-printed with stable key order for meaningful diffs.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { BuiltDataset } from "../shared/aggregate/dataset";
import {
  TeamIndexSchema,
  TeamMetaSchema,
  TeamsIndexSchema,
  WeekDetailSchema,
  type TeamsIndex,
} from "../shared/schema/data";

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

/** Write teams.json (the team-select index; no member/token data). */
export async function writeTeamsIndex(dataDir: string, teams: TeamsIndex): Promise<void> {
  const validated = TeamsIndexSchema.parse(teams);
  await mkdir(dataDir, { recursive: true });
  await writeJson(join(dataDir, "teams.json"), validated);
}

/** Write one team's meta + index + per-week detail, replacing any prior output. */
export async function writeTeamDataset(dataDir: string, ds: BuiltDataset): Promise<void> {
  // Validate EVERYTHING before touching the filesystem, so a validation failure
  // never destroys the previously written dataset (atomic-ish; invariant #4).
  const meta = TeamMetaSchema.parse(ds.meta);
  const index = TeamIndexSchema.parse(ds.index);
  const weeks = Object.entries(ds.weeks).map(
    ([key, detail]) => [key, WeekDetailSchema.parse(detail)] as const,
  );

  const teamDir = join(dataDir, ds.meta.teamId);
  const weeksDir = join(teamDir, "weeks");
  await rm(teamDir, { recursive: true, force: true });
  await mkdir(weeksDir, { recursive: true });

  await writeJson(join(teamDir, "meta.json"), meta);
  await writeJson(join(teamDir, "index.json"), index);
  for (const [key, detail] of weeks) {
    await writeJson(join(weeksDir, `${key}.json`), detail);
  }
}

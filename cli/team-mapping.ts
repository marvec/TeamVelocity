/**
 * Map a validated config team to the inputs the aggregation + connector layers
 * need. Weight overrides from config are merged onto the documented defaults.
 */

import type { RepoRef, SourceId } from "../shared/types";
import type { Member, TeamConfig } from "../shared/schema/config";
import type { DatasetTeam } from "../shared/aggregate/dataset";
import { DEFAULT_THRESHOLDS, DEFAULT_VELOCITY_WEIGHTS } from "../shared/aggregate/velocity";
import { DEFAULT_PR_SCORE_WEIGHTS } from "../shared/aggregate/pr-score";

type GithubMember = Member & { github: string };

export function githubMembers(team: TeamConfig): GithubMember[] {
  return team.members.filter((m): m is GithubMember => m.github !== undefined);
}

export function toDatasetTeam(team: TeamConfig, source: SourceId): DatasetTeam {
  return {
    id: team.id,
    name: team.name,
    source,
    members: githubMembers(team).map((m) => ({ name: m.name, handle: m.github })),
    sprintStartsOn: team.sprintStartsOn,
    sprintStartHour: team.sprintStartHour,
    thresholds: team.thresholds ?? DEFAULT_THRESHOLDS,
    velocityWeights: team.velocityWeights
      ? { ...DEFAULT_VELOCITY_WEIGHTS, ...team.velocityWeights }
      : undefined,
    prScoreWeights: team.prScoreWeights
      ? { ...DEFAULT_PR_SCORE_WEIGHTS, ...team.prScoreWeights }
      : undefined,
  };
}

export function explicitReposOf(team: TeamConfig): RepoRef[] {
  return team.repos.map((slug) => {
    const [owner, name] = slug.split("/");
    return { source: "github", owner, name, url: `https://github.com/${owner}/${name}` };
  });
}

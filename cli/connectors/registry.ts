/**
 * Small connector registry keyed by source id (PRD §5). Connectors are built
 * from injected dependencies (e.g. a token) via a factory, so the registry
 * stays free of secrets and the puller selects only the connectors needed by
 * the members present in a team.
 */

import type { SourceId } from "../../shared/types";
import type { Member } from "../../shared/schema/config";
import type { Logger, SourceConnector } from "./types";

export interface ConnectorDeps {
  /** Source tokens keyed by source id; connectors read the one they need. */
  tokens: Partial<Record<SourceId, string>>;
  logger?: Logger;
}

export type ConnectorFactory = (deps: ConnectorDeps) => SourceConnector;

const factories = new Map<SourceId, ConnectorFactory>();

export function registerConnector(id: SourceId, factory: ConnectorFactory): void {
  factories.set(id, factory);
}

export function getConnectorFactory(id: SourceId): ConnectorFactory | undefined {
  return factories.get(id);
}

/** Which source ids does a member have a handle for? */
export function sourcesForMember(member: Member): SourceId[] {
  const ids: SourceId[] = [];
  if (member.github) ids.push("github");
  if (member.bitbucket) ids.push("bitbucket");
  return ids;
}

/** The distinct source ids needed by any member on the team. */
export function sourcesForTeam(members: readonly Member[]): SourceId[] {
  const set = new Set<SourceId>();
  for (const m of members) for (const id of sourcesForMember(m)) set.add(id);
  return [...set];
}

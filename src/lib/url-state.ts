/**
 * Selection state lives entirely in the URL (PRD §8) so views survive refresh
 * and are shareable. The mental model Team → Week → Person → Repo cascades:
 * changing a level clears the levels below it.
 *
 * Encoded as search params on the root path (a static-friendly simplification
 * of the PRD's `/team/:teamId` path — see PRD §8 note): team, range, from, to,
 * week, member, repo, data.
 */

import { useMemo } from "react";
import { useSyncExternalStore } from "react";

export type RangePreset = "1m" | "3m" | "6m" | "all" | "custom";
export const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "1m", label: "Last month" },
  { value: "3m", label: "Last 3 months" },
  { value: "6m", label: "Last 6 months" },
  { value: "all", label: "All time" },
];
export const DEFAULT_RANGE: RangePreset = "3m";

export interface Selection {
  team?: string;
  range: RangePreset;
  from?: string;
  to?: string;
  week?: string;
  member?: string;
  repo?: string;
}

const EVENT = "tv:urlchange";

function emit(): void {
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

function getSnapshot(): string {
  return window.location.search;
}

function parseRange(value: string | null): RangePreset {
  if (value === "1m" || value === "3m" || value === "6m" || value === "all" || value === "custom") {
    return value;
  }
  return DEFAULT_RANGE;
}

export function useSelection(): Selection {
  const search = useSyncExternalStore(subscribe, getSnapshot, () => "");
  return useMemo(() => {
    const p = new URLSearchParams(search);
    return {
      team: p.get("team") ?? undefined,
      range: parseRange(p.get("range")),
      from: p.get("from") ?? undefined,
      to: p.get("to") ?? undefined,
      week: p.get("week") ?? undefined,
      member: p.get("member") ?? undefined,
      repo: p.get("repo") ?? undefined,
    };
  }, [search]);
}

function update(mutate: (p: URLSearchParams) => void, replace = false): void {
  const p = new URLSearchParams(window.location.search);
  mutate(p);
  const qs = p.toString();
  const url = qs ? `?${qs}` : window.location.pathname;
  if (replace) window.history.replaceState(null, "", url);
  else window.history.pushState(null, "", url);
  emit();
}

export function selectTeam(teamId: string, replace = false): void {
  update((p) => {
    p.set("team", teamId);
    p.delete("week");
    p.delete("member");
    p.delete("repo");
  }, replace);
}

export function clearTeam(): void {
  update((p) => {
    p.delete("team");
    p.delete("week");
    p.delete("member");
    p.delete("repo");
  });
}

export function setRange(range: RangePreset, from?: string, to?: string): void {
  update((p) => {
    p.set("range", range);
    if (range === "custom" && from && to) {
      p.set("from", from);
      p.set("to", to);
    } else {
      p.delete("from");
      p.delete("to");
    }
  });
}

export function selectWeek(weekStart: string): void {
  update((p) => {
    p.set("week", weekStart);
  });
}

/** Sentinel: week explicitly deselected → range overview (distinct from the
 *  default of focusing the latest week when no week param is present). */
export const WEEK_NONE = "none";

export function clearWeek(): void {
  update((p) => {
    p.set("week", WEEK_NONE);
    p.delete("member");
    p.delete("repo");
  });
}

export function selectMember(handle: string): void {
  update((p) => {
    p.set("member", handle);
    p.delete("repo");
  });
}

export function clearMember(): void {
  update((p) => {
    p.delete("member");
    p.delete("repo");
  });
}

export function selectRepo(repo: string): void {
  update((p) => {
    p.set("repo", repo);
  });
}

export function clearRepo(): void {
  update((p) => {
    p.delete("repo");
  });
}

/**
 * Zustand store for LOADED DATA ONLY (PRD §10). Selection state lives in the URL
 * (see url-state.ts). Actions fetch + Zod-validate via the loaders; the store
 * caches the teams list, the current team's meta+index, and per-week detail.
 */

import { create } from "zustand";
import type { TeamIndex, TeamMeta, TeamsIndex, WeekDetail } from "../../shared/schema/data";
import { getDataDir } from "./data-source";
import { LoadError, loadTeamIndex, loadTeamMeta, loadWeekDetail, loadTeams } from "./loaders";

export type Status = "idle" | "loading" | "loaded" | "error";

interface WeekEntry {
  status: Status;
  data?: WeekDetail;
  error?: LoadError;
}

interface DataState {
  dataDir: string;

  teamsStatus: Status;
  teams: TeamsIndex;
  teamsError?: LoadError;

  currentTeamId?: string;
  teamStatus: Status;
  meta?: TeamMeta;
  index?: TeamIndex;
  teamError?: LoadError;

  weeks: Record<string, WeekEntry>;

  fetchTeams: () => Promise<void>;
  selectTeamData: (teamId: string) => Promise<void>;
  fetchWeek: (weekStart: string) => Promise<void>;
}

function asLoadError(e: unknown): LoadError {
  return e instanceof LoadError ? e : new LoadError("network", e instanceof Error ? e.message : String(e));
}

export const useDataStore = create<DataState>((set, get) => ({
  dataDir: getDataDir(),
  teamsStatus: "idle",
  teams: [],
  teamStatus: "idle",
  weeks: {},

  async fetchTeams() {
    if (get().teamsStatus === "loading") return;
    set({ teamsStatus: "loading", teamsError: undefined });
    try {
      const teams = await loadTeams(get().dataDir);
      set({ teams, teamsStatus: "loaded" });
    } catch (e) {
      const err = asLoadError(e);
      // A missing teams.json is the "no data yet" state, not a hard error.
      if (err.kind === "not-found") set({ teams: [], teamsStatus: "loaded" });
      else set({ teamsError: err, teamsStatus: "error" });
    }
  },

  async selectTeamData(teamId: string) {
    const state = get();
    if (state.currentTeamId === teamId && state.teamStatus === "loaded") return;
    set({ currentTeamId: teamId, teamStatus: "loading", meta: undefined, index: undefined, teamError: undefined, weeks: {} });
    try {
      const [meta, index] = await Promise.all([
        loadTeamMeta(state.dataDir, teamId),
        loadTeamIndex(state.dataDir, teamId),
      ]);
      // Guard against a race if the team changed while loading.
      if (get().currentTeamId !== teamId) return;
      set({ meta, index, teamStatus: "loaded" });
    } catch (e) {
      if (get().currentTeamId !== teamId) return;
      set({ teamError: asLoadError(e), teamStatus: "error" });
    }
  },

  async fetchWeek(weekStart: string) {
    const state = get();
    const existing = state.weeks[weekStart];
    if (existing && (existing.status === "loading" || existing.status === "loaded")) return;
    const teamId = state.currentTeamId;
    if (!teamId) return;
    set((s) => ({ weeks: { ...s.weeks, [weekStart]: { status: "loading" } } }));
    try {
      const data = await loadWeekDetail(state.dataDir, teamId, weekStart);
      // Bail if the team changed while this fetch was in flight, so team A's
      // detail never lands in team B's (cleared) weeks cache.
      if (get().currentTeamId !== teamId) return;
      set((s) => ({ weeks: { ...s.weeks, [weekStart]: { status: "loaded", data } } }));
    } catch (e) {
      if (get().currentTeamId !== teamId) return;
      set((s) => ({ weeks: { ...s.weeks, [weekStart]: { status: "error", error: asLoadError(e) } } }));
    }
  },
}));

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useDataStore } from "./lib/store";
import { selectTeam, useSelection } from "./lib/url-state";
import { Dashboard } from "./routes/Dashboard";
import { TeamSelect } from "./routes/TeamSelect";
import { ErrorState, LoadingState, NoDataState } from "./components/states";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-5">{children}</div>
      <footer className="mx-auto max-w-6xl px-4 pb-8 pt-4 text-center text-xs text-foreground-muted">
        TeamVelocity · local-first GitHub analytics · describes contribution shape, not individual worth
      </footer>
    </div>
  );
}

function DashboardRoute({ teamId, teamsCount }: { teamId: string; teamsCount: number }) {
  const teamStatus = useDataStore((s) => s.teamStatus);
  const currentTeamId = useDataStore((s) => s.currentTeamId);
  const meta = useDataStore((s) => s.meta);
  const index = useDataStore((s) => s.index);
  const teamError = useDataStore((s) => s.teamError);
  const selectTeamData = useDataStore((s) => s.selectTeamData);

  useEffect(() => {
    void selectTeamData(teamId);
  }, [teamId, selectTeamData]);

  if (teamStatus === "error" && teamError) return <ErrorState error={teamError} />;
  // Also gate on currentTeamId so a previously-viewed team's meta/index is never
  // painted for a frame before the effect reloads the newly selected team.
  if (currentTeamId !== teamId || teamStatus !== "loaded" || !meta || !index) {
    return <LoadingState label="Loading team…" />;
  }
  return <Dashboard meta={meta} index={index} teamsCount={teamsCount} />;
}

export default function App() {
  const teamsStatus = useDataStore((s) => s.teamsStatus);
  const teams = useDataStore((s) => s.teams);
  const teamsError = useDataStore((s) => s.teamsError);
  const fetchTeams = useDataStore((s) => s.fetchTeams);
  const selection = useSelection();

  useEffect(() => {
    void fetchTeams();
  }, [fetchTeams]);

  // Auto-skip the team-select screen when only one team is configured (PRD §8.1).
  useEffect(() => {
    if (teamsStatus === "loaded" && teams.length === 1 && !selection.team) {
      selectTeam(teams[0].id, true);
    }
  }, [teamsStatus, teams, selection.team]);

  if (teamsStatus === "idle" || teamsStatus === "loading") {
    return (
      <Shell>
        <LoadingState label="Loading teams…" />
      </Shell>
    );
  }
  if (teamsStatus === "error" && teamsError) {
    return (
      <Shell>
        <ErrorState error={teamsError} />
      </Shell>
    );
  }
  if (teams.length === 0) {
    return (
      <Shell>
        <NoDataState />
      </Shell>
    );
  }

  const validTeam = selection.team && teams.some((t) => t.id === selection.team) ? selection.team : undefined;

  if (!validTeam) {
    // A single team auto-redirects via the effect above; show a brief loader.
    if (teams.length === 1) {
      return (
        <Shell>
          <LoadingState />
        </Shell>
      );
    }
    return (
      <Shell>
        <TeamSelect teams={teams} />
      </Shell>
    );
  }

  return (
    <Shell>
      <DashboardRoute teamId={validTeam} teamsCount={teams.length} />
    </Shell>
  );
}

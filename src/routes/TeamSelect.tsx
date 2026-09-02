import type { TeamsIndex } from "../../shared/schema/data";
import { selectTeam } from "../lib/url-state";

export function TeamSelect({ teams }: { teams: TeamsIndex }) {
  return (
    <div
      className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center py-16"
      data-testid="team-select"
    >
      <h1 className="mb-1 text-2xl font-bold text-heading">Choose team</h1>
      <p className="mb-8 text-sm text-foreground-muted">Pick a team to explore its velocity and drill-down.</p>
      <div className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2">
        {teams.map((t) => (
          <button
            key={t.id}
            type="button"
            data-testid="team-card"
            onClick={() => {
              selectTeam(t.id);
            }}
            className="flex flex-col items-start gap-1 rounded-card border border-border bg-card p-5 text-left shadow-sm transition-colors hover:border-primary hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="text-lg font-semibold text-heading">{t.name}</span>
            <span className="tabular text-xs text-foreground-muted">{t.id}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

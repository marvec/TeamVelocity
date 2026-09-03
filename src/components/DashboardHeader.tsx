import type { VelocityBand } from "../../shared/types";
import type { TeamMeta, WeekSummary } from "../../shared/schema/data";
import type { Selection } from "../lib/url-state";
import { VelocityGauge } from "./charts/VelocityGauge";
import { VelocityHistory } from "./charts/VelocityHistory";
import { DateRangePicker } from "./DateRangePicker";
import { ScoreHelp } from "./ScoreHelp";
import { BandLegend } from "./ui/Legend";
import { Button } from "./ui/Button";

interface Gauge {
  value: number;
  band: VelocityBand;
  warmingUp: boolean;
  caption: string;
}

export function DashboardHeader({
  meta,
  selection,
  weeks,
  minDate,
  maxDate,
  gauge,
  showTeams,
  onBackToTeams,
}: {
  meta: TeamMeta;
  selection: Selection;
  weeks: WeekSummary[];
  minDate: string;
  maxDate: string;
  gauge: Gauge;
  showTeams: boolean;
  onBackToTeams: () => void;
}) {
  return (
    <header className="mb-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {showTeams && (
            <Button variant="ghost" onClick={onBackToTeams} className="px-2" aria-label="Back to teams">
              ← Teams
            </Button>
          )}
          <h1 className="text-xl font-bold text-heading">
            <span className="text-foreground-muted font-normal">Team:</span> {meta.name}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker selection={selection} minDate={minDate} maxDate={maxDate} />
          <ScoreHelp velocityWeights={meta.velocityWeights} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 rounded-card border border-border bg-card p-4 shadow-sm lg:grid-cols-[auto_1fr]">
        <div className="flex items-center justify-center">
          <VelocityGauge
            value={gauge.value}
            band={gauge.band}
            thresholds={meta.thresholds}
            warmingUp={gauge.warmingUp}
            caption={gauge.caption}
          />
        </div>
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-heading">Velocity history</h2>
            <BandLegend thresholds={meta.thresholds} />
          </div>
          <VelocityHistory weeks={weeks} thresholds={meta.thresholds} />
        </div>
      </div>
    </header>
  );
}

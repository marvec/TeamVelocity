import { useEffect, useMemo } from "react";
import type { TeamIndex, TeamMeta } from "../../shared/schema/data";
import { rangeVelocity, velocityBand } from "../../shared/aggregate/velocity";
import { useDataStore } from "../lib/store";
import {
  WEEK_NONE,
  clearMember,
  clearRepo,
  clearTeam,
  clearWeek,
  selectMember,
  selectRepo,
  selectWeek,
  useSelection,
} from "../lib/url-state";
import { weeksInRange } from "../lib/format";
import { memberScope, sumTotals, teamScope } from "../lib/selectors";
import { DashboardHeader } from "../components/DashboardHeader";
import { TeamWeeklyBars } from "../components/charts/TeamWeeklyBars";
import { WeekPrSection } from "../components/sections/WeekPrSection";
import { PrRelevanceSection } from "../components/sections/PrRelevanceSection";
import { MembersSection } from "../components/sections/MembersSection";
import { PersonDetailSection } from "../components/sections/PersonDetailSection";
import { Card, CardBody, CardHeader, CardTitle } from "../components/ui/Card";
import { StatRow } from "../components/ui/StatRow";
import { ErrorState, LoadingState } from "../components/states";

export function Dashboard({
  meta,
  index,
  teamsCount,
}: {
  meta: TeamMeta;
  index: TeamIndex;
  teamsCount: number;
}) {
  const selection = useSelection();
  const fetchWeek = useDataStore((s) => s.fetchWeek);
  const weekEntries = useDataStore((s) => s.weeks);
  const weeks = index.weeks;

  const minDate = weeks[0]?.weekStart ?? meta.rangeStart;
  const maxDate = weeks[weeks.length - 1]?.weekStart ?? meta.rangeStart;
  const inRange = useMemo(() => weeksInRange(weeks, selection), [weeks, selection]);
  const allKeys = useMemo(() => new Set(weeks.map((w) => w.weekStart)), [weeks]);

  const focusedWeekKey =
    selection.week === WEEK_NONE
      ? undefined
      : selection.week && allKeys.has(selection.week)
        ? selection.week
        : inRange[inRange.length - 1]?.weekStart;

  useEffect(() => {
    if (focusedWeekKey) void fetchWeek(focusedWeekKey);
  }, [focusedWeekKey, fetchWeek]);

  const rangeVel = rangeVelocity(inRange.map((w) => w.velocity));
  const rangeBand = velocityBand(rangeVel, meta.thresholds);
  const focusedSummary = focusedWeekKey ? weeks.find((w) => w.weekStart === focusedWeekKey) : undefined;

  const gauge = focusedSummary
    ? {
        value: focusedSummary.velocity,
        band: focusedSummary.velocityBand,
        warmingUp: focusedSummary.warmingUp,
        caption: "week velocity",
      }
    : { value: rangeVel, band: rangeBand, warmingUp: false, caption: "range velocity" };

  const weekEntry = focusedWeekKey ? weekEntries[focusedWeekKey] : undefined;
  const weekDetail = weekEntry?.status === "loaded" ? weekEntry.data : undefined;

  const focusedMember =
    weekDetail && selection.member ? weekDetail.members.find((m) => m.handle === selection.member) : undefined;
  const scope = weekDetail ? (focusedMember ? memberScope(focusedMember) : teamScope(weekDetail)) : undefined;

  return (
    <div data-testid="dashboard">
      <DashboardHeader
        meta={meta}
        selection={selection}
        weeks={inRange}
        minDate={minDate}
        maxDate={maxDate}
        gauge={gauge}
        historyBand={rangeBand}
        showTeams={teamsCount > 1}
        onBackToTeams={clearTeam}
      />

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Weekly activity</CardTitle>
          <span className="text-xs text-foreground-muted">Click a week to focus it</span>
        </CardHeader>
        <CardBody>
          <TeamWeeklyBars weeks={inRange} selectedWeek={focusedWeekKey} onSelectWeek={selectWeek} />
        </CardBody>
      </Card>

      {focusedWeekKey === undefined ? (
        <Card data-testid="range-overview">
          <CardHeader>
            <CardTitle>Range overview</CardTitle>
          </CardHeader>
          <CardBody>
            <StatRow totals={sumTotals(inRange.map((w) => w.totals))} className="mb-2" />
            <p className="text-sm text-foreground-muted">
              Showing the whole range. Select a week above to drill into its pull requests and people.
            </p>
          </CardBody>
        </Card>
      ) : weekDetail ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <WeekPrSection week={weekDetail} onClear={clearWeek} />
          <PrRelevanceSection prs={weekDetail.prs} />
          <MembersSection
            week={weekDetail}
            selectedMember={selection.member}
            onSelect={selectMember}
            onClear={clearMember}
          />
          {scope && (
            <PersonDetailSection
              scope={scope}
              isMember={focusedMember !== undefined}
              selectedRepo={selection.repo}
              onSelectRepo={selectRepo}
              onClearRepo={clearRepo}
              onClearMember={clearMember}
            />
          )}
        </div>
      ) : weekEntry?.status === "error" && weekEntry.error ? (
        <ErrorState error={weekEntry.error} />
      ) : (
        <LoadingState label="Loading week…" />
      )}
    </div>
  );
}

import type { WeekDetail } from "../../../shared/schema/data";
import type { VelocityWeights } from "../../../shared/types";
import { bandTextClass, formatVelocity, velocityStackDatum } from "../../lib/format";
import { cn } from "../../lib/cn";
import { HorizontalStack, type StackRow } from "../charts/HorizontalStack";
import { Card, CardBody, CardHeader, CardTitle } from "../ui/Card";
import { CategoryLegend } from "../ui/Legend";
import { DeselectChip } from "../ui/Chip";
import { ContributionTabs } from "./ContributionTabs";

export function MembersSection({
  week,
  weights,
  selectedMember,
  onSelect,
  onClear,
}: {
  week: WeekDetail;
  weights: VelocityWeights;
  selectedMember?: string;
  onSelect: (handle: string) => void;
  onClear: () => void;
}) {
  // Bar length = the member's velocity (0–100); segments are each category's
  // scaled contribution to that velocity, not raw contribution volume.
  const rows: StackRow[] = week.members.map((m) => ({
    key: m.handle,
    label: m.name,
    datum: velocityStackDatum(m.totals, m.velocity, weights),
    value: m.velocity,
    velocity: m.velocity,
    band: m.velocityBand,
  }));
  const selected = week.members.find((m) => m.handle === selectedMember);

  return (
    <Card data-testid="members-section">
      <CardHeader>
        <CardTitle>Velocity of individuals</CardTitle>
        <div className="flex items-center gap-2">
          {selected && <DeselectChip label={selected.name} onClear={onClear} testid="clear-member" />}
          <CategoryLegend />
        </div>
      </CardHeader>
      <CardBody>
        <HorizontalStack rows={rows} selectedKey={selectedMember} onSelect={onSelect} yWidth={148} xMax={100} />
        {selected ? (
          <div className="mt-4 rounded-control border border-border bg-surface p-3" data-testid="member-detail">
            <div className="mb-2 flex items-baseline gap-1.5">
              <span className="text-sm font-semibold text-foreground">{selected.name}</span>
              <span className={cn("tabular ml-1 text-sm font-bold", bandTextClass(selected.velocityBand))}>
                {formatVelocity(selected.velocity)}
              </span>
              <span className="text-xs text-foreground-muted">velocity</span>
            </div>
            <ContributionTabs
              prs={selected.prs}
              commits={selected.commits}
              comments={selected.comments}
              totals={selected.totals}
              showRepo
              showAuthor={false}
              idPrefix="member"
            />
          </div>
        ) : (
          <p className="mt-2 text-xs text-foreground-muted">
            Bar length is each member’s velocity (0–100, vs their own baseline); the segments show how much each
            category drove it. Hover for exact counts; click to focus a person.
          </p>
        )}
      </CardBody>
    </Card>
  );
}

import type { WeekDetail } from "../../../shared/schema/data";
import { HorizontalStack, type StackRow } from "../charts/HorizontalStack";
import { Card, CardBody, CardHeader, CardTitle } from "../ui/Card";
import { CategoryLegend } from "../ui/Legend";
import { DeselectChip } from "../ui/Chip";

export function MembersSection({
  week,
  selectedMember,
  onSelect,
  onClear,
}: {
  week: WeekDetail;
  selectedMember?: string;
  onSelect: (handle: string) => void;
  onClear: () => void;
}) {
  const rows: StackRow[] = week.members.map((m) => ({
    key: m.handle,
    label: m.name,
    totals: m.totals,
    velocity: m.velocity,
    band: m.velocityBand,
  }));
  const selectedName = week.members.find((m) => m.handle === selectedMember)?.name;

  return (
    <Card data-testid="members-section">
      <CardHeader>
        <CardTitle>Velocity of individuals</CardTitle>
        <div className="flex items-center gap-2">
          {selectedName && <DeselectChip label={selectedName} onClear={onClear} testid="clear-member" />}
          <CategoryLegend />
        </div>
      </CardHeader>
      <CardBody>
        <HorizontalStack rows={rows} selectedKey={selectedMember} onSelect={onSelect} yWidth={148} />
        <p className="mt-2 text-xs text-foreground-muted">
          Bars show contribution shape; hover a row for exact counts and that member’s velocity. Click to focus a person.
        </p>
      </CardBody>
    </Card>
  );
}

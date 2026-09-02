import type { WeekDetail } from "../../../shared/schema/data";
import { PrTable } from "../tables/PrTable";
import { Card, CardBody, CardHeader, CardTitle } from "../ui/Card";
import { DeselectChip } from "../ui/Chip";
import { StatRow } from "../ui/StatRow";

export function WeekPrSection({ week, onClear }: { week: WeekDetail; onClear: () => void }) {
  return (
    <Card data-testid="week-detail">
      <CardHeader>
        <CardTitle>Week detail · {week.label}</CardTitle>
        <DeselectChip label="This week" onClear={onClear} testid="clear-week" />
      </CardHeader>
      <CardBody>
        <StatRow totals={week.totals} className="mb-3" />
        <p className="mb-2 text-xs text-foreground-muted">
          The week’s pull requests, ranked by relevance — the raw material for a status report.
        </p>
        <PrTable prs={week.prs} showAuthor />
      </CardBody>
    </Card>
  );
}

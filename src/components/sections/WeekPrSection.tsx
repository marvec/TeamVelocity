import type { WeekDetail } from "../../../shared/schema/data";
import { copyWeekDetail } from "../../lib/copy-export";
import { PrTable } from "../tables/PrTable";
import { Card, CardBody, CardHeader, CardTitle } from "../ui/Card";
import { DeselectChip } from "../ui/Chip";
import { CopyButton } from "../ui/CopyButton";
import { StatRow } from "../ui/StatRow";

export function WeekPrSection({ week, onClear }: { week: WeekDetail; onClear: () => void }) {
  return (
    <Card data-testid="week-detail">
      <CardHeader>
        <CardTitle>Week detail · {week.label}</CardTitle>
        <div className="flex shrink-0 items-center gap-2">
          <DeselectChip label="This week" onClear={onClear} testid="clear-week" />
          <CopyButton getContent={() => copyWeekDetail(week)} label="Copy week detail" testid="copy-week" />
        </div>
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

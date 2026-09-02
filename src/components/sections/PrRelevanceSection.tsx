import type { ScoredPr } from "../../../shared/schema/data";
import { PrScoreChart, PrScoreLegend } from "../charts/PrScoreChart";
import { Card, CardBody, CardHeader, CardTitle } from "../ui/Card";

export function PrRelevanceSection({ prs }: { prs: ScoredPr[] }) {
  return (
    <Card data-testid="pr-relevance">
      <CardHeader>
        <CardTitle>PR relevance</CardTitle>
        <PrScoreLegend />
      </CardHeader>
      <CardBody>
        {prs.length === 0 ? (
          <p className="py-6 text-center text-sm text-foreground-muted">No pull requests in this week.</p>
        ) : (
          <PrScoreChart prs={prs} />
        )}
      </CardBody>
    </Card>
  );
}

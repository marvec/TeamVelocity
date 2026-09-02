import type { CommentRow } from "../../../shared/schema/data";
import { type RepoTotals, type Scope, repoRefKey } from "../../lib/selectors";
import { bandTextClass, formatVelocity } from "../../lib/format";
import { cn } from "../../lib/cn";
import { HorizontalStack, type StackRow } from "../charts/HorizontalStack";
import { PrTable } from "../tables/PrTable";
import { Card, CardBody, CardHeader, CardTitle } from "../ui/Card";
import { DeselectChip } from "../ui/Chip";
import { StatRow } from "../ui/StatRow";

const COMMENT_LABEL: Record<CommentRow["kind"], string> = {
  review: "review comment",
  review_summary: "review",
  issue: "comment",
};

function RepoDetail({
  data,
  comments,
  onClear,
}: {
  data: RepoTotals;
  comments: CommentRow[];
  onClear: () => void;
}) {
  return (
    <div className="rounded-control border border-border bg-surface p-3" data-testid="repo-detail">
      <div className="mb-2 flex items-center justify-between gap-2">
        <a href={data.repo.url} target="_blank" rel="noreferrer" className="text-sm font-semibold text-primary hover:underline">
          {data.repo.owner}/{data.repo.name} ↗
        </a>
        <DeselectChip label={data.repo.name} onClear={onClear} testid="clear-repo" />
      </div>
      <StatRow totals={data.totals} />
      <div className="mt-3">
        <h4 className="mb-1 text-xs uppercase tracking-wide text-foreground-muted">Comment details</h4>
        {comments.length === 0 ? (
          <p className="text-xs text-foreground-muted">No comments recorded in this repo this week.</p>
        ) : (
          <ul className="space-y-1 text-xs">
            {comments.map((c, i) => (
              <li key={`${c.url}-${String(i)}`} className="flex items-center gap-2">
                <span className="tabular text-foreground-muted">{c.createdAt.slice(0, 10)}</span>
                <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {COMMENT_LABEL[c.kind]}
                  {c.prNumber !== null && <span className="tabular"> on #{c.prNumber}</span>}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function PersonDetailSection({
  scope,
  isMember,
  selectedRepo,
  onSelectRepo,
  onClearRepo,
  onClearMember,
}: {
  scope: Scope;
  isMember: boolean;
  selectedRepo?: string;
  onSelectRepo: (repo: string) => void;
  onClearRepo: () => void;
  onClearMember: () => void;
}) {
  const repoRows: StackRow[] = scope.repos.map((rt) => ({
    key: repoRefKey(rt.repo),
    label: rt.repo.name,
    totals: rt.totals,
  }));
  const selectedRepoData = selectedRepo
    ? scope.repos.find((rt) => repoRefKey(rt.repo) === selectedRepo)
    : undefined;
  const repoComments = selectedRepo
    ? scope.comments.filter((c) => repoRefKey(c.repo) === selectedRepo)
    : [];

  return (
    <Card data-testid="person-detail">
      <CardHeader>
        <CardTitle>{isMember ? scope.name : "Team detail"}</CardTitle>
        {isMember && <DeselectChip label={scope.name} onClear={onClearMember} testid="clear-person" />}
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {isMember && scope.band && (
            <div className="flex items-baseline gap-1">
              <span className={cn("tabular text-2xl font-bold leading-none", bandTextClass(scope.band))}>
                {formatVelocity(scope.velocity ?? 0)}
              </span>
              <span className="text-xs text-foreground-muted">velocity</span>
            </div>
          )}
          <StatRow totals={scope.totals} />
        </div>

        {isMember && (
          <div>
            <h3 className="mb-1 text-xs uppercase tracking-wide text-foreground-muted">Pull requests</h3>
            <PrTable prs={scope.prs} showAuthor={false} />
          </div>
        )}

        <div>
          <h3 className="mb-1 text-xs uppercase tracking-wide text-foreground-muted">Velocity by repo</h3>
          {repoRows.length === 0 ? (
            <p className="text-xs text-foreground-muted">No repo activity in this selection.</p>
          ) : (
            <HorizontalStack rows={repoRows} selectedKey={selectedRepo} onSelect={onSelectRepo} yWidth={120} />
          )}
        </div>

        {selectedRepoData && (
          <RepoDetail data={selectedRepoData} comments={repoComments} onClear={onClearRepo} />
        )}
      </CardBody>
    </Card>
  );
}

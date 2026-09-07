import type { CommentRow, CommitRow, ScoredPr } from "../../../shared/schema/data";
import type { VelocityWeights } from "../../../shared/types";
import { type RepoTotals, type Scope, repoRefKey } from "../../lib/selectors";
import { bandTextClass, formatVelocity, velocityStackDatum } from "../../lib/format";
import { cn } from "../../lib/cn";
import { HorizontalStack, type StackRow } from "../charts/HorizontalStack";
import { PrTable } from "../tables/PrTable";
import { Card, CardBody, CardHeader, CardTitle } from "../ui/Card";
import { BandChip } from "../ui/BandChip";
import { DeselectChip } from "../ui/Chip";
import { StatRow } from "../ui/StatRow";
import { ContributionTabs } from "./ContributionTabs";

function RepoDetail({
  data,
  prs,
  commits,
  comments,
  showAuthor,
  onClear,
}: {
  data: RepoTotals;
  prs: ScoredPr[];
  commits: CommitRow[];
  comments: CommentRow[];
  showAuthor: boolean;
  onClear: () => void;
}) {
  return (
    <div className="rounded-control border-(length:--border-w) border-border bg-surface p-3" data-testid="repo-detail">
      <div className="mb-2 flex items-center justify-between gap-2">
        <a
          href={data.repo.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-primary hover:underline"
        >
          {data.repo.owner}/{data.repo.name} ↗
        </a>
        <DeselectChip label={data.repo.name} onClear={onClear} testid="clear-repo" />
      </div>
      <ContributionTabs
        prs={prs}
        commits={commits}
        comments={comments}
        totals={data.totals}
        showRepo={false}
        showAuthor={showAuthor}
        idPrefix="repo"
      />
    </div>
  );
}

export function PersonDetailSection({
  scope,
  weights,
  isMember,
  selectedRepo,
  onSelectRepo,
  onClearRepo,
  onClearMember,
}: {
  scope: Scope;
  weights: VelocityWeights;
  isMember: boolean;
  selectedRepo?: string;
  onSelectRepo: (repo: string) => void;
  onClearRepo: () => void;
  onClearMember: () => void;
}) {
  // "Velocity by repo": each repo has its own independent velocity (vs its own
  // baseline of active weeks) — velocity is non-linear, so repo bars are NOT a
  // decomposition of the scope velocity and do not sum to it. Bar length = the
  // repo's velocity.
  const repoRows: StackRow[] = scope.repos.map((rt) => ({
    key: repoRefKey(rt.repo),
    label: rt.repo.name,
    datum: velocityStackDatum(rt.totals, rt.velocity, weights),
    value: rt.velocity,
    velocity: rt.velocity,
    band: rt.velocityBand,
  }));
  const selectedRepoData = selectedRepo
    ? scope.repos.find((rt) => repoRefKey(rt.repo) === selectedRepo)
    : undefined;
  const repoPrs = selectedRepo ? scope.prs.filter((p) => repoRefKey(p.repo) === selectedRepo) : [];
  const repoCommits = selectedRepo ? scope.commits.filter((c) => repoRefKey(c.repo) === selectedRepo) : [];
  const repoComments = selectedRepo ? scope.comments.filter((c) => repoRefKey(c.repo) === selectedRepo) : [];

  return (
    <Card data-testid="person-detail">
      <CardHeader>
        <CardTitle>{isMember ? scope.name : "Team detail"}</CardTitle>
        {isMember && <DeselectChip label={scope.name} onClear={onClearMember} testid="clear-person" />}
      </CardHeader>
      <CardBody className="space-y-4">
        <div className="flex flex-wrap items-center gap-4">
          {isMember && scope.band && (
            <div className="flex items-center gap-1.5">
              <span className={cn("tabular text-2xl leading-none font-bold", bandTextClass(scope.band))}>
                {formatVelocity(scope.velocity ?? 0)}
              </span>
              <span className="text-xs text-foreground-muted">velocity</span>
              <BandChip band={scope.band} className="ml-1" />
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
            <HorizontalStack rows={repoRows} selectedKey={selectedRepo} onSelect={onSelectRepo} yWidth={120} xMax={100} />
          )}
        </div>

        {selectedRepoData && (
          <RepoDetail
            data={selectedRepoData}
            prs={repoPrs}
            commits={repoCommits}
            comments={repoComments}
            showAuthor={!isMember}
            onClear={onClearRepo}
          />
        )}
      </CardBody>
    </Card>
  );
}

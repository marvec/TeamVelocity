import { useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import type { CommentRow, CommitRow, ScoredPr } from "../../../shared/schema/data";
import { type RepoTotals, type Scope, repoRefKey } from "../../lib/selectors";
import { bandBgClass, bandTextClass, formatLoc, formatNumber, formatScore, formatVelocity } from "../../lib/format";
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

type RepoTab = "prs" | "commits" | "comments" | "loc";

function scoreBand(score: number): "red" | "yellow" | "green" {
  return score < 40 ? "red" : score < 70 ? "yellow" : "green";
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-foreground-muted">{children}</p>;
}

/** Compact PR list for a single repo (state-colored number + title + score bar). */
function PrList({ prs }: { prs: ScoredPr[] }) {
  if (prs.length === 0) return <EmptyLine>No pull requests in this repo this week.</EmptyLine>;
  return (
    <ul className="space-y-1.5 text-xs" data-testid="repo-prs">
      {prs.map((pr) => (
        <li key={`${pr.repo.owner}/${pr.repo.name}#${String(pr.number)}`} className="flex items-center gap-2">
          <a
            href={pr.url}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "tabular shrink-0 font-medium hover:underline",
              pr.state === "merged"
                ? "text-cat-commits"
                : pr.state === "closed"
                  ? "text-band-red"
                  : "text-foreground-muted",
            )}
          >
            #{pr.number}
          </a>
          <a href={pr.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
            {pr.title}
          </a>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full", bandBgClass(scoreBand(pr.score)))}
                style={{ width: `${String(pr.score)}%` }}
              />
            </span>
            <span className="tabular w-8 text-right text-foreground-muted">{formatScore(pr.score)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Commit list. Per-commit LOC is not fetched in live pulls, so only the SHA + date show. */
function CommitList({ commits, showAuthor }: { commits: CommitRow[]; showAuthor: boolean }) {
  if (commits.length === 0) return <EmptyLine>No commits recorded in this repo this week.</EmptyLine>;
  return (
    <ul className="space-y-1 text-xs" data-testid="repo-commits">
      {commits.map((c) => (
        <li key={c.url} className="flex items-center gap-2">
          <span className="tabular text-foreground-muted">{c.committedAt.slice(0, 10)}</span>
          <a href={c.url} target="_blank" rel="noreferrer" className="tabular font-medium hover:underline">
            {c.sha.slice(0, 7)}
          </a>
          {showAuthor && <span className="truncate text-foreground-muted">{c.authorHandle}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Comment list (date · kind · on #N). */
function CommentList({ comments }: { comments: CommentRow[] }) {
  if (comments.length === 0) return <EmptyLine>No comments recorded in this repo this week.</EmptyLine>;
  return (
    <ul className="space-y-1 text-xs" data-testid="repo-comments">
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
  );
}

/** LOC breakdown: repo total + per-PR line changes (LOC is delivered by PRs, PRD §5). */
function LocBreakdown({ prs, totals }: { prs: ScoredPr[]; totals: RepoTotals["totals"] }) {
  const byChurn = [...prs].sort(
    (a, b) => b.stats.additions + b.stats.deletions - (a.stats.additions + a.stats.deletions),
  );
  const maxChurn = byChurn.reduce((m, p) => Math.max(m, p.stats.additions + p.stats.deletions), 0);
  return (
    <div className="space-y-2" data-testid="repo-loc">
      <p className="tabular text-xs text-foreground-muted">{formatLoc(totals.locAdded, totals.locRemoved)}</p>
      {byChurn.length === 0 ? (
        <EmptyLine>LOC is delivered by pull requests; none landed in this repo this week.</EmptyLine>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {byChurn.map((pr) => {
            const churn = pr.stats.additions + pr.stats.deletions;
            const pct = maxChurn > 0 ? (churn / maxChurn) * 100 : 0;
            return (
              <li key={`${pr.repo.owner}/${pr.repo.name}#${String(pr.number)}`} className="flex items-center gap-2">
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  className="tabular shrink-0 font-medium text-foreground-muted hover:underline"
                >
                  #{pr.number}
                </a>
                <a href={pr.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate hover:underline">
                  {pr.title}
                </a>
                <span className="flex shrink-0 items-center gap-1.5">
                  <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-muted sm:block">
                    <span
                      className="block h-full rounded-full bg-cat-loc-add"
                      style={{ width: `${String(pct)}%` }}
                    />
                  </span>
                  <span className="tabular w-20 text-right text-foreground-muted">
                    <span className="text-band-green">+{formatNumber(pr.stats.additions)}</span>
                    {" / "}
                    <span className="text-band-red">−{formatNumber(pr.stats.deletions)}</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const TAB_CLASS =
  "-mb-px inline-flex cursor-pointer items-center gap-1.5 border-b-2 border-transparent px-2.5 py-1.5 text-xs font-medium text-foreground-muted outline-none hover:text-foreground aria-selected:border-primary aria-selected:text-foreground";
const BADGE_CLASS = "tabular inline-flex min-w-4 justify-center rounded-full bg-muted px-1.5 text-foreground-muted";

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
  const [tab, setTab] = useState<RepoTab>("prs");
  const locTotal = data.totals.locAdded + data.totals.locRemoved;

  const tabs: { key: RepoTab; label: string; badge: string }[] = [
    { key: "prs", label: "PRs", badge: formatNumber(prs.length) },
    { key: "commits", label: "Commits", badge: formatNumber(commits.length) },
    { key: "comments", label: "Comments", badge: formatNumber(comments.length) },
    { key: "loc", label: "LOC", badge: formatNumber(locTotal) },
  ];

  return (
    <div className="rounded-control border border-border bg-surface p-3" data-testid="repo-detail">
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

      <Tabs.Root
        value={tab}
        onValueChange={(value) => {
          if (typeof value === "string") setTab(value as RepoTab);
        }}
      >
        <Tabs.List className="flex flex-wrap items-center gap-1 border-b border-border">
          {tabs.map((t) => (
            <Tabs.Tab key={t.key} value={t.key} className={TAB_CLASS} data-testid={`repo-tab-${t.key}`}>
              <span>{t.label}</span>
              <span className={BADGE_CLASS}>{t.badge}</span>
            </Tabs.Tab>
          ))}
        </Tabs.List>

        <Tabs.Panel value="prs" className="pt-3" data-testid="repo-panel-prs">
          <PrList prs={prs} />
        </Tabs.Panel>
        <Tabs.Panel value="commits" className="pt-3" data-testid="repo-panel-commits">
          <CommitList commits={commits} showAuthor={showAuthor} />
        </Tabs.Panel>
        <Tabs.Panel value="comments" className="pt-3" data-testid="repo-panel-comments">
          <CommentList comments={comments} />
        </Tabs.Panel>
        <Tabs.Panel value="loc" className="pt-3" data-testid="repo-panel-loc">
          <LocBreakdown prs={prs} totals={data.totals} />
        </Tabs.Panel>
      </Tabs.Root>
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

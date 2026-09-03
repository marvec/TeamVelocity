import { useState } from "react";
import { Tabs } from "@base-ui/react/tabs";
import type { CommentRow, CommitRow, ScoredPr, TotalsData } from "../../../shared/schema/data";
import { bandBgClass, formatLoc, formatNumber, formatScore } from "../../lib/format";
import { cn } from "../../lib/cn";

const COMMENT_LABEL: Record<CommentRow["kind"], string> = {
  review: "review comment",
  review_summary: "review",
  issue: "comment",
};

type ContribTab = "prs" | "commits" | "comments" | "loc";

function scoreBand(score: number): "red" | "yellow" | "green" {
  return score < 40 ? "red" : score < 70 ? "yellow" : "green";
}

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-foreground-muted">{children}</p>;
}

/** Muted repo pill shown on each row when contributions span multiple repos. */
function RepoTag({ name }: { name: string }) {
  return <span className="shrink-0 rounded bg-muted px-1 text-foreground-muted">{name}</span>;
}

/** Compact PR list (state-colored number + optional repo + title + score bar). */
function PrList({ prs, showRepo }: { prs: ScoredPr[]; showRepo: boolean }) {
  if (prs.length === 0) return <EmptyLine>No pull requests in this selection this week.</EmptyLine>;
  return (
    <ul className="space-y-1.5 text-xs" data-testid="contrib-prs">
      {prs.map((pr) => (
        <li key={`${pr.repo.owner}/${pr.repo.name}#${String(pr.number)}`} className="flex items-center gap-2">
          {showRepo && <RepoTag name={pr.repo.name} />}
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

/** Commit list. Per-commit LOC is not fetched in live pulls, so only SHA + date show. */
function CommitList({
  commits,
  showRepo,
  showAuthor,
}: {
  commits: CommitRow[];
  showRepo: boolean;
  showAuthor: boolean;
}) {
  if (commits.length === 0) return <EmptyLine>No commits recorded in this selection this week.</EmptyLine>;
  return (
    <ul className="space-y-1 text-xs" data-testid="contrib-commits">
      {commits.map((c) => (
        <li key={c.url} className="flex items-center gap-2">
          <span className="tabular text-foreground-muted">{c.committedAt.slice(0, 10)}</span>
          <a href={c.url} target="_blank" rel="noreferrer" className="tabular font-medium hover:underline">
            {c.sha.slice(0, 7)}
          </a>
          {showRepo && <RepoTag name={c.repo.name} />}
          {showAuthor && <span className="truncate text-foreground-muted">{c.authorHandle}</span>}
        </li>
      ))}
    </ul>
  );
}

/** Comment list (date · kind · on #N · optional repo). */
function CommentList({ comments, showRepo }: { comments: CommentRow[]; showRepo: boolean }) {
  if (comments.length === 0) return <EmptyLine>No comments recorded in this selection this week.</EmptyLine>;
  return (
    <ul className="space-y-1 text-xs" data-testid="contrib-comments">
      {comments.map((c, i) => (
        <li key={`${c.url}-${String(i)}`} className="flex items-center gap-2">
          <span className="tabular text-foreground-muted">{c.createdAt.slice(0, 10)}</span>
          <a href={c.url} target="_blank" rel="noreferrer" className="hover:underline">
            {COMMENT_LABEL[c.kind]}
            {c.prNumber !== null && <span className="tabular"> on #{c.prNumber}</span>}
          </a>
          {showRepo && <RepoTag name={c.repo.name} />}
        </li>
      ))}
    </ul>
  );
}

/** LOC breakdown: total + per-PR line changes (LOC is delivered by PRs, PRD §5). */
function LocBreakdown({ prs, totals, showRepo }: { prs: ScoredPr[]; totals: TotalsData; showRepo: boolean }) {
  const byChurn = [...prs].sort(
    (a, b) => b.stats.additions + b.stats.deletions - (a.stats.additions + a.stats.deletions),
  );
  const maxChurn = byChurn.reduce((m, p) => Math.max(m, p.stats.additions + p.stats.deletions), 0);
  return (
    <div className="space-y-2" data-testid="contrib-loc">
      <p className="tabular text-xs text-foreground-muted">{formatLoc(totals.locAdded, totals.locRemoved)}</p>
      {byChurn.length === 0 ? (
        <EmptyLine>LOC is delivered by pull requests; none landed in this selection this week.</EmptyLine>
      ) : (
        <ul className="space-y-1.5 text-xs">
          {byChurn.map((pr) => {
            const churn = pr.stats.additions + pr.stats.deletions;
            const pct = maxChurn > 0 ? (churn / maxChurn) * 100 : 0;
            return (
              <li key={`${pr.repo.owner}/${pr.repo.name}#${String(pr.number)}`} className="flex items-center gap-2">
                {showRepo && <RepoTag name={pr.repo.name} />}
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
                    <span className="block h-full rounded-full bg-cat-loc-add" style={{ width: `${String(pct)}%` }} />
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

/**
 * The PRs · Commits · Comments · LOC tabbed breakdown, shared by the repo
 * drill-down (single repo) and the person drill-down (spanning repos, so
 * `showRepo` tags each row). `idPrefix` namespaces the testids so two instances
 * can coexist on screen.
 */
export function ContributionTabs({
  prs,
  commits,
  comments,
  totals,
  showRepo,
  showAuthor,
  idPrefix,
}: {
  prs: ScoredPr[];
  commits: CommitRow[];
  comments: CommentRow[];
  totals: TotalsData;
  showRepo: boolean;
  showAuthor: boolean;
  idPrefix: string;
}) {
  const [tab, setTab] = useState<ContribTab>("prs");
  const locTotal = totals.locAdded + totals.locRemoved;

  const tabs: { key: ContribTab; label: string; badge: string }[] = [
    { key: "prs", label: "PRs", badge: formatNumber(prs.length) },
    { key: "commits", label: "Commits", badge: formatNumber(commits.length) },
    { key: "comments", label: "Comments", badge: formatNumber(comments.length) },
    { key: "loc", label: "LOC", badge: formatNumber(locTotal) },
  ];

  return (
    <Tabs.Root
      value={tab}
      onValueChange={(value) => {
        if (typeof value === "string") setTab(value as ContribTab);
      }}
    >
      <Tabs.List className="flex flex-wrap items-center gap-1 border-b border-border">
        {tabs.map((t) => (
          <Tabs.Tab key={t.key} value={t.key} className={TAB_CLASS} data-testid={`${idPrefix}-tab-${t.key}`}>
            <span>{t.label}</span>
            <span className={BADGE_CLASS}>{t.badge}</span>
          </Tabs.Tab>
        ))}
      </Tabs.List>

      <Tabs.Panel value="prs" className="pt-3" data-testid={`${idPrefix}-panel-prs`}>
        <PrList prs={prs} showRepo={showRepo} />
      </Tabs.Panel>
      <Tabs.Panel value="commits" className="pt-3" data-testid={`${idPrefix}-panel-commits`}>
        <CommitList commits={commits} showRepo={showRepo} showAuthor={showAuthor} />
      </Tabs.Panel>
      <Tabs.Panel value="comments" className="pt-3" data-testid={`${idPrefix}-panel-comments`}>
        <CommentList comments={comments} showRepo={showRepo} />
      </Tabs.Panel>
      <Tabs.Panel value="loc" className="pt-3" data-testid={`${idPrefix}-panel-loc`}>
        <LocBreakdown prs={prs} totals={totals} showRepo={showRepo} />
      </Tabs.Panel>
    </Tabs.Root>
  );
}

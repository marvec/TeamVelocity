import { useState } from "react";
import type { ScoredPr } from "../../../shared/schema/data";
import { bandBgClass } from "../../lib/format";
import { formatScore } from "../../lib/format";
import { cn } from "../../lib/cn";

type SortKey = "score" | "repo" | "number" | "author" | "title";
type Dir = "asc" | "desc";

function scoreBand(score: number): "red" | "yellow" | "green" {
  return score < 40 ? "red" : score < 70 ? "yellow" : "green";
}

function stateBadge(state: ScoredPr["state"]): string {
  return state === "merged" ? "text-cat-commits" : state === "closed" ? "text-band-red" : "text-foreground-muted";
}

export function PrTable({ prs, showAuthor = true }: { prs: ScoredPr[]; showAuthor?: boolean }) {
  const [sortKey, setSortKey] = useState<SortKey>("score");
  const [dir, setDir] = useState<Dir>("desc");

  const sorted = [...prs].sort((a, b) => {
    const mul = dir === "asc" ? 1 : -1;
    switch (sortKey) {
      case "score":
        return mul * (a.score - b.score);
      case "number":
        return mul * (a.number - b.number);
      case "repo":
        return mul * a.repo.name.localeCompare(b.repo.name);
      case "author":
        return mul * (a.authorName ?? a.authorHandle).localeCompare(b.authorName ?? b.authorHandle);
      case "title":
        return mul * a.title.localeCompare(b.title);
    }
  });

  const toggle = (key: SortKey): void => {
    if (key === sortKey) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      // Score reads best high→low; names and PR numbers read best low→high.
      setDir(key === "score" ? "desc" : "asc");
    }
  };

  const arrow = (key: SortKey): string => (key === sortKey ? (dir === "asc" ? " ▲" : " ▼") : "");
  const ariaSort = (key: SortKey): "ascending" | "descending" | "none" =>
    key === sortKey ? (dir === "asc" ? "ascending" : "descending") : "none";

  if (prs.length === 0) {
    return <p className="py-6 text-center text-sm text-foreground-muted">No pull requests in this selection.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm" data-testid="pr-table">
        <thead>
          <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-foreground-muted">
            <Th ariaSort={ariaSort("repo")} onClick={() => { toggle("repo"); }}>Repo{arrow("repo")}</Th>
            <Th ariaSort={ariaSort("number")} onClick={() => { toggle("number"); }}>PR{arrow("number")}</Th>
            {showAuthor && (
              <Th ariaSort={ariaSort("author")} onClick={() => { toggle("author"); }}>Author{arrow("author")}</Th>
            )}
            <Th ariaSort={ariaSort("title")} onClick={() => { toggle("title"); }}>Title{arrow("title")}</Th>
            <Th ariaSort={ariaSort("score")} className="text-right" onClick={() => { toggle("score"); }}>
              Score{arrow("score")}
            </Th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((pr) => (
            <tr key={`${pr.repo.owner}/${pr.repo.name}#${String(pr.number)}`} className="border-b border-border/60 hover:bg-muted/50">
              <td className="py-1.5 pr-3 text-foreground-muted">{pr.repo.name}</td>
              <td className="py-1.5 pr-3">
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn("tabular font-medium hover:underline", stateBadge(pr.state))}
                  data-testid="pr-link"
                >
                  #{pr.number}
                </a>
              </td>
              {showAuthor && <td className="py-1.5 pr-3 whitespace-nowrap">{pr.authorName ?? pr.authorHandle}</td>}
              <td className="py-1.5 pr-3">
                <a href={pr.url} target="_blank" rel="noreferrer" className="hover:underline">
                  {pr.title}
                </a>
              </td>
              <td className="py-1.5 pl-3">
                <div className="flex items-center justify-end gap-2">
                  <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                    <div className={cn("h-full rounded-full", bandBgClass(scoreBand(pr.score)))} style={{ width: `${String(pr.score)}%` }} />
                  </div>
                  <span className="tabular w-9 text-right text-foreground">{formatScore(pr.score)}</span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  onClick,
  className,
  ariaSort,
}: {
  children: React.ReactNode;
  onClick: () => void;
  className?: string;
  ariaSort: "ascending" | "descending" | "none";
}) {
  return (
    <th
      aria-sort={ariaSort}
      className={cn("cursor-pointer select-none py-2 pr-3 font-medium hover:text-foreground", className)}
    >
      <button type="button" onClick={onClick} className="uppercase tracking-wide">
        {children}
      </button>
    </th>
  );
}

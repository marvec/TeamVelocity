import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ScoredPr } from "../../../shared/schema/data";
import { PrTable } from "./PrTable";

function pr(number: number, score: number): ScoredPr {
  return {
    source: "github",
    repo: { source: "github", owner: "acme", name: "web", url: "https://github.com/acme/web" },
    number,
    title: `PR ${String(number)}`,
    authorHandle: "alice",
    authorName: "Alice",
    state: "merged",
    url: `https://github.com/acme/web/pull/${String(number)}`,
    createdAt: "2026-08-01T00:00:00.000Z",
    mergedAt: "2026-08-02T00:00:00.000Z",
    closedAt: null,
    score,
    breakdown: { loc: 0, reviewActivity: 0, participants: 0, files: 0, commits: 0, linkedIssues: 0 },
    stats: {
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      commits: 0,
      reviewComments: 0,
      issueComments: 0,
      reviews: 0,
      participants: 0,
      linkedIssues: 0,
    },
  };
}

const PRS = [pr(1, 30), pr(2, 90), pr(3, 60)];

describe("PrTable", () => {
  it("defaults to score-descending order", () => {
    render(<PrTable prs={PRS} />);
    const links = screen.getAllByTestId("pr-link");
    expect(links.map((l) => l.textContent)).toEqual(["#2", "#3", "#1"]);
  });

  it("PR rows link out to GitHub in a new tab", () => {
    render(<PrTable prs={PRS} />);
    const link = screen.getAllByTestId("pr-link")[0];
    expect(link).toHaveAttribute("href", "https://github.com/acme/web/pull/2");
    expect(link).toHaveAttribute("target", "_blank");
  });

  it("re-sorts by PR number when the header is clicked", () => {
    render(<PrTable prs={PRS} />);
    fireEvent.click(screen.getByRole("button", { name: /^PR/ }));
    const links = screen.getAllByTestId("pr-link");
    expect(links.map((l) => l.textContent)).toEqual(["#1", "#2", "#3"]);
  });

  it("shows an empty message with no PRs", () => {
    render(<PrTable prs={[]} />);
    expect(screen.getByText(/No pull requests/)).toBeInTheDocument();
  });
});

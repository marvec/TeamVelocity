import { describe, it, expect } from "vitest";
import { emptyTotals } from "../../shared/types";
import type { MemberWeekDetail, ScoredPr, TotalsData, WeekDetail } from "../../shared/schema/data";
import { memberScope, repoRefKey, teamScope } from "./selectors";
import { copyMembers, copyPersonDetail, copyWeekDetail, escapeHtml } from "./copy-export";

function totals(over: Partial<TotalsData>): TotalsData {
  return { ...emptyTotals(), ...over };
}

const web = { source: "github" as const, owner: "acme", name: "web", url: "https://github.com/acme/web" };
const api = { source: "github" as const, owner: "acme", name: "api", url: "https://github.com/acme/api" };

function pr(number: number, score: number, title: string, over: Partial<ScoredPr> = {}): ScoredPr {
  return {
    source: "github",
    repo: web,
    number,
    title,
    authorHandle: "alice",
    authorName: "Alice",
    state: "merged",
    url: `https://github.com/acme/web/pull/${String(number)}`,
    createdAt: "2026-08-04T10:00:00.000Z",
    mergedAt: "2026-08-05T10:00:00.000Z",
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
    ...over,
  };
}

const alice: MemberWeekDetail = {
  handle: "alice",
  name: "Alice",
  velocity: 61.6,
  velocityBand: "yellow",
  warmingUp: false,
  totals: totals({ prsMerged: 2, commits: 5, comments: 2, locAdded: 1200, locRemoved: 34 }),
  repos: [
    {
      repo: web,
      totals: totals({ prsMerged: 1, commits: 3, comments: 1 }),
      velocity: 62.4,
      velocityBand: "yellow",
      warmingUp: false,
    },
    { repo: api, totals: totals({ prsMerged: 1, commits: 2, comments: 1 }), velocity: 80, velocityBand: "green", warmingUp: false },
  ],
  prs: [pr(11, 50, "Alice web PR"), pr(12, 30, "Alice api PR", { repo: api, url: "https://github.com/acme/api/pull/12" })],
  comments: [
    {
      kind: "issue",
      repo: web,
      prNumber: 11,
      createdAt: "2026-08-05T10:00:00.000Z",
      url: "https://github.com/acme/web/pull/11#issuecomment-1",
    },
    {
      kind: "issue",
      repo: api,
      prNumber: null,
      createdAt: "2026-08-06T10:00:00.000Z",
      url: "https://github.com/acme/api/issues/3#issuecomment-2",
    },
  ],
  commits: [
    {
      sha: "abcdef1234567",
      repo: web,
      authorHandle: "alice",
      committedAt: "2026-08-06T10:00:00.000Z",
      url: "https://github.com/acme/web/commit/abcdef1234567",
    },
  ],
};

const bob: MemberWeekDetail = {
  handle: "bob",
  name: "Bob",
  velocity: 19.4,
  velocityBand: "red",
  warmingUp: false,
  totals: totals({ commits: 4 }),
  repos: [{ repo: web, totals: totals({ commits: 4 }), velocity: 20, velocityBand: "red", warmingUp: false }],
  prs: [],
  comments: [],
  commits: [],
};

function week(over: Partial<WeekDetail> = {}): WeekDetail {
  return {
    weekStart: "2026-08-03",
    weekEnd: "2026-08-10",
    label: "2026/08/03–08/09",
    velocity: 55,
    velocityBand: "yellow",
    warmingUp: false,
    totals: totals({ prsMerged: 3, commits: 9, comments: 2, locAdded: 112, locRemoved: 246 }),
    prs: [pr(1, 40, "Low"), pr(2, 90, "High"), pr(3, 70, "Mid")],
    members: [alice, bob],
    repos: [
      { repo: api, totals: totals({ prsMerged: 1, commits: 2 }), velocity: 51, velocityBand: "yellow", warmingUp: false },
      { repo: web, totals: totals({ prsMerged: 2, commits: 7 }), velocity: 66, velocityBand: "yellow", warmingUp: false },
    ],
    ...over,
  };
}

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;");
  });
});

describe("copyWeekDetail", () => {
  it("lists PRs in score-descending order in both outputs", () => {
    const { html, markdown } = copyWeekDetail(week());
    const order = (s: string) => ["High", "Mid", "Low"].map((t) => s.indexOf(t));
    const h = order(html);
    const m = order(markdown);
    expect(h.every((i) => i >= 0)).toBe(true);
    expect(h).toEqual([...h].sort((a, b) => a - b));
    expect(m.every((i) => i >= 0)).toBe(true);
    expect(m).toEqual([...m].sort((a, b) => a - b));
  });

  it("links each title and number to the PR URL", () => {
    const { html, markdown } = copyWeekDetail(week());
    expect(html).toContain('<a href="https://github.com/acme/web/pull/2">High</a>');
    expect(html).toContain('<a href="https://github.com/acme/web/pull/2">#2</a>');
    expect(markdown).toContain("[High](https://github.com/acme/web/pull/2)");
    expect(markdown).toContain("[#2](https://github.com/acme/web/pull/2)");
  });

  it("includes the week label heading, totals line, and repo/author/state/score columns", () => {
    const { html, markdown } = copyWeekDetail(week());
    expect(html).toContain("<h2>Week detail · 2026/08/03–08/09</h2>");
    expect(markdown).toContain("## Week detail · 2026/08/03–08/09");
    const totalsLine = "3 PRs · 9 commits · 2 comments · 358 LOC +112/−246";
    expect(html).toContain(`<p>${totalsLine}</p>`);
    expect(markdown).toContain(totalsLine);
    expect(markdown).toContain("| Repo | PR | Title | Author | State | Score |");
    expect(markdown).toContain("| --- | --- | --- | --- | --- | --- |");
    expect(markdown).toContain("| web | [#2](https://github.com/acme/web/pull/2) | [High](https://github.com/acme/web/pull/2) | Alice | merged | 90% |");
    expect(html).toContain("<td>Alice</td><td>merged</td><td>90%</td>");
  });

  it("falls back to the author handle when the name is missing", () => {
    const { markdown } = copyWeekDetail(week({ prs: [pr(5, 10, "T", { authorName: null, authorHandle: "ghost" })] }));
    expect(markdown).toContain("| ghost |");
  });

  it("escapes HTML in titles and keeps the Markdown table intact", () => {
    const evil = "Fix <script>alert(1)</script> | [x] & stuff";
    const { html, markdown } = copyWeekDetail(week({ prs: [pr(7, 50, evil)] }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("Fix &lt;script&gt;alert(1)&lt;/script&gt; | [x] &amp; stuff");
    const row = markdown.split("\n").find((l) => l.includes("#7"));
    expect(row).toBeDefined();
    expect(row).toContain("[Fix <script>alert(1)</script> \\| \\[x\\] & stuff](https://github.com/acme/web/pull/7)");
    // Six cells → seven unescaped pipes.
    expect((row ?? "").replace(/\\\|/g, "").split("|").length - 1).toBe(7);
  });

  it("does not let newlines in a title break a Markdown table row", () => {
    const { markdown } = copyWeekDetail(week({ prs: [pr(8, 50, "line one\nline two")] }));
    const row = markdown.split("\n").find((l) => l.includes("#8"));
    expect(row).toContain("line one line two");
  });

  it("escapes quotes in URL attributes and parentheses/spaces in Markdown URLs", () => {
    const url = 'https://example.com/a b(c)"d';
    const { html, markdown } = copyWeekDetail(week({ prs: [pr(9, 50, "T", { url })] }));
    expect(html).toContain('href="https://example.com/a b(c)&quot;d"');
    expect(markdown).toContain("[T](https://example.com/a%20b%28c%29%22d)");
  });

  it("does not render a link for a non-http(s) URL", () => {
    const { html, markdown } = copyWeekDetail(week({ prs: [pr(10, 50, "Bad", { url: "javascript:alert(1)" })] }));
    expect(html).not.toContain("javascript:");
    expect(markdown).not.toContain("javascript:");
    expect(html).toContain("<td>Bad</td>");
  });

  it("with zero PRs outputs the heading and a 'No pull requests' line, not an empty table", () => {
    const { html, markdown } = copyWeekDetail(week({ prs: [] }));
    expect(html).toContain("<h2>Week detail · 2026/08/03–08/09</h2>");
    expect(html).toContain("No pull requests");
    expect(html).not.toContain("<table");
    expect(markdown).toContain("## Week detail");
    expect(markdown).toContain("No pull requests");
    expect(markdown).not.toContain("| --- |");
  });
});

describe("copyMembers", () => {
  it("lists every member with velocity formatted as the UI does", () => {
    const { html, markdown } = copyMembers(week());
    expect(html).toContain("<h2>Velocity of individuals · 2026/08/03–08/09</h2>");
    expect(markdown).toContain("## Velocity of individuals · 2026/08/03–08/09");
    expect(markdown).toContain("| Member | Velocity | Band | PRs | Commits | Comments | LOC + | LOC − |");
    expect(markdown).toContain("| Alice | 62 | yellow | 2 | 5 | 2 | 1,200 | 34 |");
    expect(markdown).toContain("| Bob | 19 | red | 0 | 4 | 0 | 0 | 0 |");
    expect(html).toContain("<td>Alice</td><td>62</td><td>yellow</td><td>2</td><td>5</td><td>2</td><td>1,200</td><td>34</td>");
    expect(html).toContain("<td>Bob</td><td>19</td>");
  });

  it("with no members outputs a 'No members' line instead of a table", () => {
    const { html, markdown } = copyMembers(week({ members: [] }));
    expect(html).toContain("No members");
    expect(html).not.toContain("<table");
    expect(markdown).toContain("No members");
    expect(markdown).not.toContain("| --- |");
  });

  it("escapes member names", () => {
    const { html, markdown } = copyMembers(week({ members: [{ ...bob, name: "B|o<b>" }] }));
    expect(html).toContain("<td>B|o&lt;b&gt;</td>");
    expect(markdown).toContain("| B\\|o<b> |");
  });
});

describe("copyPersonDetail", () => {
  it("names the member, links the selected repo, and lists that repo's PRs, commits, and comments", () => {
    const { html, markdown } = copyPersonDetail({
      scope: memberScope(alice),
      isMember: true,
      selectedRepo: repoRefKey(web),
    });
    expect(html).toContain("<h2>Alice</h2>");
    expect(markdown).toContain("## Alice");
    expect(markdown).toContain("Velocity: 62 (yellow)");
    expect(markdown).toContain("2 PRs · 5 commits · 2 comments · 1,234 LOC +1,200/−34");

    // Repo table links every repo.
    expect(html).toContain('<a href="https://github.com/acme/web">acme/web</a>');
    expect(html).toContain('<a href="https://github.com/acme/api">acme/api</a>');
    expect(markdown).toContain("| [acme/api](https://github.com/acme/api) | 80 | green | 1 | 2 | 1 | 0 | 0 |");

    // Selected repo section.
    expect(html).toContain('<h3><a href="https://github.com/acme/web">acme/web</a></h3>');
    expect(markdown).toContain("### [acme/web](https://github.com/acme/web)");
    expect(html).toContain('<a href="https://github.com/acme/web/pull/11#issuecomment-1">comment on #11</a>');
    expect(markdown).toContain("[comment on #11](https://github.com/acme/web/pull/11#issuecomment-1)");
    expect(markdown).toContain("[abcdef1](https://github.com/acme/web/commit/abcdef1234567)");
    expect(markdown).toContain("[#11](https://github.com/acme/web/pull/11)");
    // Rows from other repos are not in the selected-repo section.
    const repoSection = markdown.slice(markdown.indexOf("### [acme/web]"));
    expect(repoSection).not.toContain("issuecomment-2");
    expect(repoSection).not.toContain("Alice api PR");
  });

  it("includes the member's PR table when a member is selected", () => {
    const { markdown } = copyPersonDetail({ scope: memberScope(alice), isMember: true });
    expect(markdown).toContain("### Pull requests");
    expect(markdown).toContain("[Alice web PR](https://github.com/acme/web/pull/11)");
    expect(markdown).not.toContain("### [acme/");
  });

  it("with no member selected the heading says team scope", () => {
    const { html, markdown } = copyPersonDetail({ scope: teamScope(week()), isMember: false });
    expect(html).toContain("<h2>Team detail</h2>");
    expect(markdown).toContain("## Team detail");
    expect(markdown).not.toContain("Velocity:");
    expect(markdown).not.toContain("### Pull requests");
    expect(markdown).toContain("3 PRs · 9 commits · 2 comments · 358 LOC +112/−246");
  });


  it("team scope with a repo selected shows commit authors", () => {
    const { markdown } = copyPersonDetail({
      scope: teamScope(week()),
      isMember: false,
      selectedRepo: repoRefKey(web),
    });
    expect(markdown).toContain("[abcdef1](https://github.com/acme/web/commit/abcdef1234567) · alice");
  });

  it("shows empty lines for a selected repo with no activity of a kind", () => {
    const { markdown, html } = copyPersonDetail({
      scope: memberScope(bob),
      isMember: true,
      selectedRepo: repoRefKey(web),
    });
    expect(markdown).toContain("No pull requests");
    expect(markdown).toContain("No commits");
    expect(markdown).toContain("No comments");
    expect(html).not.toContain("<ul></ul>");
  });

  it("ignores a selected repo that is not in scope", () => {
    const { markdown } = copyPersonDetail({ scope: memberScope(bob), isMember: true, selectedRepo: "nope/nope" });
    expect(markdown).not.toContain("### [");
  });

  it("with no repo activity outputs a 'No repo activity' line", () => {
    const scope = { ...memberScope(bob), repos: [] };
    const { html, markdown } = copyPersonDetail({ scope, isMember: true });
    expect(markdown).toContain("No repo activity");
    expect(html).toContain("No repo activity");
  });
});

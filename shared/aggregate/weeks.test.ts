import { describe, it, expect } from "vitest";
import {
  weekStartFor,
  weekEndFor,
  weekLabel,
  isoDate,
  weekKeyFor,
  enumerateWeeks,
  bucketByWeek,
  WEEKDAYS,
  type Weekday,
  type WeekConfig,
} from "./weeks";

/**
 * These tests are timezone-sensitive and assume `TZ=Europe/Prague` (set by the
 * test script). 2026 DST transitions in Prague:
 *   spring forward: 2026-03-29 02:00 -> 03:00 (a 167h week)
 *   fall back:      2026-10-25 03:00 -> 02:00 (a 169h week)
 * Reference facts: 2026-08-24 is a Monday; 2026-03-29 and 2026-10-25 are Sundays.
 */

const MON: WeekConfig = { sprintStartsOn: "Mon", sprintStartHour: 0 };
const DAY_MS = 24 * 3600 * 1000;

describe("weekStartFor — default Monday boundary", () => {
  it("returns the same instant when the date is exactly on the boundary", () => {
    const monday = new Date(2026, 7, 24, 0, 0, 0, 0); // Mon 2026-08-24 00:00
    expect(weekKeyFor(monday, MON)).toBe("2026-08-24");
    expect(weekStartFor(monday, MON).getTime()).toBe(monday.getTime());
  });

  it("walks back to Monday from mid-week", () => {
    const wed = new Date(2026, 7, 26, 15, 30, 0, 0); // Wed 2026-08-26 15:30
    expect(weekKeyFor(wed, MON)).toBe("2026-08-24");
  });

  it("keeps Sunday in the same (previous Monday) week", () => {
    const sun = new Date(2026, 7, 30, 23, 59, 0, 0); // Sun 2026-08-30 23:59
    expect(weekKeyFor(sun, MON)).toBe("2026-08-24");
  });

  it("rolls to the next week the moment the next Monday starts", () => {
    const nextMon = new Date(2026, 7, 31, 0, 0, 0, 0); // Mon 2026-08-31 00:00
    expect(weekKeyFor(nextMon, MON)).toBe("2026-08-31");
  });
});

describe("weekStartFor — every sprintStartsOn", () => {
  const reference = new Date(2026, 7, 26, 12, 0, 0, 0); // Wed 2026-08-26 12:00
  const expectedDay: Record<Weekday, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  for (const day of WEEKDAYS) {
    it(`lands on ${day} at or before the reference date`, () => {
      const start = weekStartFor(reference, { sprintStartsOn: day, sprintStartHour: 0 });
      expect(start.getDay()).toBe(expectedDay[day]);
      expect(start.getTime()).toBeLessThanOrEqual(reference.getTime());
      // The window is at most 7 days wide.
      expect(reference.getTime() - start.getTime()).toBeLessThan(7 * DAY_MS);
      expect(start.getHours()).toBe(0);
    });
  }

  it("selects the same day when sprintStartsOn matches the reference weekday", () => {
    const start = weekStartFor(reference, { sprintStartsOn: "Wed", sprintStartHour: 0 });
    expect(isoDate(start)).toBe("2026-08-26");
  });
});

describe("weekStartFor — sprintStartHour", () => {
  const cfg: WeekConfig = { sprintStartsOn: "Mon", sprintStartHour: 9 };

  it("belongs to the previous week just before the boundary hour", () => {
    const before = new Date(2026, 7, 24, 8, 59, 0, 0); // Mon 08:59, boundary is 09:00
    expect(weekKeyFor(before, cfg)).toBe("2026-08-17");
  });

  it("flips to the new week exactly at the boundary hour", () => {
    const at = new Date(2026, 7, 24, 9, 0, 0, 0); // Mon 09:00
    const start = weekStartFor(at, cfg);
    expect(isoDate(start)).toBe("2026-08-24");
    expect(start.getHours()).toBe(9);
  });

  it("stays in the new week after the boundary hour", () => {
    const after = new Date(2026, 7, 24, 9, 1, 0, 0);
    expect(weekKeyFor(after, cfg)).toBe("2026-08-24");
  });
});

describe("weekEndFor / weekLabel", () => {
  it("weekEnd is 7 wall-clock days after weekStart (normal week)", () => {
    const start = new Date(2026, 7, 24, 0, 0, 0, 0);
    const end = weekEndFor(start);
    expect(isoDate(end)).toBe("2026-08-31");
    expect(end.getTime() - start.getTime()).toBe(7 * DAY_MS);
  });

  it("labels the inclusive human range as YYYY/MM/DD–MM/DD", () => {
    const start = new Date(2026, 7, 24, 0, 0, 0, 0);
    expect(weekLabel(start)).toBe("2026/08/24–08/30");
  });

  it("labels a month-crossing week", () => {
    const start = new Date(2026, 7, 31, 0, 0, 0, 0); // Mon Aug 31 -> Sun Sep 6
    expect(weekLabel(start)).toBe("2026/08/31–09/06");
  });
});

describe("DST — spring forward (167h week)", () => {
  const cfg: WeekConfig = { sprintStartsOn: "Sun", sprintStartHour: 0 };

  it("buckets the transition day into the Sunday week", () => {
    const during = new Date(2026, 2, 29, 12, 0, 0, 0); // Sun 2026-03-29 (spring forward)
    expect(weekKeyFor(during, cfg)).toBe("2026-03-29");
  });

  it("keeps a post-transition instant in the same week", () => {
    const after = new Date(2026, 2, 29, 5, 0, 0, 0);
    expect(weekKeyFor(after, cfg)).toBe("2026-03-29");
  });

  it("weekEnd is wall-clock +7 days but only 167 real hours elapsed", () => {
    const start = weekStartFor(new Date(2026, 2, 29, 12, 0, 0, 0), cfg);
    const end = weekEndFor(start);
    expect(isoDate(start)).toBe("2026-03-29");
    expect(isoDate(end)).toBe("2026-04-05");
    expect(end.getTime() - start.getTime()).toBe(167 * 3600 * 1000);
  });
});

describe("DST — fall back (169h week)", () => {
  const cfg: WeekConfig = { sprintStartsOn: "Sun", sprintStartHour: 0 };

  it("weekEnd is wall-clock +7 days but 169 real hours elapsed", () => {
    const start = weekStartFor(new Date(2026, 9, 25, 12, 0, 0, 0), cfg); // Sun 2026-10-25
    const end = weekEndFor(start);
    expect(isoDate(start)).toBe("2026-10-25");
    expect(isoDate(end)).toBe("2026-11-01");
    expect(end.getTime() - start.getTime()).toBe(169 * 3600 * 1000);
  });
});

describe("enumerateWeeks — includes empty weeks", () => {
  it("materializes every contiguous week across a month (no gaps)", () => {
    const weeks = enumerateWeeks(new Date(2026, 7, 1), new Date(2026, 7, 31), MON);
    expect(weeks.map((w) => w.key)).toEqual([
      "2026-07-27",
      "2026-08-03",
      "2026-08-10",
      "2026-08-17",
      "2026-08-24",
      "2026-08-31",
    ]);
    // contiguous: each weekEnd equals the next weekStart
    for (let i = 1; i < weeks.length; i++) {
      expect(weeks[i].weekStart.getTime()).toBe(weeks[i - 1].weekEnd.getTime());
    }
  });

  it("returns a single window when the range fits inside one week", () => {
    const weeks = enumerateWeeks(new Date(2026, 7, 25), new Date(2026, 7, 27), MON);
    expect(weeks).toHaveLength(1);
    expect(weeks[0].key).toBe("2026-08-24");
  });

  it("returns [] for a reversed range", () => {
    expect(enumerateWeeks(new Date(2026, 7, 31), new Date(2026, 7, 1), MON)).toEqual([]);
  });
});

describe("bucketByWeek", () => {
  interface Item {
    at: Date;
    id: number;
  }
  const getDate = (i: Item) => i.at;

  it("groups items by their week id", () => {
    const items: Item[] = [
      { at: new Date(2026, 7, 24, 1, 0), id: 1 }, // 08-24
      { at: new Date(2026, 7, 30, 23, 0), id: 2 }, // 08-24
      { at: new Date(2026, 7, 31, 0, 0), id: 3 }, // 08-31
    ];
    const buckets = bucketByWeek(items, getDate, MON);
    expect([...buckets.keys()].sort()).toEqual(["2026-08-24", "2026-08-31"]);
    expect(buckets.get("2026-08-24")!.map((i) => i.id)).toEqual([1, 2]);
    expect(buckets.get("2026-08-31")!.map((i) => i.id)).toEqual([3]);
  });

  it("returns an empty map for no items", () => {
    expect(bucketByWeek([], getDate, MON).size).toBe(0);
  });
});

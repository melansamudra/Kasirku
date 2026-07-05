import { describe, expect, it } from "vitest";
import { getPeriodRange, parsePeriod } from "./period";

describe("parsePeriod", () => {
  it("passes through a recognized period", () => {
    expect(parsePeriod("week")).toBe("week");
  });

  it("falls back to 'today' for an unrecognized or missing value", () => {
    expect(parsePeriod("bogus")).toBe("today");
    expect(parsePeriod(undefined)).toBe("today");
  });
});

describe("getPeriodRange", () => {
  it("'today' starts at 00:00 WIB with no upper bound", () => {
    const { fromIso, toIsoExclusive } = getPeriodRange("today");
    expect(fromIso).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\+07:00$/);
    expect(toIsoExclusive).toBeNull();
  });

  it("'week' starts 6 days before today (7-day inclusive window)", () => {
    const today = getPeriodRange("today").fromIso!.slice(0, 10);
    const week = getPeriodRange("week").fromIso!.slice(0, 10);
    const diffDays =
      (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${week}T00:00:00Z`)) / 86_400_000;
    expect(diffDays).toBe(6);
  });

  it("'month' starts on the 1st of the current WIB month", () => {
    const { fromIso } = getPeriodRange("month");
    expect(fromIso).toMatch(/^\d{4}-\d{2}-01T00:00:00\+07:00$/);
  });

  it("'all' has no bounds", () => {
    expect(getPeriodRange("all")).toEqual({ fromIso: null, toIsoExclusive: null });
  });

  it("'custom' uses the given from/to dates, with 'to' made exclusive (+1 day)", () => {
    const { fromIso, toIsoExclusive } = getPeriodRange("custom", "2026-01-10", "2026-01-15");
    expect(fromIso).toBe("2026-01-10T00:00:00+07:00");
    expect(toIsoExclusive).toBe("2026-01-16T00:00:00+07:00");
  });

  it("'custom' with a missing date leaves that side unbounded", () => {
    expect(getPeriodRange("custom", undefined, "2026-01-15")).toEqual({
      fromIso: null,
      toIsoExclusive: "2026-01-16T00:00:00+07:00",
    });
    expect(getPeriodRange("custom", "2026-01-10", undefined)).toEqual({
      fromIso: "2026-01-10T00:00:00+07:00",
      toIsoExclusive: null,
    });
  });

  it("'custom' ignores a malformed date string instead of throwing", () => {
    expect(getPeriodRange("custom", "not-a-date", "2026-01-15")).toEqual({
      fromIso: null,
      toIsoExclusive: "2026-01-16T00:00:00+07:00",
    });
  });

  it("'custom' rolls the exclusive upper bound over a month boundary", () => {
    const { toIsoExclusive } = getPeriodRange("custom", "2026-01-01", "2026-01-31");
    expect(toIsoExclusive).toBe("2026-02-01T00:00:00+07:00");
  });
});

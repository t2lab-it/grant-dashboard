import { describe, expect, it } from "vitest";
import {
  formatTokyoDateKey,
  formatTokyoMonthKey,
  inferJapaneseFiscalYear,
  listFiscalYearMonths,
} from "../../src/lib/calendar";

describe("Tokyo calendar helpers", () => {
  it("uses the Tokyo date across the UTC day boundary", () => {
    const instant = new Date("2026-03-31T15:00:00.000Z");

    expect(formatTokyoDateKey(instant)).toBe("2026-04-01");
    expect(formatTokyoMonthKey(instant)).toBe("2026-04");
    expect(inferJapaneseFiscalYear(instant)).toBe(2026);
  });

  it("keeps the preceding fiscal year until April begins in Tokyo", () => {
    const instant = new Date("2026-03-31T14:59:59.999Z");

    expect(formatTokyoDateKey(instant)).toBe("2026-03-31");
    expect(formatTokyoMonthKey(instant)).toBe("2026-03");
    expect(inferJapaneseFiscalYear(instant)).toBe(2025);
  });

  it("lists a fiscal year from April through the following March", () => {
    expect(listFiscalYearMonths(2026)).toEqual([
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { getCrossAggregateChartColors } from "../../src/features/overview/overviewChart";

describe("overview chart palette helpers", () => {
  it("derives cross aggregate colors from the selected overview chart palette", () => {
    const colors = getCrossAggregateChartColors({
      actual: "#7c3aed",
      committed: "#f97316",
      balance: "#fff7ed",
      balanceBorder: "#c2410c",
    });

    expect(colors).toEqual({
      equipment: "#7c3aed",
      travel: "#f97316",
      personnel: "#c2410c",
      other: "#bb5782",
      unset: "#935b4c",
    });
  });
});

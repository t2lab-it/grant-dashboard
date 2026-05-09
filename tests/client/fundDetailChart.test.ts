import { describe, expect, it } from "vitest";
import {
  createFundDetailChartData,
  createFundDetailChartDataForPalette,
} from "../../src/features/funds/fundDetailChart";

describe("createFundDetailChartData", () => {
  it("uses ring segment names that match the rendered ring positions", () => {
    const chartData = createFundDetailChartData(
      [
        {
          id: 1,
          categoryName: "物品費",
          plannedAmount: 100000,
          actualAmount: 50000,
        },
      ],
      200000,
      "teal-yellow",
      "grouped-yen",
    );

    expect(chartData.innerRingSegments.map((segment) => segment.label)).toEqual([
      "執行済",
      "執行予定",
      "残高",
    ]);
    expect(chartData.outerRingSegments.map((segment) => segment.label)).toEqual([
      "物品費 執行済",
      "物品費 執行予定",
      "残高",
    ]);
  });

  it("calculates an over-budget ring when the free balance is negative", () => {
    const chartData = createFundDetailChartData(
      [
        {
          id: 1,
          categoryName: "物品費",
          plannedAmount: 700000,
          actualAmount: 400000,
        },
      ],
      1000000,
      "teal-yellow",
      "grouped-yen",
    );

    expect(chartData.freeBalance).toBe(-100000);
    expect(chartData.overBudgetAmount).toBe(100000);
    expect(chartData.overBudgetPercentage).toBe(10);
    expect(chartData.outerRingSegments.map((segment) => segment.label)).toEqual([
      "物品費 執行済",
      "物品費 執行予定",
    ]);
  });

  it("uses a custom palette for inner ring colors and balance borders", () => {
    const chartData = createFundDetailChartDataForPalette(
      [
        {
          id: 1,
          categoryName: "物品費",
          plannedAmount: 100000,
          actualAmount: 50000,
        },
      ],
      200000,
      {
        actual: "#7c3aed",
        committed: "#f97316",
        balance: "#fff7ed",
        balanceBorder: "#c2410c",
      },
      "grouped-yen",
    );

    expect(chartData.innerRingSegments).toMatchObject([
      { label: "執行済", color: "#7c3aed" },
      { label: "執行予定", color: "#f97316" },
      { label: "残高", color: "#fff7ed", borderColor: "#c2410c" },
    ]);
    expect(chartData.outerRingSegments.at(-1)).toMatchObject({
      label: "残高",
      color: "#fff7ed",
      borderColor: "#c2410c",
    });
  });
});

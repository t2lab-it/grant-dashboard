import { describe, expect, test } from "vitest";
import type {
  FiscalYearComparisonFund,
  FiscalYearComparisonResponse,
  FiscalYearComparisonYear,
  FiscalYearState,
} from "../../src/contracts/fiscalYearComparison";
import { listFiscalYearMonths } from "../../src/lib/calendar";
import { buildFiscalYearComparisonModel } from "../../src/features/fiscal-years/fiscalYearComparisonModel";

function comparisonYear({
  fiscalYear,
  state,
  assets = 1000,
  committed = 300,
  actual = 0,
  equipment = { plannedAmount: 100, actualAmount: 200 },
  travel = { plannedAmount: 30, actualAmount: 40 },
  funds = [],
  monthly = {},
}: {
  fiscalYear: number;
  state: FiscalYearState;
  assets?: number;
  committed?: number;
  actual?: number;
  equipment?: { plannedAmount: number; actualAmount: number };
  travel?: { plannedAmount: number; actualAmount: number };
  funds?: FiscalYearComparisonFund[];
  monthly?: Record<string, { committed?: number; actual?: number }>;
}): FiscalYearComparisonYear {
  return {
    fiscalYear,
    state,
    totals: { assets, committed, actual },
    funds,
    crossAggregateCategories: [
      { crossAggregateCategory: "equipment", ...equipment },
      { crossAggregateCategory: "travel", ...travel },
      { crossAggregateCategory: "personnel", plannedAmount: 0, actualAmount: 0 },
      { crossAggregateCategory: "other", plannedAmount: 0, actualAmount: 0 },
      { crossAggregateCategory: "unset", plannedAmount: 0, actualAmount: 0 },
    ],
    monthlyStatus: listFiscalYearMonths(fiscalYear).map((month) => ({
      month,
      committed: monthly[month]?.committed ?? 0,
      actual: monthly[month]?.actual ?? 0,
    })),
  };
}

function response(fiscalYears: FiscalYearComparisonYear[]): FiscalYearComparisonResponse {
  return { currentFiscalYear: 2026, fiscalYears };
}

describe("fiscal year comparison display model", () => {
  test("derives state-specific budget and category display amounts", () => {
    const model = buildFiscalYearComparisonModel(
      response([
        comparisonYear({ fiscalYear: 2027, state: "future", actual: 100 }),
        comparisonYear({ fiscalYear: 2026, state: "current", actual: 600 }),
        comparisonYear({ fiscalYear: 2025, state: "past", actual: 800 }),
      ]),
      "2026-08",
    );

    expect(model.years.map((year) => year.fiscalYear)).toEqual([2027, 2026, 2025]);
    expect(model.years[2].budget).toMatchObject({
      displayCommitted: 0,
      displayUsed: 800,
      displayBalance: 200,
      drawableBalance: 200,
      displayRate: 80,
      statusLabel: "最終",
    });
    expect(model.years[1].budget).toMatchObject({
      displayCommitted: 300,
      displayUsed: 900,
      displayBalance: 100,
      drawableBalance: 100,
      displayRate: 90,
      statusLabel: "見込み",
    });
    expect(model.years[0].budget.statusLabel).toBe("予定");
    expect(model.years[2].categories.find((row) => row.code === "travel")).toMatchObject({
      displayAmount: 40,
      percentage: 16.666666666666664,
    });
    expect(model.years[1].categories.find((row) => row.code === "travel")).toMatchObject({
      displayAmount: 70,
      percentage: 18.91891891891892,
    });
  });

  test("builds awarded budget composition and reuses exact-name color indexes across years", () => {
    const model = buildFiscalYearComparisonModel(
      response([
        comparisonYear({
          fiscalYear: 2027,
          state: "future",
          assets: 1000,
          funds: [
            { id: 4, name: "基盤研究費", awardedAmount: 200, displayOrder: 1 },
            { id: 5, name: "新規研究費", awardedAmount: 800, displayOrder: 2 },
          ],
        }),
        comparisonYear({
          fiscalYear: 2026,
          state: "current",
          assets: 1000,
          funds: [
            { id: 1, name: "基盤研究費", awardedAmount: 600, displayOrder: 1 },
            { id: 2, name: "共同研究費", awardedAmount: 400, displayOrder: 2 },
          ],
        }),
      ]),
      "2026-08",
    );

    expect(model.years[0].funds.map((fund) => ({
      name: fund.name,
      percentage: fund.percentage,
    }))).toEqual([
      { name: "新規研究費", percentage: 80 },
      { name: "基盤研究費", percentage: 20 },
    ]);
    expect(model.years[1].funds.map((fund) => ({
      name: fund.name,
      percentage: fund.percentage,
    }))).toEqual([
      { name: "基盤研究費", percentage: 60 },
      { name: "共同研究費", percentage: 40 },
    ]);

    const futureShared = model.years[0].funds.find((fund) => fund.name === "基盤研究費");
    const currentShared = model.years[1].funds.find((fund) => fund.name === "基盤研究費");
    expect(futureShared?.colorIndex).toBe(currentShared?.colorIndex);
  });

  test("keeps signed overrun values while making chart geometry safe", () => {
    const model = buildFiscalYearComparisonModel(
      response([
        comparisonYear({
          fiscalYear: 2026,
          state: "current",
          assets: 100,
          actual: 120,
          committed: 30,
          equipment: { plannedAmount: 0, actualAmount: 0 },
          travel: { plannedAmount: 0, actualAmount: 0 },
        }),
        comparisonYear({
          fiscalYear: 2025,
          state: "past",
          assets: 0,
          actual: 50,
          committed: 20,
          equipment: { plannedAmount: 0, actualAmount: 0 },
          travel: { plannedAmount: 0, actualAmount: 0 },
        }),
      ]),
      "2026-08",
    );

    expect(model.years[0].budget).toMatchObject({
      displayUsed: 150,
      displayBalance: -50,
      drawableBalance: 0,
      displayRate: 150,
    });
    expect(model.years[1].budget.displayRate).toBeNull();
    expect(model.years[1].categoryTotal).toBe(0);
    expect(model.years[1].categories.every((row) => row.percentage === null)).toBe(true);
    expect(model.maxAssets).toBe(100);
  });

  test("builds past actual, current actual and forecast, and future forecast pace series", () => {
    const model = buildFiscalYearComparisonModel(
      response([
        comparisonYear({
          fiscalYear: 2027,
          state: "future",
          assets: 1000,
          actual: 50,
          committed: 100,
          monthly: {
            "2027-04": { actual: 50 },
            "2027-05": { committed: 100 },
          },
        }),
        comparisonYear({
          fiscalYear: 2026,
          state: "current",
          assets: 1000,
          actual: 200,
          committed: 180,
          monthly: {
            "2026-04": { actual: 100 },
            "2026-05": { actual: 100 },
            "2026-06": { committed: 50 },
            "2026-08": { committed: 30 },
            "2026-10": { committed: 100 },
          },
        }),
        comparisonYear({
          fiscalYear: 2025,
          state: "past",
          assets: 1000,
          actual: 300,
          committed: 400,
          monthly: {
            "2025-04": { actual: 100 },
            "2025-05": { committed: 400, actual: 200 },
          },
        }),
      ]),
      "2026-08",
    );

    const future = model.years[0].pace;
    expect(future.actualPoints).toEqual([]);
    expect(future.projectedPoints.slice(0, 2).map((point) => point.amount)).toEqual([50, 150]);
    expect(future.projectedPoints.at(-1)?.rate).toBe(15);

    const current = model.years[1].pace;
    expect(current.actualPoints).toHaveLength(5);
    expect(current.actualPoints.at(-1)).toMatchObject({ month: "2026-08", amount: 200, rate: 20 });
    expect(current.projectedPoints.slice(0, 2)).toMatchObject([
      { month: "2026-08", monthIndex: 4, amount: 200 },
      { month: "2026-08", monthIndex: 4, amount: 280 },
    ]);
    expect(current.projectedPoints[0].rate).toBeCloseTo(20);
    expect(current.projectedPoints[1].rate).toBeCloseTo(28);
    expect(current.projectedPoints.find((point) => point.month === "2026-10")).toMatchObject({
      amount: 380,
      rate: 38,
    });

    const past = model.years[2].pace;
    expect(past.projectedPoints).toEqual([]);
    expect(past.actualPoints[1]).toMatchObject({ amount: 300, rate: 30 });
    expect(past.actualPoints.at(-1)).toMatchObject({ amount: 300, rate: 30 });
  });

  test("returns null pace rates for zero budgets and preserves rates above 100 percent", () => {
    const model = buildFiscalYearComparisonModel(
      response([
        comparisonYear({
          fiscalYear: 2026,
          state: "current",
          assets: 0,
          actual: 10,
          committed: 0,
          monthly: { "2026-04": { actual: 10 } },
        }),
        comparisonYear({
          fiscalYear: 2025,
          state: "past",
          assets: 100,
          actual: 120,
          committed: 0,
          monthly: { "2025-04": { actual: 120 } },
        }),
      ]),
      "2026-08",
    );

    expect(model.years[0].pace.hasBudget).toBe(false);
    expect(model.years[0].pace.actualPoints.every((point) => point.rate === null)).toBe(true);
    expect(model.years[1].pace.actualPoints[0].rate).toBe(120);
    expect(model.maxPaceRate).toBe(120);
  });
});

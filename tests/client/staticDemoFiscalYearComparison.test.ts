import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  handleStaticDemoRequest,
  resetStaticDemoStore,
} from "../../src/demo/staticDemoApi";
import { readClonedStaticDemoState } from "../../src/demo/staticDemoState";

describe("static demo fiscal year comparison API", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-23T00:00:00+09:00"));
    window.localStorage.clear();
    resetStaticDemoStore();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns the same all-year comparison contract as the local API", async () => {
    const createFundResponse = await handleStaticDemoRequest("/api/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "翌年度基金",
        fiscalYear: 2027,
        awardedAmount: 2000000,
        notes: "",
        categories: [
          { name: "その他費", amount: 2000000, crossAggregateCategory: "other" },
        ],
      }),
    });
    const { fundId } = (await createFundResponse.json()) as { fundId: number };
    const state = readClonedStaticDemoState();
    const categoryId = state.categories.find((category) => category.fund_id === fundId)?.id;
    expect(categoryId).toBeDefined();

    await handleStaticDemoRequest("/api/planned-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId,
        categoryId,
        plannedDate: "2027-08-01",
        scheduledMonth: "2027-08",
        description: "翌年度予定",
        amount: 300000,
        notes: "",
      }),
    });
    await handleStaticDemoRequest("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId,
        categoryId,
        actualDate: "2027-04-20",
        description: "翌年度実績",
        amount: 50000,
        notes: "",
      }),
    });

    const response = await handleStaticDemoRequest("/api/fiscal-year-comparison", {
      method: "GET",
    });
    const data = (await response.json()) as {
      currentFiscalYear: number;
      fiscalYears: Array<{
        fiscalYear: number;
        state: string;
        totals: { assets: number; committed: number; actual: number };
        crossAggregateCategories: Array<{
          crossAggregateCategory: string;
          plannedAmount: number;
          actualAmount: number;
        }>;
        monthlyStatus: unknown[];
      }>;
    };

    expect(response.ok).toBe(true);
    expect(data.currentFiscalYear).toBe(2026);
    expect(data.fiscalYears.map((year) => year.fiscalYear)).toEqual([2027, 2026, 2025]);
    expect(data.fiscalYears[0]).toMatchObject({
      fiscalYear: 2027,
      state: "future",
      totals: { assets: 4000000, committed: 1450000, actual: 200000 },
    });
    expect(data.fiscalYears[0].crossAggregateCategories).toHaveLength(5);
    expect(data.fiscalYears[0].crossAggregateCategories).toContainEqual({
      crossAggregateCategory: "other",
      plannedAmount: 700000,
      actualAmount: 50000,
    });
    expect(data.fiscalYears[0].monthlyStatus).toHaveLength(12);
  });
});

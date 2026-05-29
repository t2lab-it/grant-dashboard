import { beforeEach, describe, expect, test } from "vitest";
import {
  handleStaticDemoRequest,
  resetStaticDemoStore,
} from "../../src/demo/staticDemoApi";
import { readClonedStaticDemoState } from "../../src/demo/staticDemoStore";

async function readJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("static demo API", () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetStaticDemoStore();
  });

  test("builds overview from demo seed data", async () => {
    const response = await handleStaticDemoRequest("/api/overview", { method: "GET" });
    const data = await readJson(response);

    expect(response.ok).toBe(true);
    expect(data.availableFiscalYears).toEqual([2026]);
    expect(data.selectedFiscalYear).toBe(2026);
    expect(data.totals).toMatchObject({
      assets: 4200000,
      committed: 1455000,
      actual: 1085000,
      freeBalance: 1660000,
    });
    expect(data.crossAggregateCategories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          crossAggregateCategory: "equipment",
          budgetAmount: 1200000,
        }),
      ]),
    );
    expect(data.yearEndRisk).toMatchObject({
      plannedBalance: 1660000,
    });
    expect((data.monthlyStatus as unknown[]).length).toBeGreaterThan(0);
    expect(data.funds).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "デモ研究費A",
        }),
      ]),
    );
    expect(data.latestImport).toMatchObject({
      source_filename: "demo-budget.xlsx",
      warning_count: 0,
      reconciliation_ok: true,
    });
    expect(data.tutorial).toMatchObject({ eligibleDemoData: true });
  });

  test("filters overview by the requested fiscal year", async () => {
    const createResponse = await handleStaticDemoRequest("/api/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "翌年度基金",
        fiscalYear: 2027,
        awardedAmount: 2000000,
        notes: "",
        categories: [{ name: "物品費", amount: 2000000, crossAggregateCategory: "equipment" }],
      }),
    });
    expect(createResponse.ok).toBe(true);
    const fundId = ((await createResponse.json()) as { fundId: number }).fundId;

    const response = await handleStaticDemoRequest("/api/overview?year=2027", { method: "GET" });
    const data = await readJson(response);

    expect(response.ok).toBe(true);
    expect(data.availableFiscalYears).toEqual([2026, 2027]);
    expect(data.selectedFiscalYear).toBe(2027);
    expect(data.totals).toMatchObject({
      assets: 2000000,
      committed: 0,
      actual: 0,
      freeBalance: 2000000,
    });
    expect(data.crossAggregateCategories).toEqual([
      expect.objectContaining({
        crossAggregateCategory: "equipment",
        budgetAmount: 2000000,
      }),
    ]);
    expect((data.funds as Array<{ name: string }>).map((fund) => fund.name)).toEqual(["翌年度基金"]);

    const detail = await readJson(await handleStaticDemoRequest(`/api/funds/${fundId}`, { method: "GET" }));
    expect(detail.categories).toEqual([
      expect.objectContaining({
        categoryName: "物品費",
        crossAggregateCategory: "equipment",
      }),
    ]);
    expect(detail.crossAggregateCategories).toEqual([
      expect.objectContaining({
        crossAggregateCategory: "equipment",
        budgetAmount: 2000000,
      }),
    ]);
  });

  test("persists planned item changes and reflects them in overview", async () => {
    const createResponse = await handleStaticDemoRequest("/api/planned-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 2,
        plannedDate: "2026-10-01",
        scheduledMonth: "2026-10",
        description: "追加出張",
        amount: 50000,
        notes: "静的デモで追加",
      }),
    });

    expect(createResponse.ok).toBe(true);

    const overviewResponse = await handleStaticDemoRequest("/api/overview", { method: "GET" });
    const overview = await readJson(overviewResponse);

    expect(overview.totals).toMatchObject({
      committed: 1505000,
      freeBalance: 1610000,
    });

    const fundResponse = await handleStaticDemoRequest("/api/funds/1", { method: "GET" });
    const fund = await readJson(fundResponse);

    expect(fund.plannedItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "追加出張",
          amount: 50000,
          categoryName: "旅費",
        }),
      ]),
    );
  });

  test("completes and restores partially settled planned items in browser-local demo data", async () => {
    const completeResponse = await handleStaticDemoRequest("/api/planned-items/1/complete", { method: "POST" });

    expect(completeResponse.ok).toBe(true);
    expect(await readJson(completeResponse)).toEqual({ success: true });

    const completedResponse = await handleStaticDemoRequest("/api/funds/1", { method: "GET" });
    const completedFund = await readJson(completedResponse) as {
      plannedItems: Array<{ id: number }>;
      plannedItemHistory: Array<{ id: number; status: string; remainingAmount: number }>;
    };

    expect(completedFund.plannedItems.some((item) => item.id === 1)).toBe(false);
    expect(completedFund.plannedItemHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 1, status: "completed", remainingAmount: 400000 }),
      ]),
    );

    const restoreResponse = await handleStaticDemoRequest("/api/planned-items/1/restore", { method: "POST" });

    expect(restoreResponse.ok).toBe(true);
    const restoredResponse = await handleStaticDemoRequest("/api/funds/1", { method: "GET" });
    const restoredFund = await readJson(restoredResponse) as {
      plannedItems: Array<{ id: number; amount: number }>;
    };

    expect(restoredFund.plannedItems).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 1, amount: 400000 })]),
    );
  });

  test("deletes cancelled planned items from browser-local demo data", async () => {
    const beforeResponse = await handleStaticDemoRequest("/api/funds/1", { method: "GET" });
    const before = await readJson(beforeResponse) as {
      plannedItemHistory: Array<{ id: number; description: string }>;
    };
    const cancelledItem = before.plannedItemHistory.find((item) => item.description.includes("取消"));

    expect(cancelledItem).toBeDefined();

    const deleteResponse = await handleStaticDemoRequest(`/api/planned-items/${cancelledItem?.id}`, {
      method: "DELETE",
    });

    expect(deleteResponse.ok).toBe(true);
    expect(await readJson(deleteResponse)).toEqual({ success: true });

    const afterResponse = await handleStaticDemoRequest("/api/funds/1", { method: "GET" });
    const after = await readJson(afterResponse) as {
      plannedItemHistory: Array<{ id: number; description: string }>;
    };

    expect(after.plannedItemHistory.some((item) => item.id === cancelledItem?.id)).toBe(false);
  });

  test("cancels actual entries without leaving browser-local auxiliary labels", async () => {
    const createLabelledResponse = await handleStaticDemoRequest("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 1,
        actualDate: "2026-10-01",
        description: "取消予定の実績",
        amount: 10000,
        notes: "",
        auxiliaryLabelIds: [3],
      }),
    });
    expect(createLabelledResponse.ok).toBe(true);

    const labelledState = readClonedStaticDemoState();
    const labelledEntry = labelledState.actual_entries.find((entry) => entry.description === "取消予定の実績");
    expect(labelledEntry).toBeDefined();

    const cancelResponse = await handleStaticDemoRequest(`/api/actual-entries/${labelledEntry?.id}/cancel`, {
      method: "POST",
    });
    expect(cancelResponse.ok).toBe(true);
    expect(
      readClonedStaticDemoState().classification_assignments.filter(
        (assignment) => (
          assignment.target_type === "actual_entry" &&
          assignment.target_id === labelledEntry?.id
        ),
      ),
    ).toEqual([]);
  });

  test("serves cross-fund search results from browser-local demo data", async () => {
    const response = await handleStaticDemoRequest("/api/search?year=2026&tab=unsettled", { method: "GET" });
    const data = await readJson(response);

    expect(response.ok).toBe(true);
    expect(data.selectedFiscalYear).toBe(2026);
    expect(data.filters).toMatchObject({
      auxiliaryLabels: [
        { id: 3, kind: "auxiliary", name: "学生支援", color: "#16a34a" },
        { id: 4, kind: "auxiliary", name: "出張", color: "#f59e0b" },
        { id: 5, kind: "auxiliary", name: "要確認", color: "#7c3aed" },
      ],
    });
    expect(data.counts).toMatchObject({ unsettled: 7, unlinked: 0 });
    expect(data.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "planned",
          statusLabel: "未精算 380,000円",
          detailHref: "/funds/4?year=2026&focus=planned-9",
        }),
      ]),
    );
  });

  test("persists classifications and filters search by inherited auxiliary labels", async () => {
    const labelResponse = await handleStaticDemoRequest("/api/classifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "auxiliary", name: "学生支援", color: "#16a34a" }),
    });

    expect(labelResponse.ok).toBe(true);

    const labelId = ((await labelResponse.json()) as { id: number }).id;

    const fundResponse = await handleStaticDemoRequest("/api/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "分類つき予算",
        fiscalYear: 2026,
        awardedAmount: 200000,
        notes: "",
        auxiliaryLabelIds: [labelId],
        categories: [{ name: "旅費", amount: 200000, crossAggregateCategory: "travel" }],
      }),
    });
    expect(fundResponse.ok).toBe(true);
    const fundId = ((await fundResponse.json()) as { fundId: number }).fundId;

    const fundDetail = await readJson(await handleStaticDemoRequest(`/api/funds/${fundId}`, { method: "GET" }));
    expect(fundDetail.fund).toMatchObject({
      auxiliaryLabels: [{ id: labelId, kind: "auxiliary", name: "学生支援", color: "#16a34a" }],
    });

    const categoryId = ((fundDetail.categories as Array<{ id: number }>)[0]).id;
    await handleStaticDemoRequest("/api/planned-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId,
        categoryId,
        plannedDate: "2026-06-01",
        scheduledMonth: "2026-06",
        description: "学生出張",
        amount: 50000,
        notes: "",
        auxiliaryLabelIds: [],
      }),
    });

    const search = await readJson(
      await handleStaticDemoRequest(`/api/search?year=2026&auxiliaryLabelId=${labelId}`, { method: "GET" }),
    );

    expect(search.filters).toMatchObject({
      auxiliaryLabels: expect.arrayContaining([
        { id: labelId, kind: "auxiliary", name: "学生支援", color: "#16a34a" },
      ]),
    });
    expect(search.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "planned",
          description: "学生出張",
          auxiliaryLabels: [
            { id: labelId, kind: "auxiliary", name: "学生支援", color: "#16a34a", inherited: true },
          ],
        }),
      ]),
    );
  });
});

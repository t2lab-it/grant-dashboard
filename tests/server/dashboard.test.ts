import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../server/db/migrate";
import { getOverviewSnapshot, getFundSnapshot } from "../../server/services/dashboard";

describe("dashboard calculations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);

    db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (1, '基盤研究費', 2026, 5080000, 1);
      INSERT INTO categories (id, fund_id, name, cross_aggregate_category, display_order) VALUES
        (1, 1, '物品費', 'equipment', 1),
        (2, 1, '旅費', 'travel', 2),
        (3, 1, '消耗品費', 'equipment', 3);
      INSERT INTO budget_lines (id, fund_id, category_id, amount) VALUES
        (1, 1, 1, 900000),
        (2, 1, 1, 500000),
        (3, 1, 2, 2100000);
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount) VALUES
        (1, 1, 1, '2026-06-01', '2026-06', '計算サーバ購入', 2000000),
        (2, 1, 2, '2026-07-01', '2026-07', '学会旅費', 100000),
        (3, 1, 2, '2026-08-01', '2026-08', '資料印刷', 100),
        (4, 1, 3, '2026-07-02', '2026-07', '研究ノート補充', 5000),
        (5, 1, 1, '2026-07-03', '2026-07', 'GPU増設', 300000),
        (6, 1, 1, '2026-07-04', '2026-07', '予備部品', 20000);
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount) VALUES
        (1, 1, 1, 1, '2026-06-15', '計算サーバ購入', 600000),
        (2, 1, 1, NULL, '2026-04-08', '書籍', 47590),
        (3, 1, 2, 3, '2026-08-10', '資料印刷', 150);
    `);
  });

  it("computes overview totals from normalized records", () => {
    const snapshot = getOverviewSnapshot(db);

    expect(snapshot.availableFiscalYears).toEqual([2026]);
    expect(snapshot.selectedFiscalYear).toBe(2026);
    expect(snapshot.totals.assets).toBe(5080000);
    expect(snapshot.totals.committed).toBe(1825000);
    expect(snapshot.totals.actual).toBe(647740);
    expect(snapshot.totals.freeBalance).toBe(2607260);
    expect(snapshot.linkedActualAmount).toBe(600150);
    expect(snapshot.pendingPlannedCount).toBe(6);
    expect(snapshot.monthlyStatus.map((row) => row.month)).toEqual([
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
    expect(snapshot.monthlyStatus).toContainEqual(
      { month: "2026-05", committed: 0, actual: 0, balance: 5032410 },
    );
    expect(snapshot.monthlyStatus).toContainEqual(
      { month: "2026-08", committed: 0, actual: 150, balance: 2607260 },
    );
    expect(snapshot.monthlyStatus.at(-1)).toEqual(
      { month: "2027-03", committed: 0, actual: 0, balance: 2607260 },
    );
    expect(snapshot.latestImport).toBeNull();
  });

  it("summarizes overview totals by cross aggregate category", () => {
    const snapshot = getOverviewSnapshot(db);

    expect(snapshot.crossAggregateCategories).toEqual([
      {
        crossAggregateCategory: "equipment",
        budgetAmount: 1400000,
        plannedAmount: 1725000,
        actualAmount: 647590,
      },
      {
        crossAggregateCategory: "travel",
        budgetAmount: 2100000,
        plannedAmount: 100000,
        actualAmount: 150,
      },
    ]);
  });

  it("summarizes year-end risks for the selected fiscal year", () => {
    db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (2, '低残高だがリスク外の基金', 2026, 1000000, 2),
        (3, 'マイナス基金', 2026, 1000000, 3),
        (4, '翌年度リスク外', 2027, 1000000, 4);
      INSERT INTO categories (id, fund_id, name, cross_aggregate_category, display_order) VALUES
        (4, 2, '物品費', 'equipment', 1),
        (5, 3, '旅費', 'travel', 1),
        (6, 4, '翌年度', 'other', 1);
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount) VALUES
        (7, 2, 4, '2026-09-01', '2026-09', '低残高だがリスク外の予定', 850000),
        (8, 3, 5, '2026-09-01', '2026-09', '超過予定', 1200000),
        (9, 4, 6, '2027-04-01', '2027-04', '翌年度予定', 1200000);
    `);

    const snapshot = getOverviewSnapshot(db, {
      fiscalYear: 2026,
      today: new Date("2026-08-15T00:00:00+09:00"),
    });

    expect(snapshot.yearEndRisk).toMatchObject({
      plannedBalance: 2557260,
      riskFundCount: 2,
    });
    expect(snapshot.yearEndRisk.risks).toEqual([
      expect.objectContaining({
        fundId: 3,
        fundName: "マイナス基金",
        plannedBalance: -200000,
        overduePlannedAmount: 0,
        riskKinds: ["negative_balance"],
      }),
      expect.objectContaining({
        fundId: 1,
        fundName: "基盤研究費",
        plannedBalance: 2607260,
        overduePlannedAmount: 1825000,
        riskKinds: ["overdue_planned", "excess_balance"],
      }),
    ]);
  });

  it("filters overview totals by the selected fund fiscal year", () => {
    db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (2, '翌年度基金', 2027, 2000000, 2);
      INSERT INTO categories (id, fund_id, name, cross_aggregate_category, display_order) VALUES
        (4, 2, '物品費', 'equipment', 1);
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount) VALUES
        (7, 2, 4, '2027-04-01', '2027-04', '翌年度予定', 300000);
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount) VALUES
        (4, 2, 4, NULL, '2027-05-01', '翌年度実績', 200000);
    `);

    const snapshot = getOverviewSnapshot(db, { fiscalYear: 2027 });

    expect(snapshot.availableFiscalYears).toEqual([2026, 2027]);
    expect(snapshot.selectedFiscalYear).toBe(2027);
    expect(snapshot.totals).toMatchObject({
      assets: 2000000,
      committed: 300000,
      actual: 200000,
      freeBalance: 1500000,
    });
    expect(snapshot.funds.map((fund) => fund.name)).toEqual(["翌年度基金"]);
    expect(snapshot.linkedActualAmount).toBe(0);
    expect(snapshot.pendingPlannedCount).toBe(1);
    expect(snapshot.monthlyStatus.map((row) => row.month)).toEqual([
      "2027-04",
      "2027-05",
      "2027-06",
      "2027-07",
      "2027-08",
      "2027-09",
      "2027-10",
      "2027-11",
      "2027-12",
      "2028-01",
      "2028-02",
      "2028-03",
    ]);
    expect(snapshot.monthlyStatus.slice(0, 2)).toEqual([
      { month: "2027-04", committed: 300000, actual: 0, balance: 1700000 },
      { month: "2027-05", committed: 0, actual: 200000, balance: 1500000 },
    ]);
    expect(snapshot.monthlyStatus.at(-1)).toEqual(
      { month: "2028-03", committed: 0, actual: 0, balance: 1500000 },
    );
  });

  it("adds project tags to overview funds without auxiliary labels", () => {
    db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (2, 'CREST 関連', 2026, 1000, 2),
        (3, 'タグなし', 2026, 2000, 3),
        (4, '翌年度タグ', 2027, 3000, 4);
      INSERT INTO categories (id, fund_id, name, cross_aggregate_category, display_order) VALUES
        (4, 2, '物品費', 'equipment', 1),
        (5, 3, '旅費', 'travel', 1),
        (6, 4, '翌年度', 'other', 1);
      INSERT INTO planned_items (id, fund_id, category_id, planned_date, scheduled_month, description, amount) VALUES
        (7, 2, 4, '2026-05-01', '2026-05', 'CREST 予定', 300),
        (8, 3, 5, '2026-06-01', '2026-06', 'タグなし予定', 400),
        (9, 4, 6, '2027-05-01', '2027-05', '翌年度予定', 500);
      INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount) VALUES
        (4, 2, 4, NULL, '2026-05-10', 'CREST 実績', 100),
        (5, 3, 5, NULL, '2026-06-10', 'タグなし実績', 250),
        (6, 4, 6, NULL, '2027-05-10', '翌年度実績', 600);
      INSERT INTO classification_tags (id, kind, name, color) VALUES
        (1, 'project', 'CREST 量子', '#2563eb'),
        (2, 'project', 'ACT-X 光', '#dc2626'),
        (3, 'auxiliary', '学生支援', '#16a34a');
      INSERT INTO classification_assignments (tag_id, target_type, target_id) VALUES
        (1, 'fund', 1),
        (2, 'fund', 1),
        (3, 'fund', 1),
        (1, 'fund', 2),
        (2, 'fund', 4);
    `);

    const snapshot = getOverviewSnapshot(db, { fiscalYear: 2026 });

    expect(snapshot.funds.map((fund) => ({
      id: fund.id,
      projectTags: fund.projectTags,
    }))).toEqual([
      {
        id: 1,
        projectTags: [
          { id: 1, kind: "project", name: "CREST 量子", color: "#2563eb" },
          { id: 2, kind: "project", name: "ACT-X 光", color: "#dc2626" },
        ],
      },
      {
        id: 2,
        projectTags: [{ id: 1, kind: "project", name: "CREST 量子", color: "#2563eb" }],
      },
      { id: 3, projectTags: [] },
    ]);
  });

  it("falls back to the nearest available fiscal year when the inferred year has no funds", () => {
    db.exec(`
      UPDATE funds SET fiscal_year = 2024 WHERE id = 1;
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (2, '翌年度基金', 2027, 2000000, 2);
    `);

    const snapshot = getOverviewSnapshot(db, {
      today: new Date("2026-05-01T00:00:00+09:00"),
    });

    expect(snapshot.availableFiscalYears).toEqual([2024, 2027]);
    expect(snapshot.selectedFiscalYear).toBe(2027);
    expect(snapshot.funds.map((fund) => fund.name)).toEqual(["翌年度基金"]);
  });

  it("returns the latest import summary when import history exists", () => {
    db.prepare(
      `
        INSERT INTO imports (
          id,
          source_filename,
          imported_at,
          warning_count,
          mapping_summary,
          warnings_json,
          reconciliation_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run([
      1,
      "budget2025.xlsx",
      "2026-04-19T15:00:00.000Z",
      0,
      JSON.stringify({
        mode: "initial",
        counts: {
          funds: 0,
          categories: 0,
          budget_lines: 0,
          planned_items: 0,
          actual_entries: 0,
          warnings: 0,
        },
        warning_count_by_code: {},
      }),
      JSON.stringify([]),
      JSON.stringify({}),
    ]);
    db.prepare(
      `
        INSERT INTO imports (
          id,
          source_filename,
          imported_at,
          warning_count,
          mapping_summary,
          warnings_json,
          reconciliation_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    ).run([
      2,
      "budget2026.xlsx",
      "2026-04-20T15:00:00.000Z",
      2,
      JSON.stringify({
        mode: "replace",
        counts: {
          funds: 1,
          categories: 3,
          budget_lines: 3,
          planned_items: 6,
          actual_entries: 2,
          warnings: 2,
        },
        warning_count_by_code: {
          negative_planned_adjustment: 2,
        },
      }),
      JSON.stringify([]),
      JSON.stringify({
        ok: false,
        workbook_path: "/tmp/budget2026.xlsx",
        db_path: "/tmp/app.db",
        overall: {
          expected: { assets: 100, planned: 20, actual: 10, free_balance: 70 },
          actual: { assets: 101, planned: 20, actual: 10, free_balance: 71 },
        },
        funds: [],
        mismatches: [
          {
            scope: "overall",
            metric: "assets",
            expected: 100,
            actual: 101,
            delta: 1,
          },
        ],
      }),
    ]);

    const snapshot = getOverviewSnapshot(db);

    expect(snapshot.latestImport).toEqual({
      id: 2,
      source_filename: "budget2026.xlsx",
      imported_at: "2026-04-20T15:00:00.000Z",
      warning_count: 2,
      reconciliation_ok: false,
    });
  });

  it("computes fund category variance and monthly totals", () => {
    const fund = getFundSnapshot(db, 1);

    expect(fund.categories).toHaveLength(3);
    expect(fund.categories.map((category) => category.categoryName)).toEqual(["物品費", "旅費", "消耗品費"]);

    expect(fund.plannedItems.map((item) => item.id)).toEqual([1, 5, 6, 2, 4]);
    expect(fund.plannedItems[0]).toMatchObject({
      id: 1,
      categoryName: "物品費",
      description: "計算サーバ購入",
      amount: 1400000,
    });
    expect(fund.actualEntries.map((entry) => entry.id)).toEqual([3, 1, 2]);
    expect(fund.actualEntries[0]).toMatchObject({
      id: 3,
      actualDate: "2026-08-10",
      categoryName: "旅費",
      description: "資料印刷",
      amount: 150,
    });
  });

  it("hides non-planned planned items while preserving linked actual totals", () => {
    db.exec(`
      UPDATE planned_items SET status = 'cancelled' WHERE id = 1;
    `);

    expect(getOverviewSnapshot(db)).toMatchObject({
      linkedActualAmount: 600150,
      pendingPlannedCount: 5,
    });

    const fund = getFundSnapshot(db, 1);

    expect(fund.plannedItems.map((item) => item.id)).not.toContain(1);
  });
});

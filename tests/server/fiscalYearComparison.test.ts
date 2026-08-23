import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../server/db/migrate";
import { getFiscalYearComparisonSnapshot } from "../../server/services/fiscalYearComparison";

describe("fiscal year comparison calculations", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);
  });

  it("aggregates past, current, and future fiscal years in descending order", () => {
    db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (1, '過年度基金', 2025, 900000, 1),
        (2, '進行年度基金', 2026, 1000000, 2),
        (3, '未来年度基金', 2027, 800000, 3);
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES
        (1, 1, 'past-equipment', '過年度物品費', 'equipment', 1),
        (2, 2, 'current-equipment', '進行年度物品費', 'equipment', 1),
        (3, 2, 'current-travel', '進行年度旅費', 'travel', 2),
        (4, 3, 'future-other', '未来年度その他', 'other', 1);
      INSERT INTO planned_items
        (id, fund_id, category_id, planned_date, scheduled_month, description, amount, status)
      VALUES
        (1, 1, 1, '2025-05-01', '2025-05', '過年度の未消化予定', 100000, 'planned'),
        (2, 2, 2, '2026-06-01', '2026-06', '一部精算済み予定', 400000, 'planned'),
        (3, 2, 3, '2026-09-01', '2026-09', '完了済み予定', 200000, 'completed'),
        (4, 3, 4, '2027-08-01', '2027-08', '未来年度予定', 300000, 'planned');
      INSERT INTO actual_entries
        (id, fund_id, category_id, planned_item_id, actual_date, description, amount)
      VALUES
        (1, 1, 1, NULL, '2025-04-10', '過年度実績', 700000),
        (2, 2, 2, 2, '2026-06-15', '予定に紐づく実績', 150000),
        (3, 2, 3, NULL, '2026-04-20', '独立した実績', 150000),
        (4, 3, 4, NULL, '2027-04-20', '未来年度実績', 50000);
    `);

    const snapshot = getFiscalYearComparisonSnapshot(db, {
      today: new Date("2026-08-15T00:00:00+09:00"),
    });

    expect(snapshot.currentFiscalYear).toBe(2026);
    expect(snapshot.fiscalYears.map((year) => [year.fiscalYear, year.state])).toEqual([
      [2027, "future"],
      [2026, "current"],
      [2025, "past"],
    ]);
    expect(snapshot.fiscalYears.map((year) => year.totals)).toEqual([
      { assets: 800000, committed: 300000, actual: 50000 },
      { assets: 1000000, committed: 250000, actual: 300000 },
      { assets: 900000, committed: 100000, actual: 700000 },
    ]);

    const current = snapshot.fiscalYears[1];
    expect(current.crossAggregateCategories).toEqual([
      { crossAggregateCategory: "equipment", plannedAmount: 250000, actualAmount: 150000 },
      { crossAggregateCategory: "travel", plannedAmount: 0, actualAmount: 150000 },
      { crossAggregateCategory: "personnel", plannedAmount: 0, actualAmount: 0 },
      { crossAggregateCategory: "other", plannedAmount: 0, actualAmount: 0 },
      { crossAggregateCategory: "unset", plannedAmount: 0, actualAmount: 0 },
    ]);
    expect(current.monthlyStatus).toHaveLength(12);
    expect(current.monthlyStatus.map((row) => row.month)).toEqual([
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
    expect(current.monthlyStatus[0]).toEqual({ month: "2026-04", committed: 0, actual: 150000 });
    expect(current.monthlyStatus[2]).toEqual({ month: "2026-06", committed: 250000, actual: 150000 });
    expect(current.monthlyStatus.at(-1)).toEqual({ month: "2027-03", committed: 0, actual: 0 });
  });

  it("uses Tokyo time to classify the current fiscal year", () => {
    db.exec(`
      INSERT INTO funds (id, name, fiscal_year, awarded_amount, display_order) VALUES
        (1, '年度境界', 2027, 0, 1);
    `);

    const snapshot = getFiscalYearComparisonSnapshot(db, {
      today: new Date("2027-03-31T15:30:00.000Z"),
    });

    expect(snapshot.currentFiscalYear).toBe(2027);
    expect(snapshot.fiscalYears[0].state).toBe("current");
  });

  it("returns an empty fiscal year list when no funds are registered", () => {
    expect(
      getFiscalYearComparisonSnapshot(db, {
        today: new Date("2026-08-15T00:00:00+09:00"),
      }),
    ).toEqual({
      currentFiscalYear: 2026,
      fiscalYears: [],
    });
  });
});

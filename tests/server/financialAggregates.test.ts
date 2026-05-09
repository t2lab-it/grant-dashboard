import { beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { runMigrations } from "../../server/db/migrate";
import {
  getLinkedActualAmount,
  getPendingPlannedCount,
  listFundAggregateRows,
  listFundCategoryAggregateRows,
  listFundCrossAggregateCategoryRows,
  listFundMonthlyAggregateRows,
  listFundRemainingPlannedItemRows,
  listOverviewMonthlyAggregateRows,
  toFreeBalance,
} from "../../server/services/financialAggregates";

describe("financial aggregate read models", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(":memory:");
    runMigrations(db);

    db.exec(`
      INSERT INTO funds (id, fund_code, name, fiscal_year, awarded_amount, display_order) VALUES
        (1, 'SCI', 'Science', 2026, 1000000, 1),
        (2, 'OPS', 'Operations', 2026, 500000, 2);
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES
        (1, 1, 'TRAVEL', 'Travel', 'travel', 1),
        (2, 1, 'EQUIP', 'Equipment', 'equipment', 2),
        (3, 2, 'OPS-1', 'Ops Category', 'other', 1);
      INSERT INTO budget_lines (id, fund_id, category_id, amount) VALUES
        (1, 1, 1, 300000),
        (2, 1, 2, 400000),
        (3, 2, 3, 100000);
      INSERT INTO planned_items (
        id,
        fund_id,
        category_id,
        planned_date,
        scheduled_month,
        description,
        amount,
        status,
        notes
      ) VALUES
        (1, 1, 1, '2026-05-01', '2026-05', 'Flight', 200000, 'planned', ''),
        (2, 1, 2, '2026-06-10', '2026-06', 'Microscope', 100000, 'planned', ''),
        (3, 1, 2, '2026-06-20', '2026-06', 'Cable', 50000, 'cancelled', ''),
        (4, 2, 3, '2026-07-01', '2026-07', 'Hosting', 80000, 'planned', '');
      INSERT INTO actual_entries (
        id,
        fund_id,
        category_id,
        planned_item_id,
        actual_date,
        description,
        amount,
        notes
      ) VALUES
        (1, 1, 1, 1, '2026-05-15', 'Flight deposit', 50000, ''),
        (2, 1, 2, 2, '2026-06-25', 'Microscope payment', 100000, ''),
        (3, 1, 2, NULL, '2026-04-01', 'Unlinked purchase', 30000, ''),
        (4, 2, 3, NULL, '2026-07-02', 'Ops expense', 20000, '');
    `);
  });

  it("keeps remaining planned amounts consistent across all shared readers", () => {
    expect(listFundAggregateRows(db)).toEqual([
      {
        id: 1,
        fund_code: "SCI",
        name: "Science",
        awarded_amount: 1000000,
        committed_amount: 150000,
        actual_amount: 180000,
      },
      {
        id: 2,
        fund_code: "OPS",
        name: "Operations",
        awarded_amount: 500000,
        committed_amount: 80000,
        actual_amount: 20000,
      },
    ]);

    expect(listFundCategoryAggregateRows(db, 1)).toEqual([
      {
        id: 1,
        categoryName: "Travel",
        crossAggregateCategory: "travel",
        budgetAmount: 300000,
        plannedAmount: 150000,
        actualAmount: 50000,
      },
      {
        id: 2,
        categoryName: "Equipment",
        crossAggregateCategory: "equipment",
        budgetAmount: 400000,
        plannedAmount: 0,
        actualAmount: 130000,
      },
    ]);

    expect(listFundMonthlyAggregateRows(db, 1)).toEqual([
      { month: "2026-04", plannedAmount: 0, actualAmount: 30000, totalAmount: 30000 },
      { month: "2026-05", plannedAmount: 150000, actualAmount: 50000, totalAmount: 200000 },
      { month: "2026-06", plannedAmount: 0, actualAmount: 100000, totalAmount: 100000 },
    ]);

    expect(listFundRemainingPlannedItemRows(db, 1).map(({ id, amount }) => ({ id, amount }))).toEqual([
      { id: 1, amount: 150000 },
    ]);
  });

  it("groups fund totals by cross aggregate category", () => {
    expect(listFundCrossAggregateCategoryRows(db, 1)).toEqual([
      {
        crossAggregateCategory: "travel",
        budgetAmount: 300000,
        plannedAmount: 150000,
        actualAmount: 50000,
      },
      {
        crossAggregateCategory: "equipment",
        budgetAmount: 400000,
        plannedAmount: 0,
        actualAmount: 130000,
      },
    ]);
  });

  it("reports overview helper totals and canonical free balance from the same semantics", () => {
    expect(getLinkedActualAmount(db)).toBe(150000);
    expect(getPendingPlannedCount(db)).toBe(3);
    expect(listOverviewMonthlyAggregateRows(db)).toEqual([
      { month: "2026-04", committed: 0, actual: 30000 },
      { month: "2026-05", committed: 150000, actual: 50000 },
      { month: "2026-06", committed: 0, actual: 100000 },
      { month: "2026-07", committed: 80000, actual: 20000 },
    ]);
    expect(toFreeBalance(1500000, 230000, 200000)).toBe(1070000);
  });
});

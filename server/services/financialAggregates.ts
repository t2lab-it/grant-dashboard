import type Database from "better-sqlite3";
import type { CrossAggregateCategory } from "../../src/contracts/crossAggregateCategory";

export type FundAggregateRow = {
  id: number;
  fund_code: string;
  name: string;
  awarded_amount: number;
  committed_amount: number;
  actual_amount: number;
};

export type FundCategoryAggregateRow = {
  id: number;
  categoryName: string;
  crossAggregateCategory: CrossAggregateCategory;
  budgetAmount: number | null;
  plannedAmount: number;
  actualAmount: number;
};

export type FundCrossAggregateCategoryRow = {
  crossAggregateCategory: CrossAggregateCategory;
  budgetAmount: number | null;
  plannedAmount: number;
  actualAmount: number;
};

export type OverviewCrossAggregateCategoryRow = FundCrossAggregateCategoryRow;

export type OverviewMonthlyAggregateRow = {
  month: string;
  committed: number;
  actual: number;
};

export type FundOverduePlannedAmountRow = {
  fundId: number;
  overduePlannedAmount: number;
};

export type FundMonthlyAggregateRow = {
  month: string;
  plannedAmount: number;
  actualAmount: number;
  totalAmount: number;
};

export type FundRemainingPlannedItemRow = {
  id: number;
  plannedDate: string;
  scheduledMonth: string;
  categoryId: number;
  categoryName: string;
  description: string;
  amount: number;
  notes: string;
};

const LINKED_ACTUALS_CTE = `
  linked_actuals AS (
    SELECT planned_item_id, SUM(amount) AS linked_amount, COUNT(*) AS linked_count
    FROM actual_entries
    WHERE planned_item_id IS NOT NULL
    GROUP BY planned_item_id
  )
`;

const REMAINING_PLANNED_AMOUNT_SQL = `
  CASE
    WHEN p.amount - COALESCE(la.linked_amount, 0) > 0 THEN p.amount - COALESCE(la.linked_amount, 0)
    ELSE 0
  END
`;

export function toFreeBalance(assets: number, committed: number, actual: number) {
  return assets - committed - actual;
}

export function getLinkedActualAmount(db: Database.Database, fiscalYear?: number) {
  const fiscalYearFilter = fiscalYear === undefined ? "" : "INNER JOIN funds f ON f.id = actual_entries.fund_id WHERE f.fiscal_year = ?";
  const parameters = fiscalYear === undefined ? [] : [fiscalYear];
  const row = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS amount
      FROM actual_entries
      ${fiscalYearFilter}
      ${fiscalYear === undefined ? "WHERE" : "AND"} planned_item_id IS NOT NULL
      `,
    )
    .get(...parameters) as { amount: number };

  return row.amount;
}

export function getPendingPlannedCount(db: Database.Database, fiscalYear?: number) {
  const fiscalYearFilter = fiscalYear === undefined ? "" : "INNER JOIN funds f ON f.id = planned_items.fund_id";
  const whereClause = fiscalYear === undefined
    ? "WHERE status = 'planned'"
    : "WHERE status = 'planned' AND f.fiscal_year = ?";
  const parameters = fiscalYear === undefined ? [] : [fiscalYear];
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM planned_items
      ${fiscalYearFilter}
      ${whereClause}
      `,
    )
    .get(...parameters) as { count: number };

  return row.count;
}

export function listFundAggregateRows(db: Database.Database, fiscalYear?: number): FundAggregateRow[] {
  const whereClause = fiscalYear === undefined ? "" : "WHERE f.fiscal_year = ?";
  const parameters = fiscalYear === undefined ? [] : [fiscalYear];
  return db
    .prepare(
      `
      WITH
      ${LINKED_ACTUALS_CTE},
      fund_commitments AS (
        SELECT
          p.fund_id,
          SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS committed_amount
        FROM planned_items p
        LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
        WHERE p.status = 'planned'
        GROUP BY p.fund_id
      ),
      fund_actuals AS (
        SELECT fund_id, SUM(amount) AS actual_amount
        FROM actual_entries
        GROUP BY fund_id
      )
      SELECT
        f.id,
        f.fund_code,
        f.name,
        f.awarded_amount,
        COALESCE(fc.committed_amount, 0) AS committed_amount,
        COALESCE(fa.actual_amount, 0) AS actual_amount
      FROM funds f
      LEFT JOIN fund_commitments fc ON fc.fund_id = f.id
      LEFT JOIN fund_actuals fa ON fa.fund_id = f.id
      ${whereClause}
      ORDER BY f.display_order, f.id
      `,
    )
    .all(...parameters) as FundAggregateRow[];
}

export function listFundCategoryAggregateRows(
  db: Database.Database,
  fundId: number,
): FundCategoryAggregateRow[] {
  return db
    .prepare(
      `
      WITH
      ${LINKED_ACTUALS_CTE},
      category_budgets AS (
        SELECT category_id, SUM(amount) AS budget_amount
        FROM budget_lines
        GROUP BY category_id
      ),
      category_commitments AS (
        SELECT
          p.category_id,
          SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS planned_amount
        FROM planned_items p
        LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
        WHERE p.fund_id = ? AND p.status = 'planned'
        GROUP BY p.category_id
      ),
      category_actuals AS (
        SELECT category_id, SUM(amount) AS actual_amount
        FROM actual_entries
        WHERE fund_id = ?
        GROUP BY category_id
      )
      SELECT
        c.id,
        c.name AS categoryName,
        c.cross_aggregate_category AS crossAggregateCategory,
        cb.budget_amount AS budgetAmount,
        COALESCE(cc.planned_amount, 0) AS plannedAmount,
        COALESCE(ca.actual_amount, 0) AS actualAmount
      FROM categories c
      LEFT JOIN category_budgets cb ON cb.category_id = c.id
      LEFT JOIN category_commitments cc ON cc.category_id = c.id
      LEFT JOIN category_actuals ca ON ca.category_id = c.id
      WHERE c.fund_id = ?
      ORDER BY c.display_order, c.id
      `,
    )
    .all(fundId, fundId, fundId) as FundCategoryAggregateRow[];
}

export function listFundCrossAggregateCategoryRows(
  db: Database.Database,
  fundId: number,
): FundCrossAggregateCategoryRow[] {
  return db
    .prepare(
      `
      WITH
      ${LINKED_ACTUALS_CTE},
      category_budgets AS (
        SELECT category_id, SUM(amount) AS budget_amount
        FROM budget_lines
        GROUP BY category_id
      ),
      category_commitments AS (
        SELECT
          p.category_id,
          SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS planned_amount
        FROM planned_items p
        LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
        WHERE p.fund_id = ? AND p.status = 'planned'
        GROUP BY p.category_id
      ),
      category_actuals AS (
        SELECT category_id, SUM(amount) AS actual_amount
        FROM actual_entries
        WHERE fund_id = ?
        GROUP BY category_id
      )
      SELECT
        c.cross_aggregate_category AS crossAggregateCategory,
        SUM(cb.budget_amount) AS budgetAmount,
        COALESCE(SUM(cc.planned_amount), 0) AS plannedAmount,
        COALESCE(SUM(ca.actual_amount), 0) AS actualAmount
      FROM categories c
      LEFT JOIN category_budgets cb ON cb.category_id = c.id
      LEFT JOIN category_commitments cc ON cc.category_id = c.id
      LEFT JOIN category_actuals ca ON ca.category_id = c.id
      WHERE c.fund_id = ?
      GROUP BY c.cross_aggregate_category
      ORDER BY MIN(c.display_order), MIN(c.id)
      `,
    )
    .all(fundId, fundId, fundId) as FundCrossAggregateCategoryRow[];
}

export function listOverviewCrossAggregateCategoryRows(
  db: Database.Database,
  fiscalYear?: number,
): OverviewCrossAggregateCategoryRow[] {
  const fundFilter = fiscalYear === undefined ? "" : "AND f.fiscal_year = ?";
  const parameters = fiscalYear === undefined ? [] : [fiscalYear, fiscalYear, fiscalYear, fiscalYear];

  return db
    .prepare(
      `
      WITH
      ${LINKED_ACTUALS_CTE},
      category_budgets AS (
        SELECT bl.category_id, SUM(bl.amount) AS budget_amount
        FROM budget_lines bl
        INNER JOIN funds f ON f.id = bl.fund_id
        WHERE 1 = 1
        ${fundFilter}
        GROUP BY bl.category_id
      ),
      category_commitments AS (
        SELECT
          p.category_id,
          SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS planned_amount
        FROM planned_items p
        INNER JOIN funds f ON f.id = p.fund_id
        LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
        WHERE p.status = 'planned'
        ${fundFilter}
        GROUP BY p.category_id
      ),
      category_actuals AS (
        SELECT ae.category_id, SUM(ae.amount) AS actual_amount
        FROM actual_entries ae
        INNER JOIN funds f ON f.id = ae.fund_id
        WHERE 1 = 1
        ${fundFilter}
        GROUP BY ae.category_id
      )
      SELECT
        c.cross_aggregate_category AS crossAggregateCategory,
        SUM(cb.budget_amount) AS budgetAmount,
        COALESCE(SUM(cc.planned_amount), 0) AS plannedAmount,
        COALESCE(SUM(ca.actual_amount), 0) AS actualAmount
      FROM categories c
      INNER JOIN funds f ON f.id = c.fund_id
      LEFT JOIN category_budgets cb ON cb.category_id = c.id
      LEFT JOIN category_commitments cc ON cc.category_id = c.id
      LEFT JOIN category_actuals ca ON ca.category_id = c.id
      WHERE 1 = 1
      ${fundFilter}
      GROUP BY c.cross_aggregate_category
      ORDER BY MIN(c.display_order), MIN(c.id)
      `,
    )
    .all(...parameters) as OverviewCrossAggregateCategoryRow[];
}

export function listOverviewMonthlyAggregateRows(
  db: Database.Database,
  fiscalYear?: number,
): OverviewMonthlyAggregateRow[] {
  const plannedFiscalYearFilter = fiscalYear === undefined ? "" : "AND f.fiscal_year = ?";
  const actualFiscalYearFilter = fiscalYear === undefined ? "" : "WHERE f.fiscal_year = ?";
  const parameters = fiscalYear === undefined ? [] : [fiscalYear, fiscalYear];
  return db
    .prepare(
      `
      WITH
      ${LINKED_ACTUALS_CTE},
      planned_by_month AS (
        SELECT
          p.scheduled_month AS month,
          SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS committed
        FROM planned_items p
        INNER JOIN funds f ON f.id = p.fund_id
        LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
        WHERE p.status = 'planned'
        ${plannedFiscalYearFilter}
        GROUP BY p.scheduled_month
      ),
      actual_by_month AS (
        SELECT
          SUBSTR(actual_date, 1, 7) AS month,
          SUM(amount) AS actual
        FROM actual_entries
        INNER JOIN funds f ON f.id = actual_entries.fund_id
        ${actualFiscalYearFilter}
        GROUP BY SUBSTR(actual_date, 1, 7)
      ),
      months AS (
        SELECT month FROM planned_by_month
        UNION
        SELECT month FROM actual_by_month
      )
      SELECT
        m.month,
        COALESCE(pbm.committed, 0) AS committed,
        COALESCE(abm.actual, 0) AS actual
      FROM months m
      LEFT JOIN planned_by_month pbm ON pbm.month = m.month
      LEFT JOIN actual_by_month abm ON abm.month = m.month
      ORDER BY m.month
      `,
    )
    .all(...parameters) as OverviewMonthlyAggregateRow[];
}

export function listFundOverduePlannedAmountRows(
  db: Database.Database,
  fiscalYear: number,
  currentMonth: string,
): FundOverduePlannedAmountRow[] {
  return db
    .prepare(
      `
      WITH ${LINKED_ACTUALS_CTE}
      SELECT
        p.fund_id AS fundId,
        SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS overduePlannedAmount
      FROM planned_items p
      INNER JOIN funds f ON f.id = p.fund_id
      LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
      WHERE p.status = 'planned'
        AND f.fiscal_year = ?
        AND p.scheduled_month < ?
        AND ${REMAINING_PLANNED_AMOUNT_SQL} > 0
      GROUP BY p.fund_id
      `,
    )
    .all(fiscalYear, currentMonth) as FundOverduePlannedAmountRow[];
}

export function listFundMonthlyAggregateRows(
  db: Database.Database,
  fundId: number,
): FundMonthlyAggregateRow[] {
  return db
    .prepare(
      `
      WITH
      ${LINKED_ACTUALS_CTE},
      planned_by_month AS (
        SELECT
          p.scheduled_month AS month,
          SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS plannedAmount
        FROM planned_items p
        LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
        WHERE p.fund_id = ? AND p.status = 'planned'
        GROUP BY p.scheduled_month
      ),
      actual_by_month AS (
        SELECT
          SUBSTR(actual_date, 1, 7) AS month,
          SUM(amount) AS actualAmount
        FROM actual_entries
        WHERE fund_id = ?
        GROUP BY SUBSTR(actual_date, 1, 7)
      ),
      months AS (
        SELECT month FROM planned_by_month
        UNION
        SELECT month FROM actual_by_month
      )
      SELECT
        m.month,
        COALESCE(pbm.plannedAmount, 0) AS plannedAmount,
        COALESCE(abm.actualAmount, 0) AS actualAmount,
        COALESCE(pbm.plannedAmount, 0) + COALESCE(abm.actualAmount, 0) AS totalAmount
      FROM months m
      LEFT JOIN planned_by_month pbm ON pbm.month = m.month
      LEFT JOIN actual_by_month abm ON abm.month = m.month
      ORDER BY m.month
      `,
    )
    .all(fundId, fundId) as FundMonthlyAggregateRow[];
}

export function listFundRemainingPlannedItemRows(
  db: Database.Database,
  fundId: number,
): FundRemainingPlannedItemRow[] {
  return db
    .prepare(
      `
      WITH ${LINKED_ACTUALS_CTE}
      SELECT
        p.id,
        p.planned_date AS plannedDate,
        p.scheduled_month AS scheduledMonth,
        p.category_id AS categoryId,
        c.name AS categoryName,
        p.description,
        ${REMAINING_PLANNED_AMOUNT_SQL} AS amount,
        p.notes
      FROM planned_items p
      INNER JOIN categories c ON c.id = p.category_id
      LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
      WHERE p.fund_id = ? AND p.status = 'planned' AND ${REMAINING_PLANNED_AMOUNT_SQL} > 0
      ORDER BY p.scheduled_month, c.display_order, c.id, p.id
      `,
    )
    .all(fundId) as FundRemainingPlannedItemRow[];
}

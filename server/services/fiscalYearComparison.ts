import type Database from "better-sqlite3";
import {
  CROSS_AGGREGATE_CATEGORY_CODES,
  type CrossAggregateCategory,
} from "../../src/contracts/crossAggregateCategory";
import type {
  FiscalYearComparisonResponse,
  FiscalYearState,
} from "../../src/contracts/fiscalYearComparison";
import { inferJapaneseFiscalYear, listFiscalYearMonths } from "../../src/lib/calendar";
import { LINKED_ACTUALS_CTE, REMAINING_PLANNED_AMOUNT_SQL } from "./financialAggregates";

type FiscalYearAggregateRow = {
  fiscalYear: number;
  assets: number;
  committed: number;
  actual: number;
};

type FiscalYearFundRow = {
  id: number;
  fiscalYear: number;
  name: string;
  awardedAmount: number;
  displayOrder: number;
};

type FiscalYearCategoryRow = {
  fiscalYear: number;
  crossAggregateCategory: CrossAggregateCategory;
  plannedAmount: number;
  actualAmount: number;
};

type FiscalYearMonthlyRow = {
  fiscalYear: number;
  month: string;
  committed: number;
  actual: number;
};

export function listFiscalYearComparisonAggregateRows(db: Database.Database): FiscalYearAggregateRow[] {
  return db.prepare(`
    WITH
    ${LINKED_ACTUALS_CTE},
    fund_commitments AS (
      SELECT p.fund_id, SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS committed
      FROM planned_items p
      LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
      WHERE p.status = 'planned'
      GROUP BY p.fund_id
    ),
    fund_actuals AS (
      SELECT fund_id, SUM(amount) AS actual
      FROM actual_entries
      GROUP BY fund_id
    )
    SELECT
      f.fiscal_year AS fiscalYear,
      SUM(f.awarded_amount) AS assets,
      SUM(COALESCE(fc.committed, 0)) AS committed,
      SUM(COALESCE(fa.actual, 0)) AS actual
    FROM funds f
    LEFT JOIN fund_commitments fc ON fc.fund_id = f.id
    LEFT JOIN fund_actuals fa ON fa.fund_id = f.id
    GROUP BY f.fiscal_year
    ORDER BY f.fiscal_year DESC
  `).all() as FiscalYearAggregateRow[];
}

export function listFiscalYearComparisonFundRows(db: Database.Database): FiscalYearFundRow[] {
  return db.prepare(`
    SELECT
      id,
      fiscal_year AS fiscalYear,
      name,
      awarded_amount AS awardedAmount,
      display_order AS displayOrder
    FROM funds
    ORDER BY fiscal_year DESC, display_order, id
  `).all() as FiscalYearFundRow[];
}

export function listFiscalYearComparisonCategoryRows(db: Database.Database): FiscalYearCategoryRow[] {
  return db.prepare(`
    WITH
    ${LINKED_ACTUALS_CTE},
    category_commitments AS (
      SELECT p.category_id, SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS plannedAmount
      FROM planned_items p
      LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
      WHERE p.status = 'planned'
      GROUP BY p.category_id
    ),
    category_actuals AS (
      SELECT category_id, SUM(amount) AS actualAmount
      FROM actual_entries
      GROUP BY category_id
    )
    SELECT
      f.fiscal_year AS fiscalYear,
      c.cross_aggregate_category AS crossAggregateCategory,
      SUM(COALESCE(cc.plannedAmount, 0)) AS plannedAmount,
      SUM(COALESCE(ca.actualAmount, 0)) AS actualAmount
    FROM categories c
    INNER JOIN funds f ON f.id = c.fund_id
    LEFT JOIN category_commitments cc ON cc.category_id = c.id
    LEFT JOIN category_actuals ca ON ca.category_id = c.id
    GROUP BY f.fiscal_year, c.cross_aggregate_category
    ORDER BY f.fiscal_year DESC
  `).all() as FiscalYearCategoryRow[];
}

export function listFiscalYearComparisonMonthlyRows(db: Database.Database): FiscalYearMonthlyRow[] {
  return db.prepare(`
    WITH
    ${LINKED_ACTUALS_CTE},
    planned_by_month AS (
      SELECT
        f.fiscal_year AS fiscalYear,
        p.scheduled_month AS month,
        SUM(${REMAINING_PLANNED_AMOUNT_SQL}) AS committed,
        0 AS actual
      FROM planned_items p
      INNER JOIN funds f ON f.id = p.fund_id
      LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
      WHERE p.status = 'planned'
      GROUP BY f.fiscal_year, p.scheduled_month
    ),
    actual_by_month AS (
      SELECT
        f.fiscal_year AS fiscalYear,
        SUBSTR(ae.actual_date, 1, 7) AS month,
        0 AS committed,
        SUM(ae.amount) AS actual
      FROM actual_entries ae
      INNER JOIN funds f ON f.id = ae.fund_id
      GROUP BY f.fiscal_year, SUBSTR(ae.actual_date, 1, 7)
    ),
    monthly_rows AS (
      SELECT * FROM planned_by_month
      UNION ALL
      SELECT * FROM actual_by_month
    )
    SELECT fiscalYear, month, SUM(committed) AS committed, SUM(actual) AS actual
    FROM monthly_rows
    GROUP BY fiscalYear, month
    ORDER BY fiscalYear DESC, month
  `).all() as FiscalYearMonthlyRow[];
}

function getFiscalYearState(fiscalYear: number, currentFiscalYear: number): FiscalYearState {
  if (fiscalYear < currentFiscalYear) return "past";
  if (fiscalYear > currentFiscalYear) return "future";
  return "current";
}

export function getFiscalYearComparisonSnapshot(
  db: Database.Database,
  options: { today?: Date } = {},
): FiscalYearComparisonResponse {
  const currentFiscalYear = inferJapaneseFiscalYear(options.today ?? new Date());
  const aggregateRows = listFiscalYearComparisonAggregateRows(db);
  const fundRows = listFiscalYearComparisonFundRows(db);
  const categoryRows = listFiscalYearComparisonCategoryRows(db);
  const monthlyRows = listFiscalYearComparisonMonthlyRows(db);
  const fundRowsByYear = new Map<number, FiscalYearFundRow[]>();
  const categoryRowsByYear = new Map<number, Map<CrossAggregateCategory, FiscalYearCategoryRow>>();
  const monthlyRowsByYear = new Map<number, Map<string, FiscalYearMonthlyRow>>();

  for (const row of fundRows) {
    const rows = fundRowsByYear.get(row.fiscalYear) ?? [];
    rows.push(row);
    fundRowsByYear.set(row.fiscalYear, rows);
  }
  for (const row of categoryRows) {
    const rows = categoryRowsByYear.get(row.fiscalYear) ?? new Map();
    rows.set(row.crossAggregateCategory, row);
    categoryRowsByYear.set(row.fiscalYear, rows);
  }
  for (const row of monthlyRows) {
    const rows = monthlyRowsByYear.get(row.fiscalYear) ?? new Map();
    rows.set(row.month, row);
    monthlyRowsByYear.set(row.fiscalYear, rows);
  }

  return {
    currentFiscalYear,
    fiscalYears: aggregateRows.map((row) => ({
      fiscalYear: row.fiscalYear,
      state: getFiscalYearState(row.fiscalYear, currentFiscalYear),
      totals: { assets: row.assets, committed: row.committed, actual: row.actual },
      funds: (fundRowsByYear.get(row.fiscalYear) ?? []).map((fund) => ({
        id: fund.id,
        name: fund.name,
        awardedAmount: fund.awardedAmount,
        displayOrder: fund.displayOrder,
      })),
      crossAggregateCategories: CROSS_AGGREGATE_CATEGORY_CODES.map((crossAggregateCategory) => {
        const category = categoryRowsByYear.get(row.fiscalYear)?.get(crossAggregateCategory);
        return {
          crossAggregateCategory,
          plannedAmount: category?.plannedAmount ?? 0,
          actualAmount: category?.actualAmount ?? 0,
        };
      }),
      monthlyStatus: listFiscalYearMonths(row.fiscalYear).map((month) => {
        const monthly = monthlyRowsByYear.get(row.fiscalYear)?.get(month);
        return { month, committed: monthly?.committed ?? 0, actual: monthly?.actual ?? 0 };
      }),
    })),
  };
}

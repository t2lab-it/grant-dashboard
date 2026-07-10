import type Database from "better-sqlite3";
import { createRequire } from "node:module";
import {
  CROSS_AGGREGATE_CATEGORY_LABELS,
  type CrossAggregateCategory,
} from "../../src/contracts/crossAggregateCategory";
import { inferJapaneseFiscalYear, listFiscalYearMonths } from "../../src/lib/calendar";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

const SHEET_NAMES = ["概要", "予算別サマリ", "費目別サマリ", "月別推移", "計画明細", "実績明細"] as const;
const AMOUNT_FORMAT = "#,##0";
const RATE_FORMAT = "0.0%";

type CellValue = string | number | null;

type FundSummaryRow = {
  fundId: number;
  fundCode: string | null;
  fundName: string;
  fiscalYear: number;
  awardedAmount: number;
  plannedAmount: number;
  actualAmount: number;
};

type CategorySummaryRow = {
  fundId: number;
  fundCode: string | null;
  fundName: string;
  categoryId: number;
  categoryCode: string | null;
  categoryName: string;
  crossAggregateCategory: CrossAggregateCategory;
  budgetAmount: number | null;
  plannedAmount: number;
  actualAmount: number;
};

type MonthlyTrendRow = {
  month: string;
  plannedAmount: number;
  actualAmount: number;
};

type PlannedDetailRow = {
  plannedRef: string | null;
  fundId: number;
  fundCode: string | null;
  fundName: string;
  categoryId: number;
  categoryCode: string | null;
  categoryName: string;
  crossAggregateCategory: CrossAggregateCategory;
  plannedDate: string;
  scheduledMonth: string;
  description: string;
  plannedAmount: number;
  remainingPlannedAmount: number;
  status: string;
  notes: string;
};

type ActualDetailRow = {
  fundId: number;
  fundCode: string | null;
  fundName: string;
  categoryId: number;
  categoryCode: string | null;
  categoryName: string;
  crossAggregateCategory: CrossAggregateCategory;
  actualDate: string;
  description: string;
  amount: number;
  plannedRef: string | null;
  notes: string;
};

type LatestImportWarningRow = {
  warningCount: number;
};

export class LedgerWorkbookError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

export type LedgerWorkbookOptions = {
  fiscalYear?: number;
  fundId?: number;
  exportedAt?: Date;
};

function resolveFiscalYear(db: Database.Database, options: LedgerWorkbookOptions) {
  if (options.fiscalYear !== undefined) {
    return options.fiscalYear;
  }

  const rows = db
    .prepare("SELECT DISTINCT fiscal_year AS fiscalYear FROM funds ORDER BY fiscal_year")
    .all() as Array<{ fiscalYear: number }>;
  if (rows.length === 0) {
    return inferJapaneseFiscalYear(options.exportedAt ?? new Date());
  }

  const inferred = inferJapaneseFiscalYear(options.exportedAt ?? new Date());
  const fiscalYears = rows.map((row) => row.fiscalYear);
  if (fiscalYears.includes(inferred)) {
    return inferred;
  }

  return fiscalYears.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(nearest - inferred);
    const candidateDistance = Math.abs(candidate - inferred);
    if (candidateDistance < nearestDistance) {
      return candidate;
    }
    if (candidateDistance === nearestDistance && candidate > nearest) {
      return candidate;
    }
    return nearest;
  });
}

function assertFundMatchesFiscalYear(db: Database.Database, fiscalYear: number, fundId: number | undefined) {
  if (fundId === undefined) {
    return;
  }

  const fund = db
    .prepare("SELECT fiscal_year AS fiscalYear FROM funds WHERE id = ?")
    .get(fundId) as { fiscalYear: number } | undefined;
  if (fund === undefined) {
    throw new LedgerWorkbookError(404, "Fund not found");
  }
  if (fund.fiscalYear !== fiscalYear) {
    throw new LedgerWorkbookError(400, "Fund does not belong to the requested fiscal year");
  }
}

function scopeClause(options: { includeWhere?: boolean; fundId?: number }) {
  const prefix = options.includeWhere === false ? "AND" : "WHERE";
  return `${prefix} f.fiscal_year = @fiscalYear${options.fundId === undefined ? "" : " AND f.id = @fundId"}`;
}

function getLatestImportWarningCount(db: Database.Database) {
  const row = db
    .prepare(
      `
      SELECT warning_count AS warningCount
      FROM imports
      ORDER BY imported_at DESC, id DESC
      LIMIT 1
      `,
    )
    .get() as LatestImportWarningRow | undefined;

  return row?.warningCount ?? 0;
}

function countUnsetCrossAggregateCategories(
  db: Database.Database,
  fiscalYear: number,
  fundId: number | undefined,
) {
  const row = db
    .prepare(
      `
      SELECT COUNT(*) AS count
      FROM categories c
      INNER JOIN funds f ON f.id = c.fund_id
      ${scopeClause({ fundId })}
        AND c.cross_aggregate_category = 'unset'
      `,
    )
    .get({ fiscalYear, fundId }) as { count: number };

  return row.count;
}

function listFundSummaries(
  db: Database.Database,
  fiscalYear: number,
  fundId: number | undefined,
) {
  return db
    .prepare(
      `
      WITH
      linked_actuals AS (
        SELECT planned_item_id, SUM(amount) AS linked_amount
        FROM actual_entries
        WHERE planned_item_id IS NOT NULL
        GROUP BY planned_item_id
      ),
      fund_commitments AS (
        SELECT
          p.fund_id,
          SUM(
            CASE
              WHEN p.amount - COALESCE(la.linked_amount, 0) > 0 THEN p.amount - COALESCE(la.linked_amount, 0)
              ELSE 0
            END
          ) AS planned_amount
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
        f.id AS fundId,
        f.fund_code AS fundCode,
        f.name AS fundName,
        f.fiscal_year AS fiscalYear,
        f.awarded_amount AS awardedAmount,
        COALESCE(fc.planned_amount, 0) AS plannedAmount,
        COALESCE(fa.actual_amount, 0) AS actualAmount
      FROM funds f
      LEFT JOIN fund_commitments fc ON fc.fund_id = f.id
      LEFT JOIN fund_actuals fa ON fa.fund_id = f.id
      ${scopeClause({ fundId })}
      ORDER BY f.display_order, f.id
      `,
    )
    .all({ fiscalYear, fundId }) as FundSummaryRow[];
}

function listCategorySummaries(
  db: Database.Database,
  fiscalYear: number,
  fundId: number | undefined,
) {
  return db
    .prepare(
      `
      WITH
      linked_actuals AS (
        SELECT planned_item_id, SUM(amount) AS linked_amount
        FROM actual_entries
        WHERE planned_item_id IS NOT NULL
        GROUP BY planned_item_id
      ),
      category_budgets AS (
        SELECT category_id, SUM(amount) AS budget_amount
        FROM budget_lines
        GROUP BY category_id
      ),
      category_commitments AS (
        SELECT
          p.category_id,
          SUM(
            CASE
              WHEN p.amount - COALESCE(la.linked_amount, 0) > 0 THEN p.amount - COALESCE(la.linked_amount, 0)
              ELSE 0
            END
          ) AS planned_amount
        FROM planned_items p
        LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
        WHERE p.status = 'planned'
        GROUP BY p.category_id
      ),
      category_actuals AS (
        SELECT category_id, SUM(amount) AS actual_amount
        FROM actual_entries
        GROUP BY category_id
      )
      SELECT
        f.id AS fundId,
        f.fund_code AS fundCode,
        f.name AS fundName,
        c.id AS categoryId,
        c.category_code AS categoryCode,
        c.name AS categoryName,
        c.cross_aggregate_category AS crossAggregateCategory,
        cb.budget_amount AS budgetAmount,
        COALESCE(cc.planned_amount, 0) AS plannedAmount,
        COALESCE(ca.actual_amount, 0) AS actualAmount
      FROM categories c
      INNER JOIN funds f ON f.id = c.fund_id
      LEFT JOIN category_budgets cb ON cb.category_id = c.id
      LEFT JOIN category_commitments cc ON cc.category_id = c.id
      LEFT JOIN category_actuals ca ON ca.category_id = c.id
      ${scopeClause({ fundId })}
      ORDER BY f.display_order, f.id, c.display_order, c.id
      `,
    )
    .all({ fiscalYear, fundId }) as CategorySummaryRow[];
}

function listMonthlyTrendRows(
  db: Database.Database,
  fiscalYear: number,
  fundId: number | undefined,
) {
  const rows = db
    .prepare(
      `
      WITH
      linked_actuals AS (
        SELECT planned_item_id, SUM(amount) AS linked_amount
        FROM actual_entries
        WHERE planned_item_id IS NOT NULL
        GROUP BY planned_item_id
      ),
      planned_by_month AS (
        SELECT
          p.scheduled_month AS month,
          SUM(
            CASE
              WHEN p.amount - COALESCE(la.linked_amount, 0) > 0 THEN p.amount - COALESCE(la.linked_amount, 0)
              ELSE 0
            END
          ) AS plannedAmount
        FROM planned_items p
        INNER JOIN funds f ON f.id = p.fund_id
        LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
        ${scopeClause({ fundId })}
          AND p.status = 'planned'
        GROUP BY p.scheduled_month
      ),
      actual_by_month AS (
        SELECT
          SUBSTR(ae.actual_date, 1, 7) AS month,
          SUM(ae.amount) AS actualAmount
        FROM actual_entries ae
        INNER JOIN funds f ON f.id = ae.fund_id
        ${scopeClause({ fundId })}
        GROUP BY SUBSTR(ae.actual_date, 1, 7)
      )
      SELECT
        months.month,
        COALESCE(pbm.plannedAmount, 0) AS plannedAmount,
        COALESCE(abm.actualAmount, 0) AS actualAmount
      FROM (
        SELECT month FROM planned_by_month
        UNION
        SELECT month FROM actual_by_month
      ) months
      LEFT JOIN planned_by_month pbm ON pbm.month = months.month
      LEFT JOIN actual_by_month abm ON abm.month = months.month
      ORDER BY months.month
      `,
    )
    .all({ fiscalYear, fundId }) as MonthlyTrendRow[];
  const rowsByMonth = new Map(rows.map((row) => [row.month, row]));

  return listFiscalYearMonths(fiscalYear).map((month) => rowsByMonth.get(month) ?? {
    month,
    plannedAmount: 0,
    actualAmount: 0,
  });
}

function listPlannedDetails(
  db: Database.Database,
  fiscalYear: number,
  fundId: number | undefined,
) {
  return db
    .prepare(
      `
      WITH linked_actuals AS (
        SELECT planned_item_id, SUM(amount) AS linked_amount
        FROM actual_entries
        WHERE planned_item_id IS NOT NULL
        GROUP BY planned_item_id
      )
      SELECT
        p.planned_ref AS plannedRef,
        f.id AS fundId,
        f.fund_code AS fundCode,
        f.name AS fundName,
        c.id AS categoryId,
        c.category_code AS categoryCode,
        c.name AS categoryName,
        c.cross_aggregate_category AS crossAggregateCategory,
        p.planned_date AS plannedDate,
        p.scheduled_month AS scheduledMonth,
        p.description,
        p.amount AS plannedAmount,
        CASE
          WHEN p.status = 'planned' AND p.amount - COALESCE(la.linked_amount, 0) > 0 THEN p.amount - COALESCE(la.linked_amount, 0)
          ELSE 0
        END AS remainingPlannedAmount,
        p.status,
        p.notes
      FROM planned_items p
      INNER JOIN funds f ON f.id = p.fund_id
      INNER JOIN categories c ON c.id = p.category_id
      LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
      ${scopeClause({ fundId })}
      ORDER BY p.scheduled_month, p.planned_date, f.display_order, f.id, c.display_order, c.id, p.id
      `,
    )
    .all({ fiscalYear, fundId }) as PlannedDetailRow[];
}

function listActualDetails(
  db: Database.Database,
  fiscalYear: number,
  fundId: number | undefined,
) {
  return db
    .prepare(
      `
      SELECT
        f.id AS fundId,
        f.fund_code AS fundCode,
        f.name AS fundName,
        c.id AS categoryId,
        c.category_code AS categoryCode,
        c.name AS categoryName,
        c.cross_aggregate_category AS crossAggregateCategory,
        ae.actual_date AS actualDate,
        ae.description,
        ae.amount,
        p.planned_ref AS plannedRef,
        ae.notes
      FROM actual_entries ae
      INNER JOIN funds f ON f.id = ae.fund_id
      INNER JOIN categories c ON c.id = ae.category_id
      LEFT JOIN planned_items p ON p.id = ae.planned_item_id
      ${scopeClause({ fundId })}
      ORDER BY ae.actual_date, f.display_order, f.id, c.display_order, c.id, ae.id
      `,
    )
    .all({ fiscalYear, fundId }) as ActualDetailRow[];
}

function crossAggregateLabel(value: CrossAggregateCategory) {
  return CROSS_AGGREGATE_CATEGORY_LABELS[value] ?? value;
}

function createSheet(rows: CellValue[][], amountColumns: number[] = [], rateColumns: number[] = []) {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1:A1");
  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    for (const column of amountColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell && typeof cell.v === "number") {
        cell.z = AMOUNT_FORMAT;
      }
    }
    for (const column of rateColumns) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: column })];
      if (cell && typeof cell.v === "number") {
        cell.z = RATE_FORMAT;
      }
    }
  }

  sheet["!cols"] = rows[0]?.map((header) => ({ wch: Math.max(12, String(header ?? "").length + 4) }));
  return sheet;
}

function appendSheet(
  workbook: import("xlsx").WorkBook,
  sheetName: (typeof SHEET_NAMES)[number],
  rows: CellValue[][],
  amountColumns: number[] = [],
  rateColumns: number[] = [],
) {
  XLSX.utils.book_append_sheet(workbook, createSheet(rows, amountColumns, rateColumns), sheetName);
}

export function buildLedgerWorkbookExport(db: Database.Database, options: LedgerWorkbookOptions) {
  const fiscalYear = resolveFiscalYear(db, options);
  assertFundMatchesFiscalYear(db, fiscalYear, options.fundId);

  const fundSummaries = listFundSummaries(db, fiscalYear, options.fundId);
  const categorySummaries = listCategorySummaries(db, fiscalYear, options.fundId);
  const monthlyTrendRows = listMonthlyTrendRows(db, fiscalYear, options.fundId);
  const plannedDetails = listPlannedDetails(db, fiscalYear, options.fundId);
  const actualDetails = listActualDetails(db, fiscalYear, options.fundId);
  const totalAssets = fundSummaries.reduce((sum, row) => sum + row.awardedAmount, 0);
  const totalPlanned = fundSummaries.reduce((sum, row) => sum + row.plannedAmount, 0);
  const totalActual = fundSummaries.reduce((sum, row) => sum + row.actualAmount, 0);
  const freeBalance = totalAssets - totalPlanned - totalActual;
  const latestImportWarningCount = getLatestImportWarningCount(db);
  const unsetCrossAggregateCategoryCount = countUnsetCrossAggregateCategories(
    db,
    fiscalYear,
    options.fundId,
  );
  const exportedAt = options.exportedAt ?? new Date();
  const workbook = XLSX.utils.book_new();

  appendSheet(
    workbook,
    "概要",
    [
      ["項目", "値"],
      ["出力日時", exportedAt.toISOString()],
      ["対象年度", fiscalYear],
      ["対象範囲", options.fundId === undefined ? "年度全体" : "単一予算"],
      ["予算数", fundSummaries.length],
      ["予算総額", totalAssets],
      ["執行予定額", totalPlanned],
      ["執行済額", totalActual],
      ["残高", freeBalance],
      ["latest_import_warning_count", latestImportWarningCount],
      ["cross_aggregate_category_unset_count", unsetCrossAggregateCategoryCount],
    ],
    [1],
  );

  appendSheet(
    workbook,
    "予算別サマリ",
    [
      ["予算ID", "fund_code", "予算名", "年度", "交付額", "執行予定額", "執行済額", "残高", "予算消化率", "残高率"],
      ...fundSummaries.map((row) => {
        const balance = row.awardedAmount - row.plannedAmount - row.actualAmount;
        return [
          row.fundId,
          row.fundCode,
          row.fundName,
          row.fiscalYear,
          row.awardedAmount,
          row.plannedAmount,
          row.actualAmount,
          balance,
          row.awardedAmount === 0 ? 0 : (row.plannedAmount + row.actualAmount) / row.awardedAmount,
          row.awardedAmount === 0 ? 0 : balance / row.awardedAmount,
        ];
      }),
    ],
    [4, 5, 6, 7],
    [8, 9],
  );

  appendSheet(
    workbook,
    "費目別サマリ",
    [
      ["予算ID", "fund_code", "予算名", "費目ID", "category_code", "費目名", "横断集計カテゴリ", "予算額", "執行予定額", "執行済額", "残高"],
      ...categorySummaries.map((row) => [
        row.fundId,
        row.fundCode,
        row.fundName,
        row.categoryId,
        row.categoryCode,
        row.categoryName,
        crossAggregateLabel(row.crossAggregateCategory),
        row.budgetAmount,
        row.plannedAmount,
        row.actualAmount,
        (row.budgetAmount ?? 0) - row.plannedAmount - row.actualAmount,
      ]),
    ],
    [7, 8, 9, 10],
  );

  let cumulative = 0;
  appendSheet(
    workbook,
    "月別推移",
    [
      ["月", "執行予定額", "執行済額", "月合計", "累計", "残高"],
      ...monthlyTrendRows.map((row) => {
        const monthlyTotal = row.plannedAmount + row.actualAmount;
        cumulative += monthlyTotal;
        return [
          row.month,
          row.plannedAmount,
          row.actualAmount,
          monthlyTotal,
          cumulative,
          totalAssets - cumulative,
        ];
      }),
    ],
    [1, 2, 3, 4, 5],
  );

  appendSheet(
    workbook,
    "計画明細",
    [
      ["planned_ref", "予算ID", "fund_code", "予算名", "費目ID", "category_code", "費目名", "横断集計カテゴリ", "立案日", "執行予定月", "説明", "計画金額", "残予定額", "ステータス", "メモ"],
      ...plannedDetails.map((row) => [
        row.plannedRef,
        row.fundId,
        row.fundCode,
        row.fundName,
        row.categoryId,
        row.categoryCode,
        row.categoryName,
        crossAggregateLabel(row.crossAggregateCategory),
        row.plannedDate,
        row.scheduledMonth,
        row.description,
        row.plannedAmount,
        row.remainingPlannedAmount,
        row.status,
        row.notes,
      ]),
    ],
    [11, 12],
  );

  appendSheet(
    workbook,
    "実績明細",
    [
      ["予算ID", "fund_code", "予算名", "費目ID", "category_code", "費目名", "横断集計カテゴリ", "実績日", "説明", "金額", "planned_ref", "メモ"],
      ...actualDetails.map((row) => [
        row.fundId,
        row.fundCode,
        row.fundName,
        row.categoryId,
        row.categoryCode,
        row.categoryName,
        crossAggregateLabel(row.crossAggregateCategory),
        row.actualDate,
        row.description,
        row.amount,
        row.plannedRef,
        row.notes,
      ]),
    ],
    [9],
  );

  const filename = options.fundId === undefined
    ? `ledger-${fiscalYear}.xlsx`
    : `ledger-${fiscalYear}-fund-${options.fundId}.xlsx`;

  return {
    filename,
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
  };
}

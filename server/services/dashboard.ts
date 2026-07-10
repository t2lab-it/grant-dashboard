import type Database from "better-sqlite3";
import {
  getLinkedActualAmount,
  getPendingPlannedCount,
  listFundOverduePlannedAmountRows,
  listFundAggregateRows,
  listFundCategoryAggregateRows,
  listFundCrossAggregateCategoryRows,
  listFundMonthlyAggregateRows,
  listFundRemainingPlannedItemRows,
  listOverviewCrossAggregateCategoryRows,
  listOverviewMonthlyAggregateRows,
  toFreeBalance,
  type FundCategoryAggregateRow,
  type FundCrossAggregateCategoryRow,
  type FundMonthlyAggregateRow,
  type FundRemainingPlannedItemRow,
  type OverviewMonthlyAggregateRow,
} from "./financialAggregates";
import { isDemoTutorialEligible } from "./demoMetadata";
import { listAssignedClassifications } from "./classifications";
import { buildYearEndRiskSummary, defaultYearEndRiskThresholds } from "../../src/contracts/yearEndRisk";
import { formatTokyoMonthKey, inferJapaneseFiscalYear, listFiscalYearMonths } from "../../src/lib/calendar";

type OverviewTotalsRow = {
  assets: number;
  committed: number;
  actual: number;
};

type OverviewFundRow = {
  id: number;
  name: string;
  awarded_amount: number;
  committed_amount: number;
  actual_amount: number;
};

type LatestImportRow = {
  id: number;
  source_filename: string;
  imported_at: string;
  warning_count: number;
  reconciliation_json: string;
};

type FundRow = {
  id: number;
  name: string;
  fiscalYear: number;
  awarded_amount: number;
  notes: string;
};

type FundActualEntryRow = {
  id: number;
  actualDate: string;
  categoryId: number;
  categoryName: string;
  description: string;
  amount: number;
  notes: string;
};

type FundPlannedItemHistoryRow = {
  id: number;
  plannedDate: string;
  scheduledMonth: string;
  categoryId: number;
  categoryName: string;
  description: string;
  amount: number;
  remainingAmount: number;
  status: "completed" | "cancelled";
  notes: string;
};

type OverviewSnapshotOptions = {
  fiscalYear?: number;
  today?: Date;
};

function parseLatestImportReconciliationOk(reconciliationJson: string) {
  const parsed = JSON.parse(reconciliationJson) as { ok?: unknown };
  return parsed.ok === true;
}

function listAvailableFiscalYears(db: Database.Database) {
  return (
    db
      .prepare(
        `
        SELECT DISTINCT fiscal_year AS fiscalYear
        FROM funds
        ORDER BY fiscal_year
        `,
      )
      .all() as Array<{ fiscalYear: number }>
  ).map((row) => row.fiscalYear);
}

function resolveFiscalYear(availableFiscalYears: number[], options: OverviewSnapshotOptions) {
  if (availableFiscalYears.length === 0) {
    return null;
  }

  const targetFiscalYear = options.fiscalYear ?? inferJapaneseFiscalYear(options.today ?? new Date());
  if (availableFiscalYears.includes(targetFiscalYear)) {
    return targetFiscalYear;
  }

  return availableFiscalYears.reduce((nearest, candidate) => {
    const nearestDistance = Math.abs(nearest - targetFiscalYear);
    const candidateDistance = Math.abs(candidate - targetFiscalYear);

    if (candidateDistance < nearestDistance) {
      return candidate;
    }

    if (candidateDistance === nearestDistance && candidate > nearest) {
      return candidate;
    }

    return nearest;
  });
}

function listOverviewMonthlyStatus(db: Database.Database, totalAssets: number, fiscalYear: number) {
  const rows = listOverviewMonthlyAggregateRows(db, fiscalYear) as OverviewMonthlyAggregateRow[];
  const rowsByMonth = new Map(rows.map((row) => [row.month, row]));

  let remainingBalance = totalAssets;

  return listFiscalYearMonths(fiscalYear).map((month) => {
    const row = rowsByMonth.get(month) ?? { month, committed: 0, actual: 0 };
    remainingBalance -= row.committed + row.actual;

    return {
      ...row,
      balance: remainingBalance,
    };
  });
}

function getFundOverduePlannedAmountMap(db: Database.Database, fiscalYear: number, today: Date) {
  return new Map(
    listFundOverduePlannedAmountRows(db, fiscalYear, formatTokyoMonthKey(today)).map((row) => [
      row.fundId,
      row.overduePlannedAmount,
    ]),
  );
}

export function getOverviewSnapshot(db: Database.Database, options: OverviewSnapshotOptions = {}) {
  const availableFiscalYears = listAvailableFiscalYears(db);
  const selectedFiscalYear = resolveFiscalYear(availableFiscalYears, options);
  const aggregateRows = selectedFiscalYear === null ? [] : listFundAggregateRows(db, selectedFiscalYear);
  const totals: OverviewTotalsRow = {
    assets: aggregateRows.reduce((sum, row) => sum + row.awarded_amount, 0),
    committed: aggregateRows.reduce((sum, row) => sum + row.committed_amount, 0),
    actual: aggregateRows.reduce((sum, row) => sum + row.actual_amount, 0),
  };

  const funds = aggregateRows.map((row) => ({
    ...row,
    freeBalance: toFreeBalance(row.awarded_amount, row.committed_amount, row.actual_amount),
    projectTags: listAssignedClassifications(db, "fund", row.id).filter((tag) => tag.kind === "project"),
  }));
  const monthlyStatus = selectedFiscalYear === null
    ? []
    : listOverviewMonthlyStatus(db, totals.assets, selectedFiscalYear);
  const yearEndRisk = buildYearEndRiskSummary(
    funds,
    selectedFiscalYear === null
      ? new Map()
      : getFundOverduePlannedAmountMap(db, selectedFiscalYear, options.today ?? new Date()),
    defaultYearEndRiskThresholds,
  );

  const latestImportRow = db
    .prepare(
      `
      SELECT id, source_filename, imported_at, warning_count, reconciliation_json
      FROM imports
      ORDER BY imported_at DESC, id DESC
      LIMIT 1
      `,
    )
    .get() as LatestImportRow | undefined;

  return {
    availableFiscalYears,
    selectedFiscalYear,
    totals: {
      ...totals,
      freeBalance: toFreeBalance(totals.assets, totals.committed, totals.actual),
    },
    linkedActualAmount: selectedFiscalYear === null ? 0 : getLinkedActualAmount(db, selectedFiscalYear),
    pendingPlannedCount: selectedFiscalYear === null ? 0 : getPendingPlannedCount(db, selectedFiscalYear),
    crossAggregateCategories: selectedFiscalYear === null ? [] : listOverviewCrossAggregateCategoryRows(db, selectedFiscalYear),
    yearEndRisk,
    monthlyStatus,
    latestImport: latestImportRow
      ? {
          id: latestImportRow.id,
          source_filename: latestImportRow.source_filename,
          imported_at: latestImportRow.imported_at,
          warning_count: latestImportRow.warning_count,
          reconciliation_ok: parseLatestImportReconciliationOk(latestImportRow.reconciliation_json),
        }
      : null,
    tutorial: {
      eligibleDemoData: isDemoTutorialEligible(db),
    },
    funds,
  };
}

export function getFundSnapshot(db: Database.Database, fundId: number) {
  const fund = db
    .prepare(
      `
      SELECT id, name, fiscal_year AS fiscalYear, awarded_amount, notes
      FROM funds
      WHERE id = ?
      `,
    )
    .get(fundId) as FundRow | undefined;

  const categories = listFundCategoryAggregateRows(db, fundId) as FundCategoryAggregateRow[];
  const crossAggregateCategories = listFundCrossAggregateCategoryRows(
    db,
    fundId,
  ) as FundCrossAggregateCategoryRow[];

  const monthlyStatus = listFundMonthlyAggregateRows(db, fundId) as FundMonthlyAggregateRow[];

  const actualEntries = db
    .prepare(
      `
      SELECT
        ae.id,
        ae.actual_date AS actualDate,
        ae.category_id AS categoryId,
        c.name AS categoryName,
        ae.description,
        ae.amount,
        ae.notes
      FROM actual_entries ae
      INNER JOIN categories c ON c.id = ae.category_id
      WHERE ae.fund_id = ?
      ORDER BY ae.actual_date DESC, ae.id DESC
      `,
    )
    .all(fundId) as FundActualEntryRow[];

  const plannedItemRows = listFundRemainingPlannedItemRows(db, fundId) as FundRemainingPlannedItemRow[];
  const plannedItemHistoryRows = db
    .prepare(
      `
      WITH linked_actuals AS (
        SELECT planned_item_id, SUM(amount) AS linked_amount
        FROM actual_entries
        WHERE planned_item_id IS NOT NULL
        GROUP BY planned_item_id
      )
      SELECT
        p.id,
        p.planned_date AS plannedDate,
        p.scheduled_month AS scheduledMonth,
        p.category_id AS categoryId,
        c.name AS categoryName,
        p.description,
        p.amount,
        CASE
          WHEN p.status = 'completed' AND p.amount - COALESCE(la.linked_amount, 0) > 0 THEN p.amount - COALESCE(la.linked_amount, 0)
          ELSE 0
        END AS remainingAmount,
        p.status,
        p.notes
      FROM planned_items p
      INNER JOIN categories c ON c.id = p.category_id
      LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
      WHERE p.fund_id = ? AND p.status IN ('cancelled', 'completed')
      ORDER BY p.scheduled_month DESC, c.display_order, c.id, p.id DESC
      `,
    )
    .all(fundId) as FundPlannedItemHistoryRow[];

  const plannedItems = plannedItemRows.map((row) => ({
    ...row,
    auxiliaryLabels: listAssignedClassifications(db, "planned_item", row.id).filter(
      (tag) => tag.kind === "auxiliary",
    ),
  }));
  const plannedItemHistory = plannedItemHistoryRows.map((row) => ({
    ...row,
    auxiliaryLabels: listAssignedClassifications(db, "planned_item", row.id).filter(
      (tag) => tag.kind === "auxiliary",
    ),
  }));
  const actualEntriesWithLabels = actualEntries.map((row) => ({
    ...row,
    auxiliaryLabels: listAssignedClassifications(db, "actual_entry", row.id).filter(
      (tag) => tag.kind === "auxiliary",
    ),
  }));

  const fundClassifications =
    fund === undefined ? [] : listAssignedClassifications(db, "fund", fund.id);
  const fundWithClassifications =
    fund === undefined
      ? undefined
      : {
          ...fund,
          projectTags: fundClassifications.filter((tag) => tag.kind === "project"),
          auxiliaryLabels: fundClassifications.filter((tag) => tag.kind === "auxiliary"),
        };

  return {
    fund: fundWithClassifications,
    categories,
    crossAggregateCategories,
    monthlyStatus,
    actualEntries: actualEntriesWithLabels,
    plannedItems,
    plannedItemHistory,
  };
}

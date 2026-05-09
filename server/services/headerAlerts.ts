import type Database from "better-sqlite3";
import type {
  HeaderAlertCategory,
  HeaderAlertDetail,
  HeaderAlertItem,
  HeaderAlertsResponse,
} from "../../src/contracts/headerAlerts";
import { toHeaderYearEndRisks } from "../../src/contracts/headerAlerts";
import { buildYearEndRiskSummary } from "../../src/contracts/yearEndRisk";
import {
  listFundAggregateRows,
  listFundCategoryAggregateRows,
  listFundOverduePlannedAmountRows,
  toFreeBalance,
} from "./financialAggregates";

type HeaderAlertsOptions = {
  fiscalYear?: number;
  today?: Date;
};

type LatestImportRow = {
  id: number;
  source_filename: string;
  imported_at: string;
  warning_count: number;
  reconciliation_json: string;
};

type PlannedAlertRow = {
  id: number;
  fundId: number;
  fundName: string;
  categoryName: string;
  scheduledMonth: string;
  description: string;
  amount: number;
  linkedAmount: number;
};

const PRIMARY_ORDER: HeaderAlertCategory["key"][] = [
  "budget_overrun",
  "reconciliation_mismatch",
  "overdue",
  "year_end_risk",
];

const SUPPORTING_ORDER: HeaderAlertCategory["key"][] = ["import_warning"];
const MAX_ITEMS = 3;

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

function inferJapaneseFiscalYear(today: Date) {
  const month = today.getMonth() + 1;
  return month >= 4 ? today.getFullYear() : today.getFullYear() - 1;
}

function resolveFiscalYear(availableFiscalYears: number[], options: HeaderAlertsOptions) {
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

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function buildFundHref(fundId: number, fiscalYear: number) {
  return `/funds/${fundId}?year=${fiscalYear}`;
}

function remainingAmount(row: PlannedAlertRow) {
  return Math.max(row.amount - row.linkedAmount, 0);
}

function createCategory(
  key: HeaderAlertCategory["key"],
  label: string,
  severity: HeaderAlertCategory["severity"],
  count: number,
  items: HeaderAlertItem[],
  description?: string,
): HeaderAlertCategory | null {
  if (count <= 0) {
    return null;
  }

  return {
    key,
    label,
    severity,
    count,
    description,
    items: items.slice(0, MAX_ITEMS),
  };
}

function listBudgetOverrunCategories(db: Database.Database, fiscalYear: number) {
  const fundRows = listFundAggregateRows(db, fiscalYear);
  return fundRows
    .flatMap((fund) =>
      listFundCategoryAggregateRows(db, fund.id)
        .filter((category) => category.budgetAmount !== null)
        .map((category) => {
          const usedAmount = category.plannedAmount + category.actualAmount;
          const budgetAmount = category.budgetAmount ?? 0;
          const balance = budgetAmount - usedAmount;
          return {
            id: `${fund.id}-${category.id}`,
            fundId: fund.id,
            fundName: fund.name,
            categoryName: category.categoryName,
            amount: balance,
          };
        })
        .filter((category) => category.amount < 0),
    )
    .sort((left, right) => left.amount - right.amount);
}

type FundGroupedDetailRow = {
  fundId: number;
  fundName: string;
  detail: HeaderAlertDetail;
};

function groupAlertDetailsByFund(rows: FundGroupedDetailRow[], fiscalYear: number): HeaderAlertItem[] {
  const itemsByFundId = new Map<number, HeaderAlertItem>();

  for (const row of rows) {
    const current = itemsByFundId.get(row.fundId);

    if (current === undefined) {
      itemsByFundId.set(row.fundId, {
        id: `fund-${row.fundId}`,
        title: row.fundName,
        href: buildFundHref(row.fundId, fiscalYear),
        details: [row.detail],
      });
      continue;
    }

    current.details?.push(row.detail);
  }

  return Array.from(itemsByFundId.values());
}

function listPlannedAlertRows(db: Database.Database, fiscalYear: number) {
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
        p.id,
        p.fund_id AS fundId,
        f.name AS fundName,
        c.name AS categoryName,
        p.scheduled_month AS scheduledMonth,
        p.description,
        p.amount,
        COALESCE(la.linked_amount, 0) AS linkedAmount
      FROM planned_items p
      INNER JOIN funds f ON f.id = p.fund_id
      INNER JOIN categories c ON c.id = p.category_id
      LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
      WHERE p.status = 'planned'
        AND f.fiscal_year = ?
      `,
    )
    .all(fiscalYear) as PlannedAlertRow[];
}

function getLatestImport(db: Database.Database) {
  return db
    .prepare(
      `
      SELECT id, source_filename, imported_at, warning_count, reconciliation_json
      FROM imports
      ORDER BY imported_at DESC, id DESC
      LIMIT 1
      `,
    )
    .get() as LatestImportRow | undefined;
}

function isReconciliationOk(row: LatestImportRow) {
  try {
    return (JSON.parse(row.reconciliation_json) as { ok?: unknown }).ok === true;
  } catch {
    return false;
  }
}

function buildBudgetOverrunCategory(db: Database.Database, fiscalYear: number) {
  const rows = listBudgetOverrunCategories(db, fiscalYear);
  return createCategory(
    "budget_overrun",
    "予算超過",
    "danger",
    rows.length,
    groupAlertDetailsByFund(
      rows.map((row) => ({
        fundId: row.fundId,
        fundName: row.fundName,
        detail: {
          id: row.id,
          label: row.categoryName,
          labelTone: "budget_overrun",
          amount: row.amount,
        },
      })),
      fiscalYear,
    ),
  );
}

function buildReconciliationCategory(latestImport: LatestImportRow | undefined) {
  if (latestImport === undefined || isReconciliationOk(latestImport)) {
    return null;
  }

  return createCategory("reconciliation_mismatch", "不整合", "danger", 1, [
    {
      id: `import-${latestImport.id}`,
      title: latestImport.source_filename,
      description: "最新インポートの照合に不整合があります。",
      href: `/imports/${latestImport.id}`,
    },
  ]);
}

function buildOverdueCategory(plannedRows: PlannedAlertRow[], fiscalYear: number, currentMonth: string) {
  const rows = plannedRows
    .filter((row) => row.scheduledMonth < currentMonth && remainingAmount(row) > 0)
    .sort((left, right) => {
      const monthDelta = left.scheduledMonth.localeCompare(right.scheduledMonth);
      if (monthDelta !== 0) {
        return monthDelta;
      }

      return remainingAmount(right) - remainingAmount(left);
    });

  return createCategory(
    "overdue",
    "期限超過",
    "warning",
    rows.length,
    groupAlertDetailsByFund(
      rows.map((row) => ({
        fundId: row.fundId,
        fundName: row.fundName,
        detail: {
          id: `planned-${row.id}`,
          label: row.scheduledMonth,
          labelTone: "overdue",
          title: row.description,
          amount: remainingAmount(row),
        },
      })),
      fiscalYear,
    ),
  );
}

function buildYearEndRiskCategory(db: Database.Database, fiscalYear: number, today: Date) {
  const funds = listFundAggregateRows(db, fiscalYear).map((row) => ({
    ...row,
    freeBalance: toFreeBalance(row.awarded_amount, row.committed_amount, row.actual_amount),
  }));
  const overduePlannedAmountByFundId = new Map(
    listFundOverduePlannedAmountRows(db, fiscalYear, formatMonthKey(today)).map((row) => [
      row.fundId,
      row.overduePlannedAmount,
    ]),
  );
  const summary = buildYearEndRiskSummary(funds, overduePlannedAmountByFundId);

  return createCategory(
    "year_end_risk",
    "年度末注意",
    "warning",
    summary.riskFundCount,
    summary.risks.map((risk) => ({
      id: `fund-${risk.fundId}`,
      title: risk.fundName,
      href: buildFundHref(risk.fundId, fiscalYear),
      yearEndRisks: toHeaderYearEndRisks(risk),
    })),
  );
}

function buildImportWarningCategory(latestImport: LatestImportRow | undefined) {
  if (latestImport === undefined || latestImport.warning_count <= 0) {
    return null;
  }

  return createCategory("import_warning", "import warning", "supporting", latestImport.warning_count, [
    {
      id: `import-${latestImport.id}`,
      title: latestImport.source_filename,
      description: "最新インポートに warning があります。",
      href: `/imports/${latestImport.id}`,
    },
  ]);
}

function compactCategories(categories: Array<HeaderAlertCategory | null>) {
  return categories.filter((category): category is HeaderAlertCategory => category !== null);
}

export function getHeaderAlertsSnapshot(
  db: Database.Database,
  options: HeaderAlertsOptions = {},
): HeaderAlertsResponse {
  const availableFiscalYears = listAvailableFiscalYears(db);
  const selectedFiscalYear = resolveFiscalYear(availableFiscalYears, options);

  if (selectedFiscalYear === null) {
    return {
      availableFiscalYears,
      selectedFiscalYear,
      primary: [],
      supporting: [],
    };
  }

  const today = options.today ?? new Date();
  const plannedRows = listPlannedAlertRows(db, selectedFiscalYear);
  const latestImport = getLatestImport(db);
  const primaryByKey = new Map<HeaderAlertCategory["key"], HeaderAlertCategory>(
    compactCategories([
      buildBudgetOverrunCategory(db, selectedFiscalYear),
      buildReconciliationCategory(latestImport),
      buildOverdueCategory(plannedRows, selectedFiscalYear, formatMonthKey(today)),
      buildYearEndRiskCategory(db, selectedFiscalYear, today),
    ]).map((category) => [category.key, category]),
  );
  const supportingByKey = new Map<HeaderAlertCategory["key"], HeaderAlertCategory>(
    compactCategories([
      buildImportWarningCategory(latestImport),
    ]).map((category) => [category.key, category]),
  );

  return {
    availableFiscalYears,
    selectedFiscalYear,
    primary: PRIMARY_ORDER.flatMap((key) => primaryByKey.get(key) ?? []),
    supporting: SUPPORTING_ORDER.flatMap((key) => supportingByKey.get(key) ?? []),
  };
}

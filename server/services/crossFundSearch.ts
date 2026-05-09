import type Database from "better-sqlite3";

export type CrossFundSearchTab = "all" | "overdue" | "unsettled" | "unlinked";
export type CrossFundEntryType = "planned" | "actual";

export type CrossFundSearchOptions = {
  fiscalYear?: number;
  tab?: CrossFundSearchTab;
  keyword?: string;
  fundId?: number;
  categoryId?: number;
  auxiliaryLabelId?: number;
  entryType?: CrossFundEntryType;
  monthFrom?: string;
  monthTo?: string;
  today?: Date;
};

export type SearchAuxiliaryLabel = {
  id: number;
  kind: "auxiliary";
  name: string;
  color: string;
};

type ResultAuxiliaryLabel = SearchAuxiliaryLabel & {
  inherited: boolean;
};

type SearchFundRow = {
  id: number;
  name: string;
  fiscalYear: number;
};

type SearchCategoryRow = {
  id: number;
  fundId: number;
  name: string;
};

type PlannedSearchRow = {
  id: number;
  fundId: number;
  fundName: string;
  categoryId: number;
  categoryName: string;
  plannedDate: string;
  scheduledMonth: string;
  description: string;
  amount: number;
  status: string;
  notes: string;
  linkedAmount: number;
};

type ActualSearchRow = {
  id: number;
  fundId: number;
  fundName: string;
  categoryId: number;
  categoryName: string;
  plannedItemId: number | null;
  actualDate: string;
  description: string;
  amount: number;
  notes: string;
};

export type CrossFundSearchResult = {
  id: number;
  type: CrossFundEntryType;
  fundId: number;
  fundName: string;
  categoryId: number;
  categoryName: string;
  date: string;
  month: string;
  description: string;
  notes: string;
  amount: number;
  remainingAmount: number | null;
  statusLabel: string;
  detailHref: string;
  auxiliaryLabels: ResultAuxiliaryLabel[];
};

export type CrossFundSearchSnapshot = {
  availableFiscalYears: number[];
  selectedFiscalYear: number | null;
  filters: {
    funds: Array<{ id: number; name: string }>;
    categories: Array<{ id: number; fundId: number; name: string }>;
    auxiliaryLabels: SearchAuxiliaryLabel[];
  };
  counts: Record<CrossFundSearchTab, number>;
  resultLimit: number;
  totalResultCount: number;
  results: CrossFundSearchResult[];
};

const SEARCH_TABS: CrossFundSearchTab[] = ["all", "overdue", "unsettled", "unlinked"];
const RESULT_LIMIT = 200;

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

function resolveFiscalYear(availableFiscalYears: number[], options: CrossFundSearchOptions) {
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

function formatYen(amount: number) {
  return `${new Intl.NumberFormat("ja-JP").format(amount)}円`;
}

function toMonth(date: string) {
  return date.slice(0, 7);
}

function toCurrentMonth(today: Date) {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function includesKeyword(result: CrossFundSearchResult, keyword: string) {
  const normalizedKeyword = normalizeText(keyword);
  if (normalizedKeyword.length === 0) {
    return true;
  }

  return normalizeText(
    `${result.description} ${result.notes} ${result.fundName} ${result.categoryName}`,
  ).includes(normalizedKeyword);
}

function compareResults(a: CrossFundSearchResult, b: CrossFundSearchResult) {
  const monthComparison = b.month.localeCompare(a.month);
  if (monthComparison !== 0) {
    return monthComparison;
  }

  const dateComparison = b.date.localeCompare(a.date);
  if (dateComparison !== 0) {
    return dateComparison;
  }

  if (a.type !== b.type) {
    return a.type === "planned" ? -1 : 1;
  }

  return a.id - b.id;
}

function listScopedFunds(db: Database.Database, fiscalYear: number) {
  return db
    .prepare(
      `
      SELECT id, name, fiscal_year AS fiscalYear
      FROM funds
      WHERE fiscal_year = ?
      ORDER BY display_order, id
      `,
    )
    .all(fiscalYear) as SearchFundRow[];
}

function listScopedCategories(db: Database.Database, fiscalYear: number) {
  return db
    .prepare(
      `
      SELECT c.id, c.fund_id AS fundId, c.name
      FROM categories c
      INNER JOIN funds f ON f.id = c.fund_id
      WHERE f.fiscal_year = ?
      ORDER BY f.display_order, f.id, c.display_order, c.id
      `,
    )
    .all(fiscalYear) as SearchCategoryRow[];
}

function listAuxiliaryLabels(db: Database.Database) {
  return db
    .prepare(
      `
      SELECT id, kind, name, color
      FROM classification_tags
      WHERE kind = 'auxiliary'
      ORDER BY id
      `,
    )
    .all() as SearchAuxiliaryLabel[];
}

function listAuxiliaryAssignments(db: Database.Database, fiscalYear: number) {
  return db
    .prepare(
      `
      SELECT ca.target_type AS targetType, ca.target_id AS targetId, t.id, t.kind, t.name, t.color
      FROM classification_assignments ca
      INNER JOIN classification_tags t ON t.id = ca.tag_id
      WHERE t.kind = 'auxiliary'
        AND (
          (ca.target_type = 'fund' AND ca.target_id IN (
            SELECT id FROM funds WHERE fiscal_year = @fiscalYear
          ))
          OR (ca.target_type = 'planned_item' AND ca.target_id IN (
            SELECT p.id FROM planned_items p INNER JOIN funds f ON f.id = p.fund_id WHERE f.fiscal_year = @fiscalYear
          ))
          OR (ca.target_type = 'actual_entry' AND ca.target_id IN (
            SELECT ae.id FROM actual_entries ae INNER JOIN funds f ON f.id = ae.fund_id WHERE f.fiscal_year = @fiscalYear
          ))
        )
      ORDER BY t.id
      `,
    )
    .all({ fiscalYear }) as Array<SearchAuxiliaryLabel & { targetType: string; targetId: number }>;
}

function buildAuxiliaryLabelLookup(db: Database.Database, fiscalYear: number) {
  const direct = {
    fund: new Map<number, SearchAuxiliaryLabel[]>(),
    planned_item: new Map<number, SearchAuxiliaryLabel[]>(),
    actual_entry: new Map<number, SearchAuxiliaryLabel[]>(),
  };

  for (const assignment of listAuxiliaryAssignments(db, fiscalYear)) {
    if (
      assignment.targetType !== "fund" &&
      assignment.targetType !== "planned_item" &&
      assignment.targetType !== "actual_entry"
    ) {
      continue;
    }

    const map = direct[assignment.targetType];
    const labels = map.get(assignment.targetId) ?? [];
    labels.push({
      id: assignment.id,
      kind: "auxiliary",
      name: assignment.name,
      color: assignment.color,
    });
    map.set(assignment.targetId, labels);
  }

  return {
    forResult(targetType: "planned_item" | "actual_entry", targetId: number, fundId: number) {
      const inheritedLabels = direct.fund.get(fundId) ?? [];
      const directLabels = direct[targetType].get(targetId) ?? [];
      const labels = new Map<number, ResultAuxiliaryLabel>();

      for (const label of inheritedLabels) {
        labels.set(label.id, { ...label, inherited: true });
      }

      for (const label of directLabels) {
        labels.set(label.id, { ...label, inherited: false });
      }

      return Array.from(labels.values()).sort((a, b) => a.id - b.id);
    },
  };
}

function listPlannedRows(db: Database.Database, fiscalYear: number) {
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
        p.category_id AS categoryId,
        c.name AS categoryName,
        p.planned_date AS plannedDate,
        p.scheduled_month AS scheduledMonth,
        p.description,
        p.amount,
        p.status,
        p.notes,
        COALESCE(la.linked_amount, 0) AS linkedAmount
      FROM planned_items p
      INNER JOIN funds f ON f.id = p.fund_id
      INNER JOIN categories c ON c.id = p.category_id
      LEFT JOIN linked_actuals la ON la.planned_item_id = p.id
      WHERE f.fiscal_year = ?
      `,
    )
    .all(fiscalYear) as PlannedSearchRow[];
}

function listActualRows(db: Database.Database, fiscalYear: number) {
  return db
    .prepare(
      `
      SELECT
        ae.id,
        ae.fund_id AS fundId,
        f.name AS fundName,
        ae.category_id AS categoryId,
        c.name AS categoryName,
        ae.planned_item_id AS plannedItemId,
        ae.actual_date AS actualDate,
        ae.description,
        ae.amount,
        ae.notes
      FROM actual_entries ae
      INNER JOIN funds f ON f.id = ae.fund_id
      INNER JOIN categories c ON c.id = ae.category_id
      WHERE f.fiscal_year = ?
      `,
    )
    .all(fiscalYear) as ActualSearchRow[];
}

function plannedStatusLabel(status: string, remainingAmount: number) {
  if (status === "cancelled") {
    return "取消";
  }

  return remainingAmount > 0 ? `未精算 ${formatYen(remainingAmount)}` : "精算済み";
}

function toPlannedResult(
  row: PlannedSearchRow,
  fiscalYear: number,
  auxiliaryLabels: ResultAuxiliaryLabel[],
): CrossFundSearchResult {
  const remainingAmount = row.status === "planned" ? Math.max(row.amount - row.linkedAmount, 0) : 0;

  return {
    id: row.id,
    type: "planned",
    fundId: row.fundId,
    fundName: row.fundName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    date: row.plannedDate,
    month: row.scheduledMonth,
    description: row.description,
    notes: row.notes,
    amount: row.amount,
    remainingAmount,
    statusLabel: plannedStatusLabel(row.status, remainingAmount),
    detailHref: `/funds/${row.fundId}?year=${fiscalYear}&focus=planned-${row.id}`,
    auxiliaryLabels,
  };
}

function toActualResult(
  row: ActualSearchRow,
  fiscalYear: number,
  auxiliaryLabels: ResultAuxiliaryLabel[],
): CrossFundSearchResult {
  return {
    id: row.id,
    type: "actual",
    fundId: row.fundId,
    fundName: row.fundName,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    date: row.actualDate,
    month: toMonth(row.actualDate),
    description: row.description,
    notes: row.notes,
    amount: row.amount,
    remainingAmount: null,
    statusLabel: row.plannedItemId === null ? "未連携" : "連携済み",
    detailHref: `/funds/${row.fundId}?year=${fiscalYear}&focus=actual-${row.id}`,
    auxiliaryLabels,
  };
}

function matchesNonTabFilters(result: CrossFundSearchResult, options: CrossFundSearchOptions) {
  if (options.keyword !== undefined && !includesKeyword(result, options.keyword)) {
    return false;
  }

  if (options.fundId !== undefined && result.fundId !== options.fundId) {
    return false;
  }

  if (options.categoryId !== undefined && result.categoryId !== options.categoryId) {
    return false;
  }

  if (
    options.auxiliaryLabelId !== undefined &&
    !result.auxiliaryLabels.some((label) => label.id === options.auxiliaryLabelId)
  ) {
    return false;
  }

  if (options.entryType !== undefined && result.type !== options.entryType) {
    return false;
  }

  if (options.monthFrom !== undefined && result.month < options.monthFrom) {
    return false;
  }

  if (options.monthTo !== undefined && result.month > options.monthTo) {
    return false;
  }

  return true;
}

function matchesTab(result: CrossFundSearchResult, tab: CrossFundSearchTab, currentMonth: string) {
  switch (tab) {
    case "overdue":
      return result.type === "planned" && result.month < currentMonth && (result.remainingAmount ?? 0) > 0;
    case "unsettled":
      return result.type === "planned" && (result.remainingAmount ?? 0) > 0;
    case "unlinked":
      return result.type === "actual" && result.statusLabel === "未連携";
    case "all":
      return true;
  }
}

export function getCrossFundSearchSnapshot(
  db: Database.Database,
  options: CrossFundSearchOptions = {},
): CrossFundSearchSnapshot {
  const availableFiscalYears = listAvailableFiscalYears(db);
  const selectedFiscalYear = resolveFiscalYear(availableFiscalYears, options);

  if (selectedFiscalYear === null) {
    return {
      availableFiscalYears,
      selectedFiscalYear,
      filters: { funds: [], categories: [], auxiliaryLabels: [] },
      counts: { all: 0, overdue: 0, unsettled: 0, unlinked: 0 },
      resultLimit: RESULT_LIMIT,
      totalResultCount: 0,
      results: [],
    };
  }

  const currentMonth = toCurrentMonth(options.today ?? new Date());
  const tab = options.tab ?? "all";
  const funds = listScopedFunds(db, selectedFiscalYear).map(({ id, name }) => ({ id, name }));
  const categories = listScopedCategories(db, selectedFiscalYear);
  const auxiliaryLabels = listAuxiliaryLabels(db);
  const auxiliaryLabelLookup = buildAuxiliaryLabelLookup(db, selectedFiscalYear);
  const allResults = [
    ...listPlannedRows(db, selectedFiscalYear).map((row) =>
      toPlannedResult(
        row,
        selectedFiscalYear,
        auxiliaryLabelLookup.forResult("planned_item", row.id, row.fundId),
      ),
    ),
    ...listActualRows(db, selectedFiscalYear).map((row) =>
      toActualResult(
        row,
        selectedFiscalYear,
        auxiliaryLabelLookup.forResult("actual_entry", row.id, row.fundId),
      ),
    ),
  ].filter((result) => result.type === "actual" || (result.remainingAmount ?? 0) > 0);
  const filteredForCounts = allResults.filter((result) => matchesNonTabFilters(result, options));
  const counts = Object.fromEntries(
    SEARCH_TABS.map((searchTab) => [
      searchTab,
      filteredForCounts.filter((result) => matchesTab(result, searchTab, currentMonth)).length,
    ]),
  ) as Record<CrossFundSearchTab, number>;
  const results = filteredForCounts
    .filter((result) => matchesTab(result, tab, currentMonth))
    .sort(compareResults);

  return {
    availableFiscalYears,
    selectedFiscalYear,
    filters: {
      funds,
      categories,
      auxiliaryLabels,
    },
    counts,
    resultLimit: RESULT_LIMIT,
    totalResultCount: results.length,
    results: results.slice(0, RESULT_LIMIT),
  };
}

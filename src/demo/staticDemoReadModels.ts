import type { StaticDemoState } from "./staticDemoData";
import { CROSS_AGGREGATE_CATEGORY_CODES } from "../contracts/crossAggregateCategory";
import type { CrossAggregateCategory } from "../contracts/crossAggregateCategory";
import type { FiscalYearComparisonResponse } from "../contracts/fiscalYearComparison";
import { buildMonthlySummaryAmounts, type MonthlySummaryResponse } from "../contracts/monthlySummary";
import type { HeaderAlertCategory, HeaderAlertDetail, HeaderAlertItem } from "../contracts/headerAlerts";
import { toHeaderYearEndRisks } from "../contracts/headerAlerts";
import { buildYearEndRiskSummary, defaultYearEndRiskThresholds } from "../contracts/yearEndRisk";
import { formatTokyoMonthKey, inferJapaneseFiscalYear } from "../lib/calendar";
import { readStaticDemoState } from "./staticDemoState";
import { assignedStaticTags, auxiliaryLabelsForSearchResult, compareSearchResults, getCategoryCrossAggregateCategory, getFundActualAmount, getFundCommittedAmount, getOverviewMonthlyStatus, getPlannedStatusLabel, getRemainingPlannedAmount, getStaticFundOverduePlannedAmountMap, getStaticMonthlyMovements, getStaticOverviewCrossAggregateCategories, listAvailableFiscalYears, listStaticClassifications, matchesSearchFilters, matchesSearchTab, requireCategoryForFund, requireFund, resolveFiscalYear, sortCategories, sortFunds, sumBudgetLines, toFreeBalance, type StaticSearchOptions, type StaticSearchResult } from "./staticDemoDomain";
const DEMO_IMPORTED_AT = "2026-04-23T00:00:00.000Z"; const DEMO_WORKBOOK_FILENAME = "demo-budget.xlsx"; const SEARCH_RESULT_LIMIT = 200; const HEADER_ALERT_ITEM_LIMIT = 3;
export function getStaticFiscalYearComparisonSnapshot(): FiscalYearComparisonResponse {
  const state = readStaticDemoState();
  const currentFiscalYear = inferJapaneseFiscalYear(new Date());

  return {
    currentFiscalYear,
    fiscalYears: listAvailableFiscalYears(state).sort((a, b) => b - a).map((fiscalYear) => {
      const funds = state.funds.filter((fund) => fund.fiscal_year === fiscalYear);
      const totals = funds.reduce(
        (sum, fund) => ({
          assets: sum.assets + fund.awarded_amount,
          committed: sum.committed + getFundCommittedAmount(state, fund.id),
          actual: sum.actual + getFundActualAmount(state, fund.id),
        }),
        { assets: 0, committed: 0, actual: 0 },
      );
      const categories = new Map(
        getStaticOverviewCrossAggregateCategories(state, fiscalYear).map((row) => [
          row.crossAggregateCategory,
          row,
        ]),
      );

      return {
        fiscalYear,
        state: fiscalYear < currentFiscalYear
          ? "past" as const
          : fiscalYear > currentFiscalYear
            ? "future" as const
            : "current" as const,
        totals,
        crossAggregateCategories: CROSS_AGGREGATE_CATEGORY_CODES.map((crossAggregateCategory) => {
          const category = categories.get(crossAggregateCategory);
          return {
            crossAggregateCategory,
            plannedAmount: category?.plannedAmount ?? 0,
            actualAmount: category?.actualAmount ?? 0,
          };
        }),
        monthlyStatus: getOverviewMonthlyStatus(state, totals.assets, fiscalYear).map((row) => ({
          month: row.month,
          committed: row.committed,
          actual: row.actual,
        })),
      };
    }),
  };
}
export function getStaticOverviewSnapshot(requestedFiscalYear?: number) {
  const state = readStaticDemoState();
  const availableFiscalYears = listAvailableFiscalYears(state);
  const selectedFiscalYear = resolveFiscalYear(state, requestedFiscalYear);
  const scopedFunds = selectedFiscalYear === null
    ? []
    : state.funds.filter((fund) => fund.fiscal_year === selectedFiscalYear);
  const funds = sortFunds(scopedFunds).map((fund) => {
    const committed_amount = getFundCommittedAmount(state, fund.id);
    const actual_amount = getFundActualAmount(state, fund.id);
    return {
      id: fund.id,
      fund_code: fund.fund_code,
      name: fund.name,
      awarded_amount: fund.awarded_amount,
      committed_amount,
      actual_amount,
      freeBalance: toFreeBalance(fund.awarded_amount, committed_amount, actual_amount),
      projectTags: assignedStaticTags(state, "fund", fund.id).filter((tag) => tag.kind === "project"),
    };
  });
  const totals = {
    assets: funds.reduce((sum, fund) => sum + fund.awarded_amount, 0),
    committed: funds.reduce((sum, fund) => sum + fund.committed_amount, 0),
    actual: funds.reduce((sum, fund) => sum + fund.actual_amount, 0),
  };

  return {
    availableFiscalYears,
    selectedFiscalYear,
    totals: {
      ...totals,
      freeBalance: toFreeBalance(totals.assets, totals.committed, totals.actual),
    },
    linkedActualAmount: state.actual_entries
      .filter((entry) => {
        const fund = state.funds.find((row) => row.id === entry.fund_id);
        return entry.planned_item_id !== null && fund?.fiscal_year === selectedFiscalYear;
      })
      .reduce((sum, entry) => sum + entry.amount, 0),
    pendingPlannedCount: state.planned_items.filter((item) => {
      const fund = state.funds.find((row) => row.id === item.fund_id);
      return item.status === "planned" && fund?.fiscal_year === selectedFiscalYear;
    }).length,
    crossAggregateCategories: selectedFiscalYear === null
      ? []
      : getStaticOverviewCrossAggregateCategories(state, selectedFiscalYear),
    yearEndRisk: buildYearEndRiskSummary(
      funds,
      selectedFiscalYear === null
        ? new Map()
        : getStaticFundOverduePlannedAmountMap(state, selectedFiscalYear, new Date()),
      defaultYearEndRiskThresholds,
    ),
    monthlyStatus: selectedFiscalYear === null ? [] : getOverviewMonthlyStatus(state, totals.assets, selectedFiscalYear),
    latestImport: {
      id: 1,
      source_filename: DEMO_WORKBOOK_FILENAME,
      imported_at: DEMO_IMPORTED_AT,
      warning_count: 0,
      reconciliation_ok: true,
    },
    tutorial: {
      eligibleDemoData: true,
    },
    funds,
  };
}

export function getStaticMonthlySummarySnapshot(fiscalYear: number, month: string): MonthlySummaryResponse {
  const state = readStaticDemoState();
  const scopedFunds = sortFunds(state.funds.filter((fund) => fund.fiscal_year === fiscalYear));
  const scopedFundIds = new Set(scopedFunds.map((fund) => fund.id));
  const totalBudgetAmount = scopedFunds.reduce((sum, fund) => sum + fund.awarded_amount, 0);
  const crossAggregateCategories = getStaticOverviewCrossAggregateCategories(state, fiscalYear);

  return {
    fiscalYear,
    month,
    calculationBasis: "current_data",
    summary: buildMonthlySummaryAmounts(
      totalBudgetAmount,
      fiscalYear,
      month,
      getStaticMonthlyMovements(state, scopedFundIds),
    ),
    funds: scopedFunds.map((fund) => ({
      fundId: fund.id,
      fundName: fund.name,
      ...buildMonthlySummaryAmounts(
        fund.awarded_amount,
        fiscalYear,
        month,
        getStaticMonthlyMovements(state, new Set([fund.id])),
      ),
    })),
    crossAggregateCategories: crossAggregateCategories.map((category) => ({
      crossAggregateCategory: category.crossAggregateCategory,
      ...buildMonthlySummaryAmounts(
        category.budgetAmount ?? 0,
        fiscalYear,
        month,
        getStaticMonthlyMovements(
          state,
          scopedFundIds,
          category.crossAggregateCategory,
        ),
      ),
    })),
  };
}

export function getStaticSearchSnapshot(options: StaticSearchOptions = {}) {
  const state = readStaticDemoState();
  const availableFiscalYears = listAvailableFiscalYears(state);
  const selectedFiscalYear = resolveFiscalYear(state, options.fiscalYear);

  if (selectedFiscalYear === null) {
    return {
      availableFiscalYears,
      selectedFiscalYear,
      filters: { funds: [], categories: [], auxiliaryLabels: [] },
      counts: { all: 0, overdue: 0, unsettled: 0, unlinked: 0 },
      resultLimit: SEARCH_RESULT_LIMIT,
      totalResultCount: 0,
      results: [],
    };
  }

  const scopedFunds = sortFunds(state.funds.filter((fund) => fund.fiscal_year === selectedFiscalYear));
  const scopedFundIds = new Set(scopedFunds.map((fund) => fund.id));
  const scopedCategories = sortCategories(
    state.categories.filter((category) => scopedFundIds.has(category.fund_id)),
  );
  const results: StaticSearchResult[] = [
    ...state.planned_items
      .filter((item) => scopedFundIds.has(item.fund_id))
      .map((item) => {
        const fund = requireFund(state, item.fund_id);
        const category = requireCategoryForFund(state, item.fund_id, item.category_id);
        const remainingAmount = item.status === "planned" ? getRemainingPlannedAmount(state, item) : 0;
        return {
          id: item.id,
          type: "planned" as const,
          fundId: item.fund_id,
          fundName: fund.name,
          categoryId: item.category_id,
          categoryName: category.name,
          date: item.planned_date,
          month: item.scheduled_month,
          description: item.description,
          notes: item.notes,
          amount: item.amount,
          remainingAmount,
          statusLabel: getPlannedStatusLabel(item.status, remainingAmount),
          detailHref: `/funds/${item.fund_id}?year=${selectedFiscalYear}&focus=planned-${item.id}`,
          auxiliaryLabels: auxiliaryLabelsForSearchResult(state, "planned_item", item.id, item.fund_id),
        };
      }),
    ...state.actual_entries
      .filter((entry) => scopedFundIds.has(entry.fund_id))
      .map((entry) => {
        const fund = requireFund(state, entry.fund_id);
        const category = requireCategoryForFund(state, entry.fund_id, entry.category_id);
        return {
          id: entry.id,
          type: "actual" as const,
          fundId: entry.fund_id,
          fundName: fund.name,
          categoryId: entry.category_id,
          categoryName: category.name,
          date: entry.actual_date,
          month: entry.actual_date.slice(0, 7),
          description: entry.description,
          notes: entry.notes,
          amount: entry.amount,
          remainingAmount: null,
          statusLabel: entry.planned_item_id === null ? "未連携" : "連携済み",
          detailHref: `/funds/${entry.fund_id}?year=${selectedFiscalYear}&focus=actual-${entry.id}`,
          auxiliaryLabels: auxiliaryLabelsForSearchResult(state, "actual_entry", entry.id, entry.fund_id),
        };
      }),
  ].filter((result) => result.type === "actual" || result.statusLabel === "完了" || (result.remainingAmount ?? 0) > 0);
  const tab = options.tab ?? "all";
  const comparisonMonth = formatTokyoMonthKey(options.today ?? new Date());
  const filteredForCounts = results.filter((result) => matchesSearchFilters(result, options));
  const counts = {
    all: filteredForCounts.filter((result) => matchesSearchTab(result, "all", comparisonMonth)).length,
    overdue: filteredForCounts.filter((result) => matchesSearchTab(result, "overdue", comparisonMonth)).length,
    unsettled: filteredForCounts.filter((result) => matchesSearchTab(result, "unsettled", comparisonMonth)).length,
    unlinked: filteredForCounts.filter((result) => matchesSearchTab(result, "unlinked", comparisonMonth)).length,
  };

  return {
    availableFiscalYears,
    selectedFiscalYear,
    filters: {
      funds: scopedFunds.map(({ id, name }) => ({ id, name })),
      categories: scopedCategories.map(({ id, fund_id, name }) => ({ id, fundId: fund_id, name })),
      auxiliaryLabels: state.classification_tags
        .filter((tag) => tag.kind === "auxiliary")
        .sort((a, b) => a.id - b.id),
    },
    counts,
    resultLimit: SEARCH_RESULT_LIMIT,
    totalResultCount: filteredForCounts.filter((result) => matchesSearchTab(result, tab, comparisonMonth)).length,
    results: filteredForCounts
      .filter((result) => matchesSearchTab(result, tab, comparisonMonth))
      .sort(compareSearchResults)
      .slice(0, SEARCH_RESULT_LIMIT),
  };
}

function createStaticAlertCategory(
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
    items: items.slice(0, HEADER_ALERT_ITEM_LIMIT),
  };
}

function compactStaticAlertCategories(categories: Array<HeaderAlertCategory | null>) {
  return categories.filter((category): category is HeaderAlertCategory => category !== null);
}

type StaticFundGroupedDetailRow = {
  fundId: number;
  fundName: string;
  detail: HeaderAlertDetail;
};

function groupStaticAlertDetailsByFund(rows: StaticFundGroupedDetailRow[], fiscalYear: number): HeaderAlertItem[] {
  const itemsByFundId = new Map<number, HeaderAlertItem>();

  for (const row of rows) {
    const current = itemsByFundId.get(row.fundId);

    if (current === undefined) {
      itemsByFundId.set(row.fundId, {
        id: `fund-${row.fundId}`,
        title: row.fundName,
        href: `/funds/${row.fundId}?year=${fiscalYear}`,
        details: [row.detail],
      });
      continue;
    }

    current.details?.push(row.detail);
  }

  return Array.from(itemsByFundId.values());
}

function getStaticBudgetOverrunCategory(state: StaticDemoState, fiscalYear: number) {
  const rows = sortFunds(state.funds.filter((fund) => fund.fiscal_year === fiscalYear))
    .flatMap((fund) =>
      sortCategories(state.categories.filter((category) => category.fund_id === fund.id))
        .map((category) => {
          const budgetAmount = sumBudgetLines(state.budget_lines.filter((line) => line.category_id === category.id));
          if (budgetAmount === null) {
            return null;
          }

          const plannedAmount = state.planned_items
            .filter((item) => item.category_id === category.id && item.status === "planned")
            .reduce((sum, item) => sum + getRemainingPlannedAmount(state, item), 0);
          const actualAmount = state.actual_entries
            .filter((entry) => entry.category_id === category.id)
            .reduce((sum, entry) => sum + entry.amount, 0);
          const amount = budgetAmount - plannedAmount - actualAmount;

          if (amount >= 0) {
            return null;
          }

          return {
            id: `${fund.id}-${category.id}`,
            fundId: fund.id,
            fundName: fund.name,
            categoryName: category.name,
            amount,
          };
        })
        .filter((row): row is NonNullable<typeof row> => row !== null),
    )
    .sort((left, right) => left.amount - right.amount);

  return createStaticAlertCategory(
    "budget_overrun",
    "予算超過",
    "danger",
    rows.length,
    groupStaticAlertDetailsByFund(
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

function getStaticYearEndRiskCategory(state: StaticDemoState, fiscalYear: number) {
  const overview = getStaticOverviewSnapshot(fiscalYear);

  return createStaticAlertCategory(
    "year_end_risk",
    "年度末注意",
    "warning",
    overview.yearEndRisk.riskFundCount,
    overview.yearEndRisk.risks.map((risk) => ({
      id: `fund-${risk.fundId}`,
      title: risk.fundName,
      href: `/funds/${risk.fundId}?year=${fiscalYear}`,
      yearEndRisks: toHeaderYearEndRisks(risk),
    })),
  );
}

function getStaticSearchAlertCategory(
  snapshot: ReturnType<typeof getStaticSearchSnapshot>,
  key: "overdue",
  label: string,
  severity: HeaderAlertCategory["severity"],
  fiscalYear: number,
) {
  const items = groupStaticAlertDetailsByFund(
    snapshot.results.map((result) => ({
      fundId: result.fundId,
      fundName: result.fundName,
      detail: {
        id: `${result.type}-${result.id}`,
        label: result.month,
        labelTone: key,
        title: result.description,
        amount: result.remainingAmount ?? result.amount,
      },
    })),
    fiscalYear,
  );

  return createStaticAlertCategory(key, label, severity, snapshot.totalResultCount, items);
}

export function getStaticHeaderAlertsSnapshot(requestedFiscalYear?: number) {
  const state = readStaticDemoState();
  const availableFiscalYears = listAvailableFiscalYears(state);
  const selectedFiscalYear = resolveFiscalYear(state, requestedFiscalYear);

  if (selectedFiscalYear === null) {
    return {
      availableFiscalYears,
      selectedFiscalYear,
      primary: [],
      supporting: [],
    };
  }

  const overdue = getStaticSearchSnapshot({ fiscalYear: selectedFiscalYear, tab: "overdue" });

  return {
    availableFiscalYears,
    selectedFiscalYear,
    primary: compactStaticAlertCategories([
      getStaticBudgetOverrunCategory(state, selectedFiscalYear),
      getStaticSearchAlertCategory(overdue, "overdue", "期限超過", "warning", selectedFiscalYear),
      getStaticYearEndRiskCategory(state, selectedFiscalYear),
    ]),
    supporting: [],
  };
}

function getStaticImportCounts(state: StaticDemoState) {
  return {
    funds: state.funds.length,
    categories: state.categories.length,
    budget_lines: state.budget_lines.length,
    planned_items: state.planned_items.filter((item) => item.status === "planned").length,
    actual_entries: state.actual_entries.length,
    warnings: 0,
  };
}

function getStaticImportMappingSummary(state: StaticDemoState) {
  return {
    mode: "initial" as const,
    counts: getStaticImportCounts(state),
    warning_count_by_code: {},
  };
}

function getStaticReconciliationReport(state: StaticDemoState) {
  const overview = getStaticOverviewSnapshot();
  const overall = {
    assets: overview.totals.assets,
    planned: overview.totals.committed,
    actual: overview.totals.actual,
    free_balance: overview.totals.freeBalance,
  };

  return {
    workbook_path: "static-demo://demo-budget.xlsx",
    db_path: "static-demo://browser-local",
    ok: true,
    overall: {
      expected: overall,
      actual: overall,
    },
    funds: overview.funds.map((fund) => {
      const fundSummary = {
        assets: fund.awarded_amount,
        planned: fund.committed_amount,
        actual: fund.actual_amount,
        free_balance: fund.freeBalance,
      };

      return {
        fund_code: state.funds.find((row) => row.id === fund.id)?.fund_code ?? `fund-${fund.id}`,
        fund_name: fund.name,
        expected: fundSummary,
        actual: fundSummary,
      };
    }),
    mismatches: [],
  };
}

export function getStaticImportHistory() {
  const state = readStaticDemoState();

  return [
    {
      id: 1,
      source_filename: DEMO_WORKBOOK_FILENAME,
      imported_at: DEMO_IMPORTED_AT,
      warning_count: 0,
      reconciliation_ok: true,
      mapping_summary: getStaticImportMappingSummary(state),
    },
  ];
}

export function getStaticImportDetail(importId: number) {
  if (importId !== 1) {
    return undefined;
  }

  const state = readStaticDemoState();

  return {
    id: 1,
    source_filename: DEMO_WORKBOOK_FILENAME,
    imported_at: DEMO_IMPORTED_AT,
    warning_count: 0,
    mapping_summary: getStaticImportMappingSummary(state),
    warnings: [],
    reconciliation: getStaticReconciliationReport(state),
  };
}

export function getStaticFundSnapshot(fundId: number) {
  const state = readStaticDemoState();
  const fund = state.funds.find((row) => row.id === fundId);
  if (fund === undefined) {
    return {
      fund: undefined,
      categories: [],
      monthlyStatus: [],
      actualEntries: [],
      plannedItems: [],
      plannedItemHistory: [],
    };
  }

  const categories = sortCategories(state.categories.filter((category) => category.fund_id === fundId));
  const categorySnapshots = categories.map((category) => {
    const budgetAmount = sumBudgetLines(
      state.budget_lines.filter((line) => line.category_id === category.id),
    );
    const plannedAmount = state.planned_items
      .filter((item) => item.category_id === category.id && item.status === "planned")
      .reduce((sum, item) => sum + getRemainingPlannedAmount(state, item), 0);
    const actualAmount = state.actual_entries
      .filter((entry) => entry.category_id === category.id)
      .reduce((sum, entry) => sum + entry.amount, 0);

    return {
      id: category.id,
      categoryCode: category.category_code,
      categoryName: category.name,
      crossAggregateCategory: getCategoryCrossAggregateCategory(category),
      budgetAmount,
      plannedAmount,
      actualAmount,
    };
  });
  const crossAggregateCategories = Array.from(
    categorySnapshots.reduce(
      (rowsByCategory, category) => {
        const current = rowsByCategory.get(category.crossAggregateCategory) ?? {
          crossAggregateCategory: category.crossAggregateCategory,
          budgetAmount: null,
          plannedAmount: 0,
          actualAmount: 0,
        };
        current.budgetAmount =
          current.budgetAmount === null && category.budgetAmount === null
            ? null
            : (current.budgetAmount ?? 0) + (category.budgetAmount ?? 0);
        current.plannedAmount += category.plannedAmount;
        current.actualAmount += category.actualAmount;
        rowsByCategory.set(category.crossAggregateCategory, current);
        return rowsByCategory;
      },
      new Map<
        CrossAggregateCategory,
        {
          crossAggregateCategory: CrossAggregateCategory;
          budgetAmount: number | null;
          plannedAmount: number;
          actualAmount: number;
        }
      >(),
    ).values(),
  );
  const monthlyStatus = getFundMonthlyStatus(state, fundId);
  const plannedItemHistory = state.planned_items
    .filter((item) => item.fund_id === fundId && (item.status === "cancelled" || item.status === "completed"))
    .map((item) => {
      const category = requireCategoryForFund(state, item.fund_id, item.category_id);
      return {
      id: item.id,
      plannedDate: item.planned_date,
      scheduledMonth: item.scheduled_month,
      categoryId: item.category_id,
      categoryCode: category.category_code,
      categoryName: category.name,
      description: item.description,
      amount: item.amount,
      remainingAmount: item.status === "completed" ? getRemainingPlannedAmount(state, item) : 0,
      status: item.status,
      notes: item.notes,
      auxiliaryLabels: assignedStaticTags(state, "planned_item", item.id).filter((tag) => tag.kind === "auxiliary"),
      };
    })
    .sort((a, b) => b.scheduledMonth.localeCompare(a.scheduledMonth) || b.id - a.id);

  return {
    fund: {
      id: fund.id,
      name: fund.name,
      fiscalYear: fund.fiscal_year,
      awarded_amount: fund.awarded_amount,
      notes: fund.notes,
      projectTags: assignedStaticTags(state, "fund", fund.id).filter((tag) => tag.kind === "project"),
      auxiliaryLabels: assignedStaticTags(state, "fund", fund.id).filter((tag) => tag.kind === "auxiliary"),
    },
    categories: categorySnapshots,
    crossAggregateCategories,
    monthlyStatus,
    actualEntries: state.actual_entries
      .filter((entry) => entry.fund_id === fundId)
      .sort((a, b) => b.actual_date.localeCompare(a.actual_date) || b.id - a.id)
      .map((entry) => {
        const category = requireCategoryForFund(state, entry.fund_id, entry.category_id);
        return {
        id: entry.id,
        actualDate: entry.actual_date,
        categoryId: entry.category_id,
        categoryCode: category.category_code,
        categoryName: category.name,
        description: entry.description,
        amount: entry.amount,
        notes: entry.notes,
        auxiliaryLabels: assignedStaticTags(state, "actual_entry", entry.id).filter((tag) => tag.kind === "auxiliary"),
        };
      }),
    plannedItems: state.planned_items
      .filter((item) => item.fund_id === fundId && item.status === "planned")
      .map((item) => {
        const category = requireCategoryForFund(state, item.fund_id, item.category_id);
        return {
        id: item.id,
        plannedDate: item.planned_date,
        scheduledMonth: item.scheduled_month,
        categoryId: item.category_id,
        categoryCode: category.category_code,
        categoryName: category.name,
        description: item.description,
        amount: getRemainingPlannedAmount(state, item),
        notes: item.notes,
        auxiliaryLabels: assignedStaticTags(state, "planned_item", item.id).filter((tag) => tag.kind === "auxiliary"),
        };
      })
      .filter((item) => item.amount > 0)
      .sort((a, b) => a.scheduledMonth.localeCompare(b.scheduledMonth) || a.categoryId - b.categoryId || a.id - b.id),
    plannedItemHistory,
  };
}

function getFundMonthlyStatus(state: StaticDemoState, fundId: number) {
  const byMonth = new Map<string, { month: string; plannedAmount: number; actualAmount: number }>();

  for (const item of state.planned_items) {
    if (item.fund_id !== fundId || item.status !== "planned") {
      continue;
    }

    const current = byMonth.get(item.scheduled_month) ?? {
      month: item.scheduled_month,
      plannedAmount: 0,
      actualAmount: 0,
    };
    current.plannedAmount += getRemainingPlannedAmount(state, item);
    byMonth.set(item.scheduled_month, current);
  }

  for (const entry of state.actual_entries) {
    if (entry.fund_id !== fundId) {
      continue;
    }

    const month = entry.actual_date.slice(0, 7);
    const current = byMonth.get(month) ?? { month, plannedAmount: 0, actualAmount: 0 };
    current.actualAmount += entry.amount;
    byMonth.set(month, current);
  }

  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((row) => ({
      ...row,
      totalAmount: row.plannedAmount + row.actualAmount,
    }));
}

export function getStaticClassifications() {
  return listStaticClassifications(readStaticDemoState());
}

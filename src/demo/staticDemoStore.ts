import {
  cloneStaticDemoSeedState,
  type StaticDemoActualEntry,
  type StaticDemoBudgetLine,
  type StaticDemoCategory,
  type StaticDemoClassificationTag,
  type StaticDemoFund,
  type StaticDemoPlannedItem,
  type StaticDemoState,
} from "./staticDemoData";
import {
  isCrossAggregateCategory,
  type CrossAggregateCategory,
} from "../contracts/crossAggregateCategory";
import type {
  HeaderAlertCategory,
  HeaderAlertDetail,
  HeaderAlertItem,
} from "../contracts/headerAlerts";
import { toHeaderYearEndRisks } from "../contracts/headerAlerts";
import {
  buildYearEndRiskSummary,
  defaultYearEndRiskThresholds,
} from "../contracts/yearEndRisk";

const STORAGE_KEY = "budget-dashboard.static-demo.v1";
const DEMO_IMPORTED_AT = "2026-04-23T00:00:00.000Z";
const DEMO_WORKBOOK_FILENAME = "demo-budget.xlsx";
const SEARCH_RESULT_LIMIT = 200;
const HEADER_ALERT_ITEM_LIMIT = 3;

export type FundInput = {
  name: string;
  fiscalYear: number;
  awardedAmount: number;
  notes: string;
  projectTagIds?: number[];
  auxiliaryLabelIds?: number[];
  categories: Array<{
    id?: number;
    name: string;
    amount: number;
    crossAggregateCategory: CrossAggregateCategory;
  }>;
};

export type PlannedItemInput = {
  fundId: number;
  categoryId: number;
  plannedDate: string;
  scheduledMonth: string;
  description: string;
  amount: number;
  notes: string;
  auxiliaryLabelIds?: number[];
};

export type BulkPlannedItemsInput = {
  fundId: number;
  categoryId: number;
  plannedDate: string;
  notes: string;
  auxiliaryLabelIds?: number[];
  items: Array<{
    scheduledMonth: string;
    description: string;
    amount: number;
  }>;
};

export type PlannedItemEditInput = Omit<PlannedItemInput, "plannedDate">;

export type ActualEntryInput = {
  fundId: number;
  categoryId: number;
  plannedItemId?: number;
  actualDate: string;
  description: string;
  amount: number;
  notes: string;
  auxiliaryLabelIds?: number[];
  keepRemainingPlanned?: boolean;
};

export type ActualEntryEditInput = Omit<ActualEntryInput, "plannedItemId" | "keepRemainingPlanned">;
type StaticSearchTab = "all" | "overdue" | "unsettled" | "unlinked";
type StaticSearchEntryType = "planned" | "actual";

export type StaticSearchOptions = {
  fiscalYear?: number;
  tab?: StaticSearchTab;
  keyword?: string;
  fundId?: number;
  categoryId?: number;
  auxiliaryLabelId?: number;
  entryType?: StaticSearchEntryType;
  monthFrom?: string;
  monthTo?: string;
  today?: Date;
};

type StaticSearchResult = {
  id: number;
  type: StaticSearchEntryType;
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
  auxiliaryLabels: Array<{ id: number; kind: "auxiliary"; name: string; color: string; inherited: boolean }>;
};

type StaticOverviewFund = {
  id: number;
  fund_code: string | null;
  name: string;
  awarded_amount: number;
  committed_amount: number;
  actual_amount: number;
  freeBalance: number;
  projectTags: StaticDemoClassificationTag[];
};

function cloneState(state: StaticDemoState): StaticDemoState {
  return structuredClone(state);
}

function localStorageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function resetStaticDemoStore() {
  if (localStorageAvailable()) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

export function readStaticDemoState(): StaticDemoState {
  if (!localStorageAvailable()) {
    return cloneStaticDemoSeedState();
  }

  const rawState = window.localStorage.getItem(STORAGE_KEY);
  if (rawState === null) {
    return cloneStaticDemoSeedState();
  }

  return JSON.parse(rawState) as StaticDemoState;
}

function saveStaticDemoState(state: StaticDemoState) {
  if (localStorageAvailable()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }
}

function mutateStaticDemoState<T>(mutator: (state: StaticDemoState) => T) {
  const state = readStaticDemoState();
  const result = mutator(state);
  saveStaticDemoState(state);
  return result;
}

function nextId(rows: Array<{ id: number }>) {
  return rows.reduce((maxId, row) => Math.max(maxId, row.id), 0) + 1;
}

function requireFund(state: StaticDemoState, fundId: number) {
  const fund = state.funds.find((row) => row.id === fundId);
  if (fund === undefined) {
    throw new Error("Fund not found");
  }

  return fund;
}

function requireCategoryForFund(state: StaticDemoState, fundId: number, categoryId: number) {
  requireFund(state, fundId);
  const category = state.categories.find((row) => row.id === categoryId);
  if (category === undefined) {
    throw new Error("Category not found");
  }

  if (category.fund_id !== fundId) {
    throw new Error("Category does not belong to fund");
  }

  return category;
}

function listStaticClassifications(state: StaticDemoState) {
  return {
    projectTags: state.classification_tags.filter((tag) => tag.kind === "project"),
    auxiliaryLabels: state.classification_tags.filter((tag) => tag.kind === "auxiliary"),
  };
}

function requireTagKind(state: StaticDemoState, tagId: number, kind: "project" | "auxiliary") {
  const tag = state.classification_tags.find((row) => row.id === tagId);
  if (tag?.kind !== kind) {
    throw new Error("Invalid classification assignment");
  }

  return tag;
}

function replaceStaticAssignments(
  state: StaticDemoState,
  targetType: "fund" | "planned_item" | "actual_entry",
  targetId: number,
  kind: "project" | "auxiliary",
  tagIds: number[] = [],
) {
  const uniqueTagIds = Array.from(new Set(tagIds));
  for (const tagId of uniqueTagIds) {
    requireTagKind(state, tagId, kind);
  }

  state.classification_assignments = state.classification_assignments.filter((assignment) => {
    if (assignment.target_type !== targetType || assignment.target_id !== targetId) {
      return true;
    }

    const tag = state.classification_tags.find((row) => row.id === assignment.tag_id);
    return tag?.kind !== kind;
  });

  for (const tagId of uniqueTagIds) {
    state.classification_assignments.push({
      tag_id: tagId,
      target_type: targetType,
      target_id: targetId,
    });
  }
}

function assignedStaticTags(
  state: StaticDemoState,
  targetType: "fund" | "planned_item" | "actual_entry",
  targetId: number,
) {
  return state.classification_assignments
    .filter((assignment) => assignment.target_type === targetType && assignment.target_id === targetId)
    .flatMap((assignment) => {
      const tag = state.classification_tags.find((row) => row.id === assignment.tag_id);
      return tag === undefined ? [] : [tag];
    })
    .sort((a, b) => a.id - b.id);
}

function auxiliaryLabelsForSearchResult(
  state: StaticDemoState,
  targetType: "planned_item" | "actual_entry",
  targetId: number,
  fundId: number,
) {
  const labels = new Map<number, { id: number; kind: "auxiliary"; name: string; color: string; inherited: boolean }>();

  for (const tag of assignedStaticTags(state, "fund", fundId).filter((tag) => tag.kind === "auxiliary")) {
    labels.set(tag.id, { ...tag, kind: "auxiliary", inherited: true });
  }

  for (const tag of assignedStaticTags(state, targetType, targetId).filter((tag) => tag.kind === "auxiliary")) {
    labels.set(tag.id, { ...tag, kind: "auxiliary", inherited: false });
  }

  return Array.from(labels.values()).sort((a, b) => a.id - b.id);
}

function getLinkedActuals(state: StaticDemoState, plannedItemId: number) {
  return state.actual_entries.filter((entry) => entry.planned_item_id === plannedItemId);
}

function getRemainingPlannedAmount(state: StaticDemoState, plannedItem: StaticDemoPlannedItem) {
  const linkedAmount = getLinkedActuals(state, plannedItem.id).reduce((sum, entry) => sum + entry.amount, 0);
  return Math.max(plannedItem.amount - linkedAmount, 0);
}

function getFundCommittedAmount(state: StaticDemoState, fundId: number) {
  return state.planned_items
    .filter((item) => item.fund_id === fundId && item.status === "planned")
    .reduce((sum, item) => sum + getRemainingPlannedAmount(state, item), 0);
}

function getFundActualAmount(state: StaticDemoState, fundId: number) {
  return state.actual_entries
    .filter((entry) => entry.fund_id === fundId)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

function getStaticOverviewCrossAggregateCategories(state: StaticDemoState, fiscalYear: number) {
  const scopedFundIds = new Set(
    state.funds.filter((fund) => fund.fiscal_year === fiscalYear).map((fund) => fund.id),
  );
  const rowsByCategory = new Map<
    CrossAggregateCategory,
    {
      crossAggregateCategory: CrossAggregateCategory;
      budgetAmount: number | null;
      plannedAmount: number;
      actualAmount: number;
    }
  >();

  for (const category of sortCategories(state.categories.filter((row) => scopedFundIds.has(row.fund_id)))) {
    const crossAggregateCategory = getCategoryCrossAggregateCategory(category);
    const current = rowsByCategory.get(crossAggregateCategory) ?? {
      crossAggregateCategory,
      budgetAmount: null,
      plannedAmount: 0,
      actualAmount: 0,
    };
    const categoryBudgetAmount = sumBudgetLines(
      state.budget_lines.filter((line) => line.category_id === category.id),
    );
    const plannedAmount = state.planned_items
      .filter((item) => item.category_id === category.id && item.status === "planned")
      .reduce((sum, item) => sum + getRemainingPlannedAmount(state, item), 0);
    const actualAmount = state.actual_entries
      .filter((entry) => entry.category_id === category.id)
      .reduce((sum, entry) => sum + entry.amount, 0);

    current.budgetAmount =
      current.budgetAmount === null && categoryBudgetAmount === null
        ? null
        : (current.budgetAmount ?? 0) + (categoryBudgetAmount ?? 0);
    current.plannedAmount += plannedAmount;
    current.actualAmount += actualAmount;
    rowsByCategory.set(crossAggregateCategory, current);
  }

  return Array.from(rowsByCategory.values());
}

function toFreeBalance(assets: number, committed: number, actual: number) {
  return assets - committed - actual;
}

function sumBudgetLines(lines: StaticDemoBudgetLine[]) {
  if (lines.length === 0) {
    return null;
  }

  return lines.reduce((sum, row) => sum + (row.amount ?? 0), 0);
}

function getCategoryCrossAggregateCategory(category: StaticDemoCategory) {
  return category.cross_aggregate_category;
}

function requireCrossAggregateCategory(value: unknown): CrossAggregateCategory {
  if (typeof value !== "string" || !isCrossAggregateCategory(value)) {
    throw new Error("Invalid cross aggregate category");
  }

  return value;
}

function sortFunds(funds: StaticDemoFund[]) {
  return [...funds].sort((a, b) => a.display_order - b.display_order || a.id - b.id);
}

function sortCategories(categories: StaticDemoCategory[]) {
  return [...categories].sort((a, b) => a.display_order - b.display_order || a.id - b.id);
}

function listAvailableFiscalYears(state: StaticDemoState) {
  return Array.from(new Set(state.funds.map((fund) => fund.fiscal_year))).sort((a, b) => a - b);
}

function inferJapaneseFiscalYear(today = new Date()) {
  const month = today.getMonth() + 1;
  return month >= 4 ? today.getFullYear() : today.getFullYear() - 1;
}

function resolveFiscalYear(state: StaticDemoState, requestedFiscalYear?: number) {
  const availableFiscalYears = listAvailableFiscalYears(state);
  if (availableFiscalYears.length === 0) {
    return null;
  }

  const targetFiscalYear = requestedFiscalYear ?? inferJapaneseFiscalYear();
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

function currentMonth(today = new Date()) {
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase();
}

function compareSearchResults(a: StaticSearchResult, b: StaticSearchResult) {
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

function matchesSearchKeyword(result: StaticSearchResult, keyword?: string) {
  if (keyword === undefined || keyword.trim().length === 0) {
    return true;
  }

  return normalizeText(
    `${result.description} ${result.notes} ${result.fundName} ${result.categoryName}`,
  ).includes(normalizeText(keyword));
}

function matchesSearchFilters(result: StaticSearchResult, options: StaticSearchOptions) {
  if (!matchesSearchKeyword(result, options.keyword)) {
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

function matchesSearchTab(result: StaticSearchResult, tab: StaticSearchTab, month: string) {
  switch (tab) {
    case "overdue":
      return result.type === "planned" && result.month < month && (result.remainingAmount ?? 0) > 0;
    case "unsettled":
      return result.type === "planned" && (result.remainingAmount ?? 0) > 0;
    case "unlinked":
      return result.type === "actual" && result.statusLabel === "未連携";
    case "all":
      return true;
  }
}

function getPlannedStatusLabel(status: StaticDemoPlannedItem["status"], remainingAmount: number) {
  if (status === "cancelled") {
    return "取消";
  }

  if (status === "completed") {
    return "完了";
  }

  return remainingAmount > 0 ? `未精算 ${formatYen(remainingAmount)}` : "精算済み";
}

function listFiscalYearMonths(fiscalYear: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const fiscalMonth = index + 4;
    const year = fiscalMonth <= 12 ? fiscalYear : fiscalYear + 1;
    const month = fiscalMonth <= 12 ? fiscalMonth : fiscalMonth - 12;

    return `${year}-${String(month).padStart(2, "0")}`;
  });
}

function getOverviewMonthlyStatus(state: StaticDemoState, totalAssets: number, fiscalYear: number) {
  const byMonth = new Map<string, { month: string; committed: number; actual: number }>();
  const matchingFundIds = new Set(
    state.funds.filter((fund) => fund.fiscal_year === fiscalYear).map((fund) => fund.id),
  );

  for (const item of state.planned_items) {
    if (item.status !== "planned" || !matchingFundIds.has(item.fund_id)) {
      continue;
    }

    const current = byMonth.get(item.scheduled_month) ?? {
      month: item.scheduled_month,
      committed: 0,
      actual: 0,
    };
    current.committed += getRemainingPlannedAmount(state, item);
    byMonth.set(item.scheduled_month, current);
  }

  for (const entry of state.actual_entries) {
    if (!matchingFundIds.has(entry.fund_id)) {
      continue;
    }

    const month = entry.actual_date.slice(0, 7);
    const current = byMonth.get(month) ?? { month, committed: 0, actual: 0 };
    current.actual += entry.amount;
    byMonth.set(month, current);
  }

  let remainingBalance = totalAssets;
  return listFiscalYearMonths(fiscalYear)
    .map((month) => byMonth.get(month) ?? { month, committed: 0, actual: 0 })
    .map((row) => {
      remainingBalance -= row.committed + row.actual;
      return { ...row, balance: remainingBalance };
    });
}

function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getStaticFundOverduePlannedAmountMap(state: StaticDemoState, fiscalYear: number, today: Date) {
  const currentMonth = formatMonthKey(today);
  const scopedFundIds = new Set(
    state.funds.filter((fund) => fund.fiscal_year === fiscalYear).map((fund) => fund.id),
  );
  const overdueByFundId = new Map<number, number>();

  for (const item of state.planned_items) {
    if (item.status !== "planned" || !scopedFundIds.has(item.fund_id) || item.scheduled_month >= currentMonth) {
      continue;
    }

    const remainingAmount = getRemainingPlannedAmount(state, item);
    if (remainingAmount <= 0) {
      continue;
    }

    overdueByFundId.set(item.fund_id, (overdueByFundId.get(item.fund_id) ?? 0) + remainingAmount);
  }

  return overdueByFundId;
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
  const comparisonMonth = currentMonth(options.today);
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
    .map((item) => ({
      id: item.id,
      plannedDate: item.planned_date,
      scheduledMonth: item.scheduled_month,
      categoryId: item.category_id,
      categoryName: state.categories.find((category) => category.id === item.category_id)?.name ?? "",
      description: item.description,
      amount: item.amount,
      remainingAmount: item.status === "completed" ? getRemainingPlannedAmount(state, item) : 0,
      status: item.status,
      notes: item.notes,
      auxiliaryLabels: assignedStaticTags(state, "planned_item", item.id).filter((tag) => tag.kind === "auxiliary"),
    }))
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
      .map((entry) => ({
        id: entry.id,
        actualDate: entry.actual_date,
        categoryName: state.categories.find((category) => category.id === entry.category_id)?.name ?? "",
        description: entry.description,
        amount: entry.amount,
        notes: entry.notes,
        auxiliaryLabels: assignedStaticTags(state, "actual_entry", entry.id).filter((tag) => tag.kind === "auxiliary"),
      })),
    plannedItems: state.planned_items
      .filter((item) => item.fund_id === fundId && item.status === "planned")
      .map((item) => ({
        id: item.id,
        plannedDate: item.planned_date,
        scheduledMonth: item.scheduled_month,
        categoryId: item.category_id,
        categoryName: state.categories.find((category) => category.id === item.category_id)?.name ?? "",
        description: item.description,
        amount: getRemainingPlannedAmount(state, item),
        notes: item.notes,
        auxiliaryLabels: assignedStaticTags(state, "planned_item", item.id).filter((tag) => tag.kind === "auxiliary"),
      }))
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

function categoryBudgetExceededWarnings(state: StaticDemoState, categoryId: number) {
  const category = state.categories.find((row) => row.id === categoryId);
  const budget = sumBudgetLines(state.budget_lines.filter((row) => row.category_id === categoryId));
  if (category === undefined || budget === null) {
    return [];
  }

  const plannedTotal = state.planned_items
    .filter((item) => item.category_id === categoryId && item.status === "planned")
    .reduce((sum, item) => sum + item.amount, 0);

  return plannedTotal > budget ? [`Category budget exceeded for ${category.name}`] : [];
}

export function createStaticFund(input: FundInput) {
  return mutateStaticDemoState((state) => {
    const fundId = nextId(state.funds);
    const displayOrder = state.funds.reduce((max, fund) => Math.max(max, fund.display_order), 0) + 1;
    state.funds.push({
      id: fundId,
      fund_code: null,
      name: input.name,
      fiscal_year: input.fiscalYear,
      awarded_amount: input.awardedAmount,
      notes: input.notes,
      display_order: displayOrder,
    });
    replaceStaticAssignments(state, "fund", fundId, "project", input.projectTagIds);
    replaceStaticAssignments(state, "fund", fundId, "auxiliary", input.auxiliaryLabelIds);

    for (const [index, category] of input.categories.entries()) {
      const categoryId = nextId(state.categories);
      state.categories.push({
        id: categoryId,
        fund_id: fundId,
        category_code: null,
        name: category.name,
        cross_aggregate_category: requireCrossAggregateCategory(category.crossAggregateCategory),
        display_order: index + 1,
      });
      state.budget_lines.push({
        id: nextId(state.budget_lines),
        fund_id: fundId,
        category_id: categoryId,
        amount: category.amount,
        notes: "",
      });
    }

    return { fundId };
  });
}

export function updateStaticFund(fundId: number, input: FundInput) {
  return mutateStaticDemoState((state) => {
    const fund = requireFund(state, fundId);
    fund.name = input.name;
    fund.fiscal_year = input.fiscalYear;
    fund.awarded_amount = input.awardedAmount;
    fund.notes = input.notes;
    replaceStaticAssignments(state, "fund", fundId, "project", input.projectTagIds);
    replaceStaticAssignments(state, "fund", fundId, "auxiliary", input.auxiliaryLabelIds);

    const requestedIds = new Set(input.categories.flatMap((category) => (category.id === undefined ? [] : [category.id])));
    for (const category of state.categories.filter((row) => row.fund_id === fundId)) {
      if (requestedIds.has(category.id)) {
        continue;
      }

      const hasEntries =
        state.planned_items.some((item) => item.category_id === category.id) ||
        state.actual_entries.some((entry) => entry.category_id === category.id);
      if (hasEntries) {
        throw new Error("Category has linked planned or actual entries");
      }
    }

    state.categories = state.categories.filter((category) => category.fund_id !== fundId || requestedIds.has(category.id));
    state.budget_lines = state.budget_lines.filter((line) => line.fund_id !== fundId || requestedIds.has(line.category_id));

    for (const [index, categoryInput] of input.categories.entries()) {
      let category = categoryInput.id === undefined
        ? undefined
        : state.categories.find((row) => row.id === categoryInput.id && row.fund_id === fundId);

      if (categoryInput.id !== undefined && category === undefined) {
        throw new Error("Category does not belong to fund");
      }

      if (category === undefined) {
        category = {
          id: nextId(state.categories),
          fund_id: fundId,
          category_code: null,
          name: categoryInput.name,
          cross_aggregate_category: requireCrossAggregateCategory(categoryInput.crossAggregateCategory),
          display_order: index + 1,
        };
        state.categories.push(category);
      }

      category.name = categoryInput.name;
      category.cross_aggregate_category = requireCrossAggregateCategory(categoryInput.crossAggregateCategory);
      category.display_order = index + 1;

      let budgetLine = state.budget_lines.find((line) => line.fund_id === fundId && line.category_id === category.id);
      if (budgetLine === undefined) {
        budgetLine = {
          id: nextId(state.budget_lines),
          fund_id: fundId,
          category_id: category.id,
          amount: categoryInput.amount,
          notes: "",
        };
        state.budget_lines.push(budgetLine);
      }
      budgetLine.amount = categoryInput.amount;
    }

    return { success: true };
  });
}

export function createStaticPlannedItem(input: PlannedItemInput) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);
    const plannedItem: StaticDemoPlannedItem = {
      id: nextId(state.planned_items),
      fund_id: input.fundId,
      category_id: input.categoryId,
      planned_ref: null,
      planned_date: input.plannedDate,
      scheduled_month: input.scheduledMonth,
      description: input.description,
      amount: input.amount,
      status: "planned",
      notes: input.notes,
    };
    state.planned_items.push(plannedItem);
    replaceStaticAssignments(state, "planned_item", plannedItem.id, "auxiliary", input.auxiliaryLabelIds);

    return { warnings: categoryBudgetExceededWarnings(state, input.categoryId) };
  });
}

export function createStaticPlannedItemsBulk(input: BulkPlannedItemsInput) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);

    for (const item of input.items) {
      const plannedItem: StaticDemoPlannedItem = {
        id: nextId(state.planned_items),
        fund_id: input.fundId,
        category_id: input.categoryId,
        planned_ref: null,
        planned_date: input.plannedDate,
        scheduled_month: item.scheduledMonth,
        description: item.description,
        amount: item.amount,
        status: "planned",
        notes: input.notes,
      };
      state.planned_items.push(plannedItem);
      replaceStaticAssignments(state, "planned_item", plannedItem.id, "auxiliary", input.auxiliaryLabelIds);
    }

    return {
      createdCount: input.items.length,
      warnings: Array.from(new Set(categoryBudgetExceededWarnings(state, input.categoryId))),
    };
  });
}

export function updateStaticPlannedItem(plannedItemId: number, input: PlannedItemEditInput) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    plannedItem.fund_id = input.fundId;
    plannedItem.category_id = input.categoryId;
    plannedItem.scheduled_month = input.scheduledMonth;
    plannedItem.description = input.description;
    plannedItem.amount = input.amount;
    plannedItem.notes = input.notes;
    replaceStaticAssignments(state, "planned_item", plannedItem.id, "auxiliary", input.auxiliaryLabelIds);

    for (const entry of state.actual_entries.filter((row) => row.planned_item_id === plannedItemId)) {
      entry.fund_id = input.fundId;
      entry.category_id = input.categoryId;
    }

    return { warnings: categoryBudgetExceededWarnings(state, input.categoryId) };
  });
}

export function cancelStaticPlannedItem(plannedItemId: number) {
  return mutateStaticDemoState((state) => {
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    if (getLinkedActuals(state, plannedItemId).length > 0) {
      throw new Error("Planned item has linked actual entries");
    }

    plannedItem.status = "cancelled";
    return { success: true };
  });
}

export function completeStaticPlannedItem(plannedItemId: number) {
  return mutateStaticDemoState((state) => {
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    const linkedActuals = getLinkedActuals(state, plannedItemId);
    if (plannedItem.status !== "planned" || linkedActuals.length === 0) {
      throw new Error("Planned item is not partially settled");
    }

    if (plannedItem.amount - linkedActuals.reduce((sum, row) => sum + row.amount, 0) <= 0) {
      throw new Error("Planned item has no remaining amount");
    }

    plannedItem.status = "completed";
    return { success: true };
  });
}

export function deleteStaticPlannedItem(plannedItemId: number) {
  return mutateStaticDemoState((state) => {
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    if (plannedItem.status !== "planned" && plannedItem.status !== "cancelled") {
      throw new Error("Planned item is not deletable");
    }

    if (getLinkedActuals(state, plannedItemId).length > 0) {
      throw new Error("Planned item has linked actual entries");
    }

    state.planned_items = state.planned_items.filter((item) => item.id !== plannedItemId);
    state.classification_assignments = state.classification_assignments.filter(
      (assignment) => assignment.target_type !== "planned_item" || assignment.target_id !== plannedItemId,
    );
    return { success: true };
  });
}

export function restoreStaticCancelledPlannedItem(plannedItemId: number) {
  return mutateStaticDemoState((state) => {
    const plannedItem = state.planned_items.find((item) => item.id === plannedItemId);
    if (plannedItem === undefined) {
      throw new Error("Planned item not found");
    }

    if (plannedItem.status !== "cancelled" && plannedItem.status !== "completed") {
      throw new Error("Planned item is not restorable");
    }

    plannedItem.status = "planned";
    return { success: true };
  });
}

export function createStaticActualEntry(input: ActualEntryInput) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);

    if (input.plannedItemId !== undefined) {
      const plannedItem = state.planned_items.find((item) => item.id === input.plannedItemId);
      if (
        plannedItem === undefined ||
        plannedItem.fund_id !== input.fundId ||
        plannedItem.category_id !== input.categoryId
      ) {
        throw new Error("Planned item does not match fund and category");
      }
    }

    const entry: StaticDemoActualEntry = {
      id: nextId(state.actual_entries),
      fund_id: input.fundId,
      category_id: input.categoryId,
      planned_item_id: input.plannedItemId ?? null,
      actual_date: input.actualDate,
      description: input.description,
      amount: input.amount,
      notes: input.notes,
    };
    state.actual_entries.push(entry);
    replaceStaticAssignments(state, "actual_entry", entry.id, "auxiliary", input.auxiliaryLabelIds);

    const plannedItem = input.plannedItemId === undefined
      ? undefined
      : state.planned_items.find((item) => item.id === input.plannedItemId);
    const remainingPlannedAmount = plannedItem === undefined
      ? null
      : plannedItem.amount - getLinkedActuals(state, plannedItem.id).reduce((sum, row) => sum + row.amount, 0);

    if (plannedItem !== undefined && remainingPlannedAmount !== null && remainingPlannedAmount > 0 && input.keepRemainingPlanned === false) {
      plannedItem.status = "completed";
    }

    return { remainingPlannedAmount };
  });
}

export function updateStaticActualEntry(actualEntryId: number, input: ActualEntryEditInput) {
  return mutateStaticDemoState((state) => {
    requireCategoryForFund(state, input.fundId, input.categoryId);
    const entry = state.actual_entries.find((row) => row.id === actualEntryId);
    if (entry === undefined) {
      throw new Error("Actual entry not found");
    }

    entry.fund_id = input.fundId;
    entry.category_id = input.categoryId;
    entry.actual_date = input.actualDate;
    entry.description = input.description;
    entry.amount = input.amount;
    entry.notes = input.notes;
    replaceStaticAssignments(state, "actual_entry", entry.id, "auxiliary", input.auxiliaryLabelIds);

    if (entry.planned_item_id !== null) {
      const plannedItem = state.planned_items.find((item) => item.id === entry.planned_item_id);
      if (plannedItem !== undefined) {
        plannedItem.fund_id = input.fundId;
        plannedItem.category_id = input.categoryId;
      }
    }

    return { success: true };
  });
}

export function cancelStaticActualEntry(actualEntryId: number) {
  return mutateStaticDemoState((state) => {
    const originalLength = state.actual_entries.length;
    state.actual_entries = state.actual_entries.filter((entry) => entry.id !== actualEntryId);

    if (state.actual_entries.length === originalLength) {
      throw new Error("Actual entry not found");
    }

    state.classification_assignments = state.classification_assignments.filter(
      (assignment) => assignment.target_type !== "actual_entry" || assignment.target_id !== actualEntryId,
    );

    return { success: true };
  });
}

export function getStaticClassifications() {
  return listStaticClassifications(readStaticDemoState());
}

export function createStaticClassification(input: { kind: "project" | "auxiliary"; name: string; color: string }) {
  return mutateStaticDemoState((state) => {
    const id = nextId(state.classification_tags);
    state.classification_tags.push({ id, ...input });
    return { id };
  });
}

export function updateStaticClassification(
  tagId: number,
  input: { name: string; color: string },
) {
  return mutateStaticDemoState((state) => {
    const tag = state.classification_tags.find((row) => row.id === tagId);
    if (tag === undefined) {
      throw new Error("Classification not found");
    }

    tag.name = input.name;
    tag.color = input.color;
    return { success: true };
  });
}

export function deleteStaticClassification(tagId: number) {
  return mutateStaticDemoState((state) => {
    const originalLength = state.classification_tags.length;
    state.classification_tags = state.classification_tags.filter((tag) => tag.id !== tagId);
    if (state.classification_tags.length === originalLength) {
      throw new Error("Classification not found");
    }

    state.classification_assignments = state.classification_assignments.filter(
      (assignment) => assignment.tag_id !== tagId,
    );
    return { success: true };
  });
}

export function readClonedStaticDemoState() {
  return cloneState(readStaticDemoState());
}

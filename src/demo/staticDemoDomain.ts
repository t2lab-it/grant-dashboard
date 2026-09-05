import type { StaticDemoBudgetLine, StaticDemoCategory, StaticDemoFund, StaticDemoPlannedItem, StaticDemoState } from "./staticDemoData";
import { isCrossAggregateCategory, type CrossAggregateCategory } from "../contracts/crossAggregateCategory";
import { buildOverviewMonthlyStatus, type MonthlyMovement } from "../contracts/monthlySummary";
import { formatTokyoMonthKey, inferJapaneseFiscalYear } from "../lib/calendar";

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

export type StaticSearchResult = {
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
export function nextId(rows: Array<{ id: number }>) {
  return rows.reduce((maxId, row) => Math.max(maxId, row.id), 0) + 1;
}

export function requireFund(state: StaticDemoState, fundId: number) {
  const fund = state.funds.find((row) => row.id === fundId);
  if (fund === undefined) {
    throw new Error("Fund not found");
  }

  return fund;
}

export function requireCategoryForFund(state: StaticDemoState, fundId: number, categoryId: number) {
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

export function listStaticClassifications(state: StaticDemoState) {
  return {
    projectTags: state.classification_tags.filter((tag) => tag.kind === "project"),
    auxiliaryLabels: state.classification_tags.filter((tag) => tag.kind === "auxiliary"),
  };
}

export function requireTagKind(state: StaticDemoState, tagId: number, kind: "project" | "auxiliary") {
  const tag = state.classification_tags.find((row) => row.id === tagId);
  if (tag?.kind !== kind) {
    throw new Error("Invalid classification assignment");
  }

  return tag;
}

export function replaceStaticAssignments(
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

export function assignedStaticTags(
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

export function auxiliaryLabelsForSearchResult(
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

export function getLinkedActuals(state: StaticDemoState, plannedItemId: number) {
  return state.actual_entries.filter((entry) => entry.planned_item_id === plannedItemId);
}

export function getRemainingPlannedAmount(state: StaticDemoState, plannedItem: StaticDemoPlannedItem) {
  const linkedAmount = getLinkedActuals(state, plannedItem.id).reduce((sum, entry) => sum + entry.amount, 0);
  return Math.max(plannedItem.amount - linkedAmount, 0);
}

export function getFundCommittedAmount(state: StaticDemoState, fundId: number) {
  return state.planned_items
    .filter((item) => item.fund_id === fundId && item.status === "planned")
    .reduce((sum, item) => sum + getRemainingPlannedAmount(state, item), 0);
}

export function getFundActualAmount(state: StaticDemoState, fundId: number) {
  return state.actual_entries
    .filter((entry) => entry.fund_id === fundId)
    .reduce((sum, entry) => sum + entry.amount, 0);
}

export function getStaticOverviewCrossAggregateCategories(state: StaticDemoState, fiscalYear: number) {
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
    const crossAggregateCategory = category.cross_aggregate_category;
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

export function toFreeBalance(assets: number, committed: number, actual: number) {
  return assets - committed - actual;
}

export function sumBudgetLines(lines: StaticDemoBudgetLine[]) {
  if (lines.length === 0) {
    return null;
  }

  return lines.reduce((sum, row) => sum + (row.amount ?? 0), 0);
}

export function requireCrossAggregateCategory(value: unknown): CrossAggregateCategory {
  if (typeof value !== "string" || !isCrossAggregateCategory(value)) {
    throw new Error("Invalid cross aggregate category");
  }

  return value;
}

export function sortFunds(funds: StaticDemoFund[]) {
  return [...funds].sort((a, b) => a.display_order - b.display_order || a.id - b.id);
}

export function sortCategories(categories: StaticDemoCategory[]) {
  return [...categories].sort((a, b) => a.display_order - b.display_order || a.id - b.id);
}

export function listAvailableFiscalYears(state: StaticDemoState) {
  return Array.from(new Set(state.funds.map((fund) => fund.fiscal_year))).sort((a, b) => a - b);
}

export function resolveFiscalYear(state: StaticDemoState, requestedFiscalYear?: number) {
  const availableFiscalYears = listAvailableFiscalYears(state);
  if (availableFiscalYears.length === 0) {
    return null;
  }

  const targetFiscalYear = requestedFiscalYear ?? inferJapaneseFiscalYear(new Date());
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

export function formatYen(amount: number) {
  return `${new Intl.NumberFormat("ja-JP").format(amount)}円`;
}

export function normalizeText(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function compareSearchResults(a: StaticSearchResult, b: StaticSearchResult) {
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

export function matchesSearchKeyword(result: StaticSearchResult, keyword?: string) {
  if (keyword === undefined || keyword.trim().length === 0) {
    return true;
  }

  return normalizeText(
    `${result.description} ${result.notes} ${result.fundName} ${result.categoryName}`,
  ).includes(normalizeText(keyword));
}

export function matchesSearchFilters(result: StaticSearchResult, options: StaticSearchOptions) {
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

export function matchesSearchTab(result: StaticSearchResult, tab: StaticSearchTab, month: string) {
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

export function getPlannedStatusLabel(status: StaticDemoPlannedItem["status"], remainingAmount: number) {
  if (status === "cancelled") {
    return "取消";
  }

  if (status === "completed") {
    return "完了";
  }

  return remainingAmount > 0 ? `未精算 ${formatYen(remainingAmount)}` : "精算済み";
}

export function getOverviewMonthlyStatus(state: StaticDemoState, totalAssets: number, fiscalYear: number) {
  const matchingFundIds = new Set(
    state.funds.filter((fund) => fund.fiscal_year === fiscalYear).map((fund) => fund.id),
  );

  return buildOverviewMonthlyStatus(
    totalAssets,
    fiscalYear,
    getStaticMonthlyMovements(state, matchingFundIds),
  );
}

export function getStaticMonthlyMovements(
  state: StaticDemoState,
  matchingFundIds: Set<number>,
  crossAggregateCategory?: CrossAggregateCategory,
): MonthlyMovement[] {
  const byMonth = new Map<string, MonthlyMovement>();
  const matchesCategory = (categoryId: number) => {
    if (crossAggregateCategory === undefined) {
      return true;
    }

    const category = state.categories.find((row) => row.id === categoryId);
    return category !== undefined && category.cross_aggregate_category === crossAggregateCategory;
  };

  for (const item of state.planned_items) {
    if (item.status !== "planned" || !matchingFundIds.has(item.fund_id) || !matchesCategory(item.category_id)) {
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
    if (!matchingFundIds.has(entry.fund_id) || !matchesCategory(entry.category_id)) {
      continue;
    }

    const month = entry.actual_date.slice(0, 7);
    const current = byMonth.get(month) ?? { month, plannedAmount: 0, actualAmount: 0 };
    current.actualAmount += entry.amount;
    byMonth.set(month, current);
  }

  return Array.from(byMonth.values());
}

export function getStaticFundOverduePlannedAmountMap(state: StaticDemoState, fiscalYear: number, today: Date) {
  const currentMonth = formatTokyoMonthKey(today);
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

import {
  CROSS_AGGREGATE_CATEGORY_LABELS,
  type CrossAggregateCategory,
} from "../../contracts/crossAggregateCategory";
import type {
  FiscalYearComparisonResponse,
  FiscalYearComparisonYear,
} from "../../contracts/fiscalYearComparison";

export type FiscalYearPacePoint = {
  month: string;
  monthIndex: number;
  amount: number;
  rate: number | null;
};

export type FiscalYearComparisonViewYear = ReturnType<typeof buildYearModel>;

function toRate(amount: number, assets: number) {
  return assets > 0 ? (amount / assets) * 100 : null;
}

function buildBudgetModel(year: FiscalYearComparisonYear) {
  const displayCommitted = year.state === "past" ? 0 : year.totals.committed;
  const displayUsed = year.totals.actual + displayCommitted;
  const displayBalance = year.totals.assets - displayUsed;

  return {
    assets: year.totals.assets,
    actual: year.totals.actual,
    displayCommitted,
    displayUsed,
    displayBalance,
    drawableActual: Math.max(year.totals.actual, 0),
    drawableCommitted: Math.max(displayCommitted, 0),
    drawableBalance: Math.max(displayBalance, 0),
    displayRate: toRate(displayUsed, year.totals.assets),
    statusLabel: year.state === "past" ? "最終" : year.state === "current" ? "見込み" : "予定",
  };
}

function buildFundColorIndexes(years: FiscalYearComparisonYear[]) {
  const names = [...new Set(years.flatMap((year) => year.funds.map((fund) => fund.name)))]
    .sort((left, right) => left.localeCompare(right, "ja"));
  return new Map(names.map((name, colorIndex) => [name, colorIndex]));
}

function buildFundModel(year: FiscalYearComparisonYear, colorIndexes: Map<string, number>) {
  return [...year.funds]
    .sort((left, right) => (
      right.awardedAmount - left.awardedAmount
      || left.displayOrder - right.displayOrder
      || left.id - right.id
    ))
    .map((fund) => ({
      ...fund,
      percentage: toRate(fund.awardedAmount, year.totals.assets),
      colorIndex: colorIndexes.get(fund.name) ?? 0,
    }));
}

function buildCategoryModel(year: FiscalYearComparisonYear) {
  const categories = year.crossAggregateCategories.map((row) => ({
    code: row.crossAggregateCategory,
    label: CROSS_AGGREGATE_CATEGORY_LABELS[row.crossAggregateCategory],
    displayAmount: row.actualAmount + (year.state === "past" ? 0 : row.plannedAmount),
  }));
  const categoryTotal = categories.reduce((sum, category) => sum + category.displayAmount, 0);

  return {
    categoryTotal,
    categories: categories.map((category) => ({
      ...category,
      percentage: categoryTotal > 0 ? (category.displayAmount / categoryTotal) * 100 : null,
    })),
  };
}

function pacePoint(
  month: string,
  monthIndex: number,
  amount: number,
  assets: number,
): FiscalYearPacePoint {
  return { month, monthIndex, amount, rate: toRate(amount, assets) };
}

function buildPaceModel(year: FiscalYearComparisonYear, currentMonthKey: string) {
  const assets = year.totals.assets;
  let cumulativeActual = 0;

  if (year.state === "past") {
    const actualPoints = year.monthlyStatus.map((row, monthIndex) => {
      cumulativeActual += row.actual;
      return pacePoint(row.month, monthIndex, cumulativeActual, assets);
    });
    return { hasBudget: assets > 0, actualPoints, projectedPoints: [] as FiscalYearPacePoint[] };
  }

  if (year.state === "future") {
    let cumulativeProjection = 0;
    const projectedPoints = year.monthlyStatus.map((row, monthIndex) => {
      cumulativeProjection += row.actual + row.committed;
      return pacePoint(row.month, monthIndex, cumulativeProjection, assets);
    });
    return { hasBudget: assets > 0, actualPoints: [] as FiscalYearPacePoint[], projectedPoints };
  }

  const currentMonthIndex = Math.max(
    year.monthlyStatus.findIndex((row) => row.month === currentMonthKey),
    0,
  );
  const actualPoints = year.monthlyStatus.slice(0, currentMonthIndex + 1).map((row, monthIndex) => {
    cumulativeActual += row.actual;
    return pacePoint(row.month, monthIndex, cumulativeActual, assets);
  });
  const currentMonth = year.monthlyStatus[currentMonthIndex]?.month ?? currentMonthKey;
  const projectedPoints = [
    pacePoint(currentMonth, currentMonthIndex, cumulativeActual, assets),
  ];
  let cumulativeProjection = cumulativeActual;
  const currentAndOverdueCommitted = year.monthlyStatus
    .slice(0, currentMonthIndex + 1)
    .reduce((sum, row) => sum + row.committed, 0);
  if (currentAndOverdueCommitted > 0) {
    cumulativeProjection += currentAndOverdueCommitted;
    projectedPoints.push(pacePoint(currentMonth, currentMonthIndex, cumulativeProjection, assets));
  }

  for (let monthIndex = currentMonthIndex + 1; monthIndex < year.monthlyStatus.length; monthIndex += 1) {
    const row = year.monthlyStatus[monthIndex];
    cumulativeProjection += row.committed;
    projectedPoints.push(pacePoint(row.month, monthIndex, cumulativeProjection, assets));
  }

  return { hasBudget: assets > 0, actualPoints, projectedPoints };
}

function buildYearModel(year: FiscalYearComparisonYear, currentMonthKey: string, fundColorIndexes: Map<string, number>) {
  const category = buildCategoryModel(year);
  return {
    fiscalYear: year.fiscalYear,
    state: year.state,
    budget: buildBudgetModel(year),
    funds: buildFundModel(year, fundColorIndexes),
    categoryTotal: category.categoryTotal,
    categories: category.categories,
    pace: buildPaceModel(year, currentMonthKey),
  };
}

export function buildFiscalYearComparisonModel(
  response: FiscalYearComparisonResponse,
  currentMonthKey: string,
) {
  const sourceYears = [...response.fiscalYears].sort((a, b) => b.fiscalYear - a.fiscalYear);
  const fundColorIndexes = buildFundColorIndexes(sourceYears);
  const years = sourceYears.map((year) => buildYearModel(year, currentMonthKey, fundColorIndexes));
  const paceRates = years.flatMap((year) => [
    ...year.pace.actualPoints.map((point) => point.rate),
    ...year.pace.projectedPoints.map((point) => point.rate),
  ]).filter((rate): rate is number => rate !== null);

  return {
    currentFiscalYear: response.currentFiscalYear,
    years,
    maxAssets: Math.max(0, ...years.map((year) => year.budget.assets)),
    maxPaceRate: Math.max(100, ...paceRates),
  };
}

export type FiscalYearCategoryView = {
  code: CrossAggregateCategory;
  label: string;
  displayAmount: number;
  percentage: number | null;
};

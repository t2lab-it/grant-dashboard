import type { CrossAggregateCategory } from "./crossAggregateCategory";

export type FiscalYearState = "past" | "current" | "future";

export type FiscalYearComparisonCategory = {
  crossAggregateCategory: CrossAggregateCategory;
  plannedAmount: number;
  actualAmount: number;
};

export type FiscalYearComparisonMonth = {
  month: string;
  committed: number;
  actual: number;
};

export type FiscalYearComparisonFund = {
  id: number;
  name: string;
  awardedAmount: number;
  displayOrder: number;
};

export type FiscalYearComparisonYear = {
  fiscalYear: number;
  state: FiscalYearState;
  totals: { assets: number; committed: number; actual: number };
  funds: FiscalYearComparisonFund[];
  crossAggregateCategories: FiscalYearComparisonCategory[];
  monthlyStatus: FiscalYearComparisonMonth[];
};

export type FiscalYearComparisonResponse = {
  currentFiscalYear: number;
  fiscalYears: FiscalYearComparisonYear[];
};

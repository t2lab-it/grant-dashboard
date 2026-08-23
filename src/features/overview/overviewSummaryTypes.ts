import type { CrossAggregateCategory } from "../../contracts/crossAggregateCategory";
import type { BalanceRateThresholds } from "../../lib/executionRate";
import type { AmountDisplayMode } from "../../lib/format";
import type { OverviewChartPalette } from "./overviewChart";

export type OverviewSummaryMetricKey = "assets" | "actual" | "committed" | "balance";

export type OverviewTotals = {
  assets: number;
  committed: number;
  actual: number;
  freeBalance: number;
};

export type OverviewMonthlyStatus = {
  month: string;
  committed: number;
  actual: number;
  balance: number;
};

export type OverviewSummaryFund = {
  id: number;
  name: string;
  awarded_amount: number;
  committed_amount: number;
  actual_amount: number;
  freeBalance: number;
};

export type OverviewCrossAggregateCategory = {
  crossAggregateCategory: CrossAggregateCategory;
  budgetAmount: number | null;
  plannedAmount: number;
  actualAmount: number;
};

export type OverviewSummaryPanelProps = {
  id: string;
  amountDisplayMode: AmountDisplayMode;
  balanceRateThresholds: BalanceRateThresholds;
  funds: OverviewSummaryFund[];
  linkedActualAmount: number;
  metric: OverviewSummaryMetricKey;
  monthlyStatus: OverviewMonthlyStatus[];
  onSelectMonth: (month: string) => void;
  pendingPlannedCount: number;
  crossAggregateCategories: OverviewCrossAggregateCategory[];
  palette: OverviewChartPalette;
  totals: OverviewTotals;
};

export type OverviewTrendPoint = {
  month: string;
  value: number;
};

export type OverviewInsight = {
  help?: string;
  label: string;
  value: string;
};

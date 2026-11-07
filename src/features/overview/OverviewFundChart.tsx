import { CROSS_AGGREGATE_CATEGORY_LABELS } from "../../contracts/crossAggregateCategory";
import { formatPercentage, getCrossAggregateMetricValue, getFundMetricValue, metricCopy } from "./overviewSummaryModel";
import type { OverviewCrossAggregateCategory, OverviewSelectableMetricKey } from "./overviewSummaryTypes";
import { useId } from "react";
import type { CSSProperties } from "react";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import {
  getRateMetric,
  type BalanceRateThresholds,
  type ExecutionRateThresholds,
  type RateMetricKey,
} from "../../lib/executionRate";
import {
  createOverviewChartSegments,
  getCrossAggregateChartColors,
  getOverBudgetChartState,
  type OverviewChartFund,
  type OverviewChartSegment,
  type OverviewChartPalette,
} from "./overviewChart";

type OverviewFundChartProps = {
  fund: OverviewChartFund;
  categoryMetric?: OverviewSelectableMetricKey | null;
  crossAggregateCategories?: OverviewCrossAggregateCategory[];
  palette: OverviewChartPalette;
  rateMetric: RateMetricKey;
  amountDisplayMode: AmountDisplayMode;
  executionRateThresholds: ExecutionRateThresholds;
  balanceRateThresholds: BalanceRateThresholds;
};

export function OverviewFundChart({
  fund,
  categoryMetric = null,
  crossAggregateCategories,
  palette,
  rateMetric,
  amountDisplayMode,
  executionRateThresholds,
  balanceRateThresholds,
}: OverviewFundChartProps) {
  const chartSummaryId = useId();
  const categoryLabel = categoryMetric === null ? "" : metricCopy[categoryMetric].label;
  const categoryAmount = categoryMetric === null ? 0 : getFundMetricValue(categoryMetric, { ...fund, crossAggregateCategories });
  const categoryAmountLabel = categoryAmount === null ? "—" : formatAmount(categoryAmount, amountDisplayMode);
  const categoryRows = categoryMetric === null ? [] : (crossAggregateCategories ?? []).map((row) => ({
    label: CROSS_AGGREGATE_CATEGORY_LABELS[row.crossAggregateCategory],
    value: getCrossAggregateMetricValue(categoryMetric, row),
    color: getCrossAggregateChartColors(palette)[row.crossAggregateCategory],
  }));
  const positiveTotal = categoryRows.reduce((sum, row) => sum + Math.max(0, row.value), 0);
  const segments: Array<Omit<OverviewChartSegment, "label"> & { label: string }> = categoryMetric === null
    ? createOverviewChartSegments(fund, palette)
    : categoryRows.filter((row) => row.value > 0).map((row) => ({
      label: row.label, color: row.color, percentage: row.value / positiveTotal * 100,
    }));
  const categoryStatus = categoryMetric === null ? null
    : crossAggregateCategories === undefined ? "大費目別内訳を表示できません。"
    : crossAggregateCategories.length === 0 ? "大費目データなし"
    : categoryMetric === "assets" && crossAggregateCategories.every((row) => row.budgetAmount === null) ? "費目別予算が未設定"
    : categoryRows.every((row) => row.value === 0) ? `${categoryLabel}は0円です。`
    : positiveTotal === 0 ? "正の金額がないため円弧を表示しません。" : null;
  const isDarkTheme =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  const rate = getRateMetric(
    rateMetric,
    fund.awarded_amount,
    fund.committed_amount,
    fund.actual_amount,
    fund.freeBalance,
    executionRateThresholds,
    balanceRateThresholds,
  );
  const { overBudgetAmount, overBudgetPercentage } = getOverBudgetChartState(
    fund.awarded_amount,
    fund.freeBalance,
  );
  const isBalanceRate = rateMetric === "balance";
  const metricLabel = isBalanceRate ? "残高" : "消化額";
  const metricAmount = isBalanceRate
    ? fund.freeBalance
    : fund.actual_amount + fund.committed_amount;
  const chartRadius = 54;
  const chartStroke = 18;
  const chartCircumference = 2 * Math.PI * chartRadius;
  const overBudgetRingRadius = 67;
  const overBudgetRingCircumference = 2 * Math.PI * overBudgetRingRadius;
  let accumulatedPercentage = 0;
  const accessibleSummary = categoryMetric === null ? [
    `執行済 ${formatAmount(fund.actual_amount, amountDisplayMode)}`,
    `執行予定 ${formatAmount(fund.committed_amount, amountDisplayMode)}`,
    `残高 ${formatAmount(fund.freeBalance, amountDisplayMode)}`,
  ].join("、") : [
    `${categoryLabel} ${categoryAmountLabel}`,
    ...categoryRows.filter((row) => row.value !== 0)
      .map((row) => `${row.label} ${formatAmount(row.value, amountDisplayMode)} ${formatPercentage(row.value, categoryAmount ?? 0)}`),
    ...(categoryStatus ? [categoryStatus] : []),
  ].join("、");

  return (
    <div className="fund-card-chart">
      <figure className="fund-card-donut">
        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label={categoryMetric === null ? `${fund.name} の予算内訳` : `${fund.name} の${categoryLabel}の大費目別内訳グラフ`}
          aria-describedby={chartSummaryId}
          focusable="false"
        >
          {overBudgetPercentage > 0 ? (
            <circle
              className="fund-card-over-budget-ring"
              cx="80"
              cy="80"
              r={overBudgetRingRadius}
              fill="none"
              strokeDasharray={`${
                (overBudgetPercentage / 100) * overBudgetRingCircumference
              } ${overBudgetRingCircumference}`}
              strokeDashoffset="0"
              strokeLinecap="butt"
              strokeWidth="6"
              transform="rotate(-90 80 80)"
            />
          ) : null}
          <circle
            className="fund-card-donut-track"
            cx="80"
            cy="80"
            r={chartRadius}
            fill="none"
            strokeWidth={chartStroke}
          />
          {segments.map((segment) => {
            const dashLength = (segment.percentage / 100) * chartCircumference;
            const dashOffset = chartCircumference * (1 - accumulatedPercentage / 100);
            accumulatedPercentage += segment.percentage;

            return (
              <g key={segment.label}>
                {segment.borderColor ? (
                  <circle
                    className={isDarkTheme ? "fund-card-donut-segment-border-dark-hidden" : undefined}
                    cx="80"
                    cy="80"
                    r={chartRadius}
                    fill="none"
                    stroke={segment.borderColor}
                    strokeLinecap="butt"
                    strokeWidth={chartStroke + 2}
                    strokeDasharray={`${dashLength} ${chartCircumference - dashLength}`}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 80 80)"
                  />
                ) : null}
                <circle
                  cx="80"
                  cy="80"
                  r={chartRadius}
                  fill="none"
                  stroke={segment.color}
                  strokeLinecap="butt"
                  strokeWidth={chartStroke}
                  strokeDasharray={`${dashLength} ${chartCircumference - dashLength}`}
                  strokeDashoffset={dashOffset}
                  transform="rotate(-90 80 80)"
                />
              </g>
            );
          })}
          {categoryMetric !== null ? <>
            <text x="80" y="71" textAnchor="middle" className="fund-card-donut-value fund-card-donut-metric-label">{categoryLabel}</text>
            <text x="80" y="92" textAnchor="middle" className="fund-card-donut-value fund-card-donut-metric-amount"
              textLength={categoryAmountLabel.length > 10 ? 80 : undefined}
              lengthAdjust="spacingAndGlyphs">{categoryAmountLabel}</text>
          </> : overBudgetAmount > 0 ? (
            <>
              <text
                x="80"
                y="71"
                textAnchor="middle"
                className="fund-card-donut-value fund-card-donut-alert-label detail-rate-alert"
              >
                超過
              </text>
              <text
                x="80"
                y="92"
                textAnchor="middle"
                className="fund-card-donut-value fund-card-donut-alert-amount detail-rate-alert"
                textLength={formatAmount(-overBudgetAmount, amountDisplayMode).length > 12 ? 80 : undefined}
                lengthAdjust="spacingAndGlyphs"
              >
                {formatAmount(-overBudgetAmount, amountDisplayMode)}
              </text>
            </>
          ) : (
            <text
              x="80"
              y="80"
              textAnchor="middle"
              dominantBaseline="central"
              className={
                rate.className
                  ? `fund-card-donut-value ${rate.className}`
                  : "fund-card-donut-value"
              }
            >
              {rate.label}
            </text>
          )}
        </svg>
        <figcaption id={chartSummaryId} className="sr-only">
          {accessibleSummary}
        </figcaption>
      </figure>

      {categoryMetric === null ? <div className="fund-card-legend overview-fund-card-legend" aria-label={`${fund.name} の凡例`}>
        {segments.map((segment) => (
          <p key={segment.label} className="fund-card-legend-row">
            <span
              aria-hidden="true"
              className="fund-card-legend-chip"
              style={{
                backgroundColor: segment.color,
                "--fund-card-legend-chip-border":
                  segment.borderColor && !isDarkTheme ? segment.borderColor : "transparent",
              } as CSSProperties}
            />
            <span
              className={segment.isNegative ? "fund-card-legend-label detail-rate-alert" : "fund-card-legend-label"}
            >
              {segment.label}
            </span>
          </p>
        ))}
      </div> : null}
      {categoryStatus ? <p className="fund-card-chart-empty">{categoryStatus}</p> : null}

      {categoryMetric === null || overBudgetAmount > 0 ? (
        <div className="fund-card-chart-metrics">
          {categoryMetric === null ? (
            <p className="fund-card-row">
              <span>{metricLabel}</span>
              <strong>{formatAmount(metricAmount, amountDisplayMode)}</strong>
            </p>
          ) : (
            <p><strong className="detail-rate-alert">{`予算超過 ${formatAmount(overBudgetAmount, amountDisplayMode)}`}</strong></p>
          )}
        </div>
      ) : null}
    </div>
  );
}

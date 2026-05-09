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
  getOverBudgetChartState,
  type OverviewChartFund,
  type OverviewChartPalette,
} from "./overviewChart";

type OverviewFundChartProps = {
  fund: OverviewChartFund;
  palette: OverviewChartPalette;
  rateMetric: RateMetricKey;
  amountDisplayMode: AmountDisplayMode;
  executionRateThresholds: ExecutionRateThresholds;
  balanceRateThresholds: BalanceRateThresholds;
};

export function OverviewFundChart({
  fund,
  palette,
  rateMetric,
  amountDisplayMode,
  executionRateThresholds,
  balanceRateThresholds,
}: OverviewFundChartProps) {
  const chartSummaryId = useId();
  const segments = createOverviewChartSegments(fund, palette);
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
  const accessibleSummary = [
    `執行済 ${formatAmount(fund.actual_amount, amountDisplayMode)}`,
    `執行予定 ${formatAmount(fund.committed_amount, amountDisplayMode)}`,
    `残高 ${formatAmount(fund.freeBalance, amountDisplayMode)}`,
  ].join("、");
  const legendLabelBySegment = {
    執行済: "執行済",
    執行予定: "執行予定",
    残高: "残高",
  } as const;

  return (
    <div className="fund-card-chart">
      <figure className="fund-card-donut">
        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label={`${fund.name} の予算内訳`}
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
          {overBudgetAmount > 0 ? (
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

      <div className="fund-card-legend overview-fund-card-legend" aria-label={`${fund.name} の凡例`}>
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
              {legendLabelBySegment[segment.label]}
            </span>
          </p>
        ))}
      </div>

      <div className="fund-card-chart-metrics">
        <p className="fund-card-row">
          <span>{metricLabel}</span>
          <strong>{formatAmount(metricAmount, amountDisplayMode)}</strong>
        </p>
      </div>
    </div>
  );
}

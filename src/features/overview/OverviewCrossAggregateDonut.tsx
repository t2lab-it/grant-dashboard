import { useId } from "react";
import { CROSS_AGGREGATE_CATEGORY_LABELS } from "../../contracts/crossAggregateCategory";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import type { CrossAggregateChartColors } from "./overviewChart";
import { formatPercentage, getCrossAggregateMetricValue, metricCopy } from "./overviewSummaryModel";
import type { OverviewCrossAggregateCategory, OverviewSummaryMetricKey } from "./overviewSummaryTypes";

export function OverviewCrossAggregateDonut({
  amountDisplayMode,
  colors,
  metric,
  rows,
  totalValue,
}: {
  amountDisplayMode: AmountDisplayMode;
  colors: CrossAggregateChartColors;
  metric: OverviewSummaryMetricKey;
  rows: OverviewCrossAggregateCategory[];
  totalValue: number;
}) {
  const chartSummaryId = useId();
  const copy = metricCopy[metric];
  const displayRows = rows
    .map((row) => ({
      ...row,
      label: CROSS_AGGREGATE_CATEGORY_LABELS[row.crossAggregateCategory],
      value: getCrossAggregateMetricValue(metric, row),
    }))
    .filter((row) => row.value !== 0);
  const positiveRows = displayRows.filter((row) => row.value > 0);
  const chartTotal = positiveRows.reduce((sum, row) => sum + row.value, 0);
  const chartRadius = 45;
  const chartStroke = 16;
  const chartCircumference = 2 * Math.PI * chartRadius;
  let accumulatedPercentage = 0;
  const accessibleSummary = displayRows
    .map((row) => `${row.label} ${formatAmount(row.value, amountDisplayMode)} ${formatPercentage(row.value, totalValue || 1)}`)
    .join("、");

  if (displayRows.length === 0) {
    return <p className="overview-context-empty">まだ大費目のデータがありません。</p>;
  }

  return (
    <div className="overview-cross-aggregate-chart">
      <figure className="overview-cross-aggregate-donut">
        <svg
          viewBox="0 0 128 128"
          role="img"
          aria-label={`${copy.label}の大費目別内訳グラフ`}
          aria-describedby={chartSummaryId}
          focusable="false"
        >
          <circle
            className="overview-cross-aggregate-track"
            cx="64"
            cy="64"
            r={chartRadius}
            fill="none"
            strokeWidth={chartStroke}
          />
          {chartTotal > 0
            ? positiveRows.map((row) => {
                const percentage = (row.value / chartTotal) * 100;
                const dashLength = (percentage / 100) * chartCircumference;
                const dashOffset = chartCircumference * (1 - accumulatedPercentage / 100);
                accumulatedPercentage += percentage;

                return (
                  <circle
                    key={row.crossAggregateCategory}
                    cx="64"
                    cy="64"
                    r={chartRadius}
                    fill="none"
                    stroke={colors[row.crossAggregateCategory]}
                    strokeDasharray={`${dashLength} ${chartCircumference - dashLength}`}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="butt"
                    strokeWidth={chartStroke}
                    transform="rotate(-90 64 64)"
                  />
                );
              })
            : null}
        </svg>
        <figcaption id={chartSummaryId} className="sr-only">
          {accessibleSummary}
        </figcaption>
      </figure>
      <ol className="overview-cross-aggregate-legend">
        {displayRows.map((row) => (
          <li key={row.crossAggregateCategory} className="overview-cross-aggregate-row">
            <span
              className="overview-cross-aggregate-swatch"
              style={{ backgroundColor: colors[row.crossAggregateCategory] }}
            />
            <span className="overview-cross-aggregate-label">{row.label}</span>
            <span className="overview-cross-aggregate-value">{formatAmount(row.value, amountDisplayMode)}</span>
            <span className="overview-cross-aggregate-share">{`(${formatPercentage(row.value, totalValue || 1)})`}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

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
  fundName,
}: {
  amountDisplayMode: AmountDisplayMode;
  colors: CrossAggregateChartColors;
  metric: OverviewSummaryMetricKey;
  rows: OverviewCrossAggregateCategory[];
  totalValue: number;
  fundName?: string;
}) {
  const chartSummaryId = useId();
  const copy = metricCopy[metric];
  const percentageBase = fundName !== undefined || metric === "consumed" ? totalValue : totalValue || 1;
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
  const accessibleSummary = [
    ...(fundName !== undefined ? [`${copy.label} ${formatAmount(totalValue, amountDisplayMode)}`] : []),
    ...displayRows.map((row) => `${row.label} ${formatAmount(row.value, amountDisplayMode)} ${formatPercentage(row.value, percentageBase)}`),
  ].join("、");

  if (displayRows.length === 0 && fundName === undefined) {
    return <p className="overview-context-empty">まだ大費目のデータがありません。</p>;
  }

  return (
    <div className="overview-cross-aggregate-chart">
      <figure className="overview-cross-aggregate-donut">
        <svg
          viewBox="0 0 128 128"
          role="img"
          aria-label={`${fundName ? `${fundName} の` : ""}${copy.label}の大費目別内訳グラフ`}
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
          {fundName !== undefined ? <>
            <text x="64" y="57" textAnchor="middle" className="overview-category-center-label">{copy.label}</text>
            <text x="64" y="74" textAnchor="middle" className="overview-category-center-value"
              textLength={formatAmount(totalValue, amountDisplayMode).length > 10 ? 64 : undefined}
              lengthAdjust="spacingAndGlyphs">{formatAmount(totalValue, amountDisplayMode)}</text>
          </> : null}
        </svg>
        <figcaption id={chartSummaryId} className="sr-only">
          {accessibleSummary}
        </figcaption>
      </figure>
      {fundName !== undefined && chartTotal === 0 ? <p className="overview-category-empty">{
        rows.length === 0 ? "大費目データなし"
        : metric === "assets" && rows.every((row) => row.budgetAmount === null) ? "費目別予算が未設定"
        : displayRows.length === 0 ? `${copy.label}は0円です。`
        : "正の金額がないため円弧を表示しません。"
      }</p> : null}
      <ol className="overview-cross-aggregate-legend">
        {displayRows.map((row) => (
          <li key={row.crossAggregateCategory} className="overview-cross-aggregate-row">
            <span
              className="overview-cross-aggregate-swatch"
              style={{ backgroundColor: colors[row.crossAggregateCategory] }}
            />
            <span className="overview-cross-aggregate-label">{row.label}</span>
            <span className="overview-cross-aggregate-value">{formatAmount(row.value, amountDisplayMode)}</span>
            <span className="overview-cross-aggregate-share">{`(${formatPercentage(row.value, percentageBase)})`}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

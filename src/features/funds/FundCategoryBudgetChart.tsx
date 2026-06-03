import { useId } from "react";
import {
  CROSS_AGGREGATE_CATEGORY_CODES,
  CROSS_AGGREGATE_CATEGORY_LABELS,
  type CrossAggregateCategory,
} from "../../contracts/crossAggregateCategory";
import { formatYen } from "../../lib/format";
import { parseAmountExpressionForPreview } from "../forms/amountExpression";
import {
  getCrossAggregateChartColors,
  getOverBudgetChartState,
  overviewChartPresets,
} from "../overview/overviewChart";

type FundCategoryBudgetChartCategory = {
  amount: string;
  crossAggregateCategory: CrossAggregateCategory | "";
};

type FundCategoryBudgetChartProps = {
  awardedAmount: string;
  categories: FundCategoryBudgetChartCategory[];
};

type CategoryBudgetChartRow = {
  key: CrossAggregateCategory | "balance";
  label: string;
  value: number;
  color: string;
};

function formatPercentage(value: number, total: number) {
  if (total <= 0) {
    return "0.0%";
  }

  return ((value / total) * 100).toFixed(1) + "%";
}

function createCategoryBudgetRows({
  awardedAmount,
  categories,
}: FundCategoryBudgetChartProps): {
  overBudgetPercentage: number;
  rows: CategoryBudgetChartRow[];
  percentageTotal: number;
  renderTotal: number;
} {
  const palette = overviewChartPresets["teal-yellow"].palette;
  const colors = getCrossAggregateChartColors(palette);
  const totals = Object.fromEntries(
    CROSS_AGGREGATE_CATEGORY_CODES.map((category) => [category, 0]),
  ) as Record<CrossAggregateCategory, number>;

  for (const category of categories) {
    const crossAggregateCategory = category.crossAggregateCategory || "unset";
    const parsedAmount = Math.max(parseAmountExpressionForPreview(category.amount), 0);
    totals[crossAggregateCategory] += parsedAmount;
  }

  const categoryRows = CROSS_AGGREGATE_CATEGORY_CODES
    .map((category) => ({
      key: category,
      label: CROSS_AGGREGATE_CATEGORY_LABELS[category],
      value: totals[category],
      color: colors[category],
    }))
    .filter((row) => row.value > 0);
  const parsedAwardedAmount = Math.max(parseAmountExpressionForPreview(awardedAmount), 0);
  const categoryTotal = categoryRows.reduce((sum, row) => sum + row.value, 0);
  const balance = parsedAwardedAmount - categoryTotal;
  const { overBudgetPercentage } = getOverBudgetChartState(parsedAwardedAmount, balance);
  const rows =
    balance > 0
      ? [
          ...categoryRows,
          {
            key: "balance" as const,
            label: "差額",
            value: balance,
            color: palette.balanceBorder,
          },
        ]
      : categoryRows;

  return {
    overBudgetPercentage,
    rows,
    percentageTotal: parsedAwardedAmount > 0 ? parsedAwardedAmount : categoryTotal,
    renderTotal: Math.max(parsedAwardedAmount, categoryTotal),
  };
}

export function FundCategoryBudgetChart({
  awardedAmount,
  categories,
}: FundCategoryBudgetChartProps) {
  const chartSummaryId = useId();
  const { overBudgetPercentage, rows, percentageTotal, renderTotal } = createCategoryBudgetRows({
    awardedAmount,
    categories,
  });
  const overBudgetRingRadius = 57;
  const overBudgetRingCircumference = 2 * Math.PI * overBudgetRingRadius;
  const chartRadius = 45;
  const chartStroke = 16;
  const chartCircumference = 2 * Math.PI * chartRadius;
  const accessibleSummary = rows
    .map(
      (row) =>
        row.label + " " + formatYen(row.value) + " " + formatPercentage(row.value, percentageTotal),
    )
    .join("、");
  let accumulatedPercentage = 0;

  return (
    <section aria-label="横断カテゴリ別の予算配分" className="budget-category-chart">
      <div className="budget-category-chart-header">
        <h3>横断カテゴリ別の予算配分</h3>
      </div>
      {rows.length === 0 ? (
        <p className="budget-category-chart-empty">分類別の予算額はまだありません。</p>
      ) : (
        <div className="budget-category-chart-body">
          <figure className="budget-category-chart-donut">
            <svg
              viewBox="0 0 128 128"
              role="img"
              aria-label="横断カテゴリ別の予算配分グラフ"
              aria-describedby={chartSummaryId}
              focusable="false"
            >
              {overBudgetPercentage > 0 ? (
                <circle
                  className="budget-category-over-budget-ring"
                  cx="64"
                  cy="64"
                  r={overBudgetRingRadius}
                  fill="none"
                  strokeDasharray={
                    (overBudgetPercentage / 100) * overBudgetRingCircumference +
                    " " +
                    overBudgetRingCircumference
                  }
                  strokeDashoffset="0"
                  strokeLinecap="butt"
                  strokeWidth="6"
                  transform="rotate(-90 64 64)"
                />
              ) : null}
              <circle
                className="budget-category-chart-track"
                cx="64"
                cy="64"
                r={chartRadius}
                fill="none"
                strokeWidth={chartStroke}
              />
              {rows.map((row) => {
                const renderPercentage = renderTotal > 0 ? (row.value / renderTotal) * 100 : 0;
                const dashLength = (renderPercentage / 100) * chartCircumference;
                const dashGap = chartCircumference - dashLength;
                const dashOffset = chartCircumference * (1 - accumulatedPercentage / 100);
                accumulatedPercentage += renderPercentage;

                return (
                  <circle
                    key={row.key}
                    cx="64"
                    cy="64"
                    r={chartRadius}
                    fill="none"
                    stroke={row.color}
                    strokeDasharray={dashLength + " " + dashGap}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="butt"
                    strokeWidth={chartStroke}
                    transform="rotate(-90 64 64)"
                  />
                );
              })}
            </svg>
            <figcaption id={chartSummaryId} className="sr-only">
              {accessibleSummary}
            </figcaption>
          </figure>
          <ol className="budget-category-chart-legend">
            {rows.map((row) => (
              <li key={row.key} className="budget-category-chart-row">
                <span
                  className="budget-category-chart-swatch"
                  style={{ backgroundColor: row.color }}
                />
                <span className="budget-category-chart-label">{row.label}</span>
                <span className="budget-category-chart-value">{formatYen(row.value)}</span>
                <span className="budget-category-chart-share">{formatPercentage(row.value, percentageTotal)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

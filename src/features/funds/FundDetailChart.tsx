import { useId } from "react";
import {
  getRateMetric,
  type BalanceRateThresholds,
  type ExecutionRateThresholds,
  type RateMetricKey,
} from "../../lib/executionRate";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import {
  createFundDetailChartData,
  createFundDetailChartDataForPalette,
  type FundDetailChartSegment,
} from "./fundDetailChart";
import {
  getOverviewChartPalette,
  isOverviewChartPresetKey,
  type CustomOverviewChartPreset,
  type OverviewChartPresetRef,
} from "../overview/overviewChart";

type FundDetailChartProps = {
  fundName: string;
  awardedAmount: number;
  categories: Array<{
    id: number;
    categoryName: string;
    plannedAmount: number;
    actualAmount: number;
  }>;
  preset: OverviewChartPresetRef;
  customChartPresets: CustomOverviewChartPreset[];
  rateMetric: RateMetricKey;
  amountDisplayMode: AmountDisplayMode;
  executionRateThresholds: ExecutionRateThresholds;
  balanceRateThresholds: BalanceRateThresholds;
};

type RingProps = {
  radius: number;
  strokeWidth: number;
  segments: FundDetailChartSegment[];
  trackClassName: string;
};

function Ring({ radius, strokeWidth, segments, trackClassName }: RingProps) {
  const circumference = 2 * Math.PI * radius;
  const isDarkTheme =
    typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
  let accumulatedPercentage = 0;

  return (
    <>
      <circle
        className={trackClassName}
        cx="80"
        cy="80"
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
      />
      {segments.map((segment) => {
        const dashLength = (segment.percentage / 100) * circumference;
        const dashOffset = circumference * (1 - accumulatedPercentage / 100);
        accumulatedPercentage += segment.percentage;

        return (
          <g key={segment.key}>
            {segment.borderColor ? (
              <circle
                className={isDarkTheme ? "fund-card-donut-segment-border-dark-hidden" : undefined}
                cx="80"
                cy="80"
                r={radius}
                fill="none"
                stroke={segment.borderColor}
                strokeLinecap="butt"
                strokeWidth={strokeWidth + 2}
                strokeDasharray={`${dashLength} ${circumference - dashLength}`}
                strokeDashoffset={dashOffset}
                transform="rotate(-90 80 80)"
              />
            ) : null}
            <circle
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeLinecap="butt"
              strokeWidth={strokeWidth}
              strokeDasharray={`${dashLength} ${circumference - dashLength}`}
              strokeDashoffset={dashOffset}
              transform="rotate(-90 80 80)"
            />
          </g>
        );
      })}
    </>
  );
}

export function FundDetailChart({
  fundName,
  awardedAmount,
  categories,
  preset,
  customChartPresets,
  rateMetric,
  amountDisplayMode,
  executionRateThresholds,
  balanceRateThresholds,
}: FundDetailChartProps) {
  const chartSummaryId = useId();
  const actualLegendTitle = "執行済";
  const plannedLegendTitle = "執行予定";
  const overBudgetRingRadius = 67;
  const overBudgetRingCircumference = 2 * Math.PI * overBudgetRingRadius;
  const chartData = isOverviewChartPresetKey(preset)
    ? createFundDetailChartData(categories, awardedAmount, preset, amountDisplayMode)
    : createFundDetailChartDataForPalette(
        categories,
        awardedAmount,
        getOverviewChartPalette(preset, customChartPresets),
        amountDisplayMode,
      );
  const rate = getRateMetric(
    rateMetric,
    awardedAmount,
    chartData.plannedAmount,
    chartData.actualAmount,
    chartData.freeBalance,
    executionRateThresholds,
    balanceRateThresholds,
  );
  const actualLegendSegments = chartData.legendSegments.filter((segment) => segment.label.includes("執行済"));
  const plannedLegendSegments = chartData.legendSegments.filter((segment) => segment.label.includes("執行予定"));
  const balanceLegendSegments = chartData.legendSegments.filter((segment) => segment.label === "残高");
  const outerLegendStyleByTitle = Object.fromEntries(
    chartData.innerRingSegments.map((segment) => [
      segment.label,
      {
        backgroundColor: segment.color,
        boxShadow: segment.borderColor
          ? `inset 0 0 0 1px ${segment.borderColor}`
          : undefined,
      },
    ]),
  ) as Record<"執行済" | "執行予定" | "残高", { backgroundColor: string; boxShadow?: string }>;

  const legendGroupCandidates: Array<{
    title: "執行済" | "執行予定" | "残高";
    segments: FundDetailChartSegment[];
  }> = [
    { title: "執行済", segments: actualLegendSegments },
    { title: "執行予定", segments: plannedLegendSegments },
    { title: "残高", segments: balanceLegendSegments },
  ];
  const legendGroups = legendGroupCandidates.filter((group) => group.segments.length > 0);

  function getLegendLabel(groupTitle: "執行済" | "執行予定" | "残高", segmentLabel: string) {
    if (groupTitle === "残高") {
      return segmentLabel;
    }

    return segmentLabel
      .replace(/\s+執行済$/, "")
      .replace(/\s+執行予定$/, "");
  }

  return (
    <div className="detail-fund-chart">
      <figure className="fund-card-donut detail-fund-chart-figure">
        <svg
          viewBox="0 0 160 160"
          role="img"
          aria-label={`${fundName} の費目別執行内訳`}
          aria-describedby={chartSummaryId}
          focusable="false"
        >
          {chartData.overBudgetPercentage > 0 ? (
            <circle
              className="fund-card-over-budget-ring"
              cx="80"
              cy="80"
              r={overBudgetRingRadius}
              fill="none"
              strokeDasharray={`${
                (chartData.overBudgetPercentage / 100) * overBudgetRingCircumference
              } ${overBudgetRingCircumference}`}
              strokeDashoffset="0"
              strokeLinecap="butt"
              strokeWidth="6"
              transform="rotate(-90 80 80)"
            />
          ) : null}
          <Ring
            radius={54}
            strokeWidth={14}
            segments={chartData.outerRingSegments}
            trackClassName="detail-fund-chart-track"
          />
          <Ring
            radius={40}
            strokeWidth={14}
            segments={chartData.innerRingSegments}
            trackClassName="fund-card-donut-track"
          />
          {chartData.overBudgetAmount > 0 ? (
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
                {formatAmount(-chartData.overBudgetAmount, amountDisplayMode)}
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
          {chartData.accessibleSummary}
        </figcaption>
      </figure>

      <div className="detail-fund-chart-legend-groups" aria-label={`${fundName} の凡例`}>
        {legendGroups.map((group) => (
          <section
            key={group.title}
            className="detail-fund-chart-legend-group"
            aria-label={`${
              group.title === "執行済"
                ? actualLegendTitle
                : group.title === "執行予定"
                  ? plannedLegendTitle
                  : group.title
            } の凡例`}
          >
            <div className="detail-fund-chart-legend-heading">
              <h4 className="detail-fund-chart-legend-title">
                {group.title === "執行済"
                  ? actualLegendTitle
                  : group.title === "執行予定"
                    ? plannedLegendTitle
                    : group.title}
              </h4>
              <span
                aria-hidden="true"
                className="fund-card-legend-chip detail-fund-chart-legend-parent-chip"
                style={outerLegendStyleByTitle[group.title]}
              />
            </div>
            <div className="fund-card-legend detail-fund-chart-legend">
              {group.segments.map((segment) => (
                <p key={segment.key} className="fund-card-legend-row">
                  <span
                    aria-hidden="true"
                    className="fund-card-legend-chip"
                    style={{
                      backgroundColor: segment.color,
                      boxShadow: segment.borderColor
                        ? `inset 0 0 0 1px ${segment.borderColor}`
                        : undefined,
                    }}
                  />
                  <span className="fund-card-legend-label">{getLegendLabel(group.title, segment.label)}</span>
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

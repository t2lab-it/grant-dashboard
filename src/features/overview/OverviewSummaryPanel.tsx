import { useId } from "react";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import { formatTokyoDateKey, formatTokyoMonthKey, getTokyoCalendarDate } from "../../lib/calendar";
import { type BalanceRateThresholds } from "../../lib/executionRate";
import {
  CROSS_AGGREGATE_CATEGORY_LABELS,
  type CrossAggregateCategory,
} from "../../contracts/crossAggregateCategory";
import {
  getCrossAggregateChartColors,
  type CrossAggregateChartColors,
  type OverviewChartPalette,
} from "./overviewChart";

export type OverviewSummaryMetricKey = "assets" | "actual" | "committed" | "balance";

type OverviewTotals = {
  assets: number;
  committed: number;
  actual: number;
  freeBalance: number;
};

type OverviewMonthlyStatus = {
  month: string;
  committed: number;
  actual: number;
  balance: number;
};

type OverviewSummaryFund = {
  id: number;
  name: string;
  awarded_amount: number;
  committed_amount: number;
  actual_amount: number;
  freeBalance: number;
};

type OverviewCrossAggregateCategory = {
  crossAggregateCategory: CrossAggregateCategory;
  budgetAmount: number | null;
  plannedAmount: number;
  actualAmount: number;
};

type OverviewSummaryPanelProps = {
  id: string;
  amountDisplayMode: AmountDisplayMode;
  balanceRateThresholds: BalanceRateThresholds;
  funds: OverviewSummaryFund[];
  linkedActualAmount: number;
  metric: OverviewSummaryMetricKey;
  monthlyStatus: OverviewMonthlyStatus[];
  pendingPlannedCount: number;
  crossAggregateCategories: OverviewCrossAggregateCategory[];
  palette: OverviewChartPalette;
  totals: OverviewTotals;
};

type OverviewTrendPoint = {
  month: string;
  value: number;
};

type OverviewInsight = {
  help?: string;
  label: string;
  value: string;
};

const metricCopy = {
  assets: {
    label: "予算総額",
    breakdownLabel: "予算総額（パーセント）",
    trendLabel: "執行+予定累計",
  },
  actual: {
    label: "執行済額",
    breakdownLabel: "執行済額（パーセント）",
    trendLabel: "累計執行済額",
  },
  committed: {
    label: "執行予定額",
    breakdownLabel: "執行予定額（パーセント）",
    trendLabel: "予定残高",
    trendHelp:
      "すでに計画済みだが、まだ支出完了していない金額です。0円になるのは、事前に計画した支出がすべて完了したときです。予算の自由残高が0円という意味ではありません。例: 25万円を計画し、そのうち5万円を支出済みなら、残りの予定残高は20万円です。",
  },
  balance: {
    label: "残高",
    breakdownLabel: "残高（パーセント）",
    trendLabel: "残高",
  },
} as const;

function getTotalMetricValue(metric: OverviewSummaryMetricKey, totals: OverviewTotals) {
  switch (metric) {
    case "assets":
      return totals.assets;
    case "actual":
      return totals.actual;
    case "committed":
      return totals.committed;
    case "balance":
      return totals.freeBalance;
  }
}

function getFundMetricValue(metric: OverviewSummaryMetricKey, fund: OverviewSummaryFund) {
  switch (metric) {
    case "assets":
      return fund.awarded_amount;
    case "actual":
      return fund.actual_amount;
    case "committed":
      return fund.committed_amount;
    case "balance":
      return fund.freeBalance;
  }
}

function getCrossAggregateMetricValue(
  metric: OverviewSummaryMetricKey,
  row: OverviewCrossAggregateCategory,
) {
  switch (metric) {
    case "assets":
      return row.budgetAmount ?? 0;
    case "actual":
      return row.actualAmount;
    case "committed":
      return row.plannedAmount;
    case "balance":
      return (row.budgetAmount ?? 0) - row.plannedAmount - row.actualAmount;
  }
}

function getMonthlyMetricValue(metric: OverviewSummaryMetricKey, month: OverviewMonthlyStatus, totalAssets: number) {
  switch (metric) {
    case "assets":
      return totalAssets - month.balance;
    case "actual":
      return month.actual;
    case "committed":
      return month.committed;
    case "balance":
      return month.balance;
  }
}

function getMonthlyMetricSeries(
  metric: OverviewSummaryMetricKey,
  monthlyStatus: OverviewMonthlyStatus[],
  totals: OverviewTotals,
) {
  switch (metric) {
    case "actual": {
      let runningActual = 0;

      return monthlyStatus.map((month) => {
        runningActual += month.actual;

        return {
          month: month.month,
          value: runningActual,
        };
      });
    }
    case "committed": {
      let runningCommitted = monthlyStatus.reduce((sum, month) => sum + month.committed, 0);

      return monthlyStatus.map((month) => {
        const point = {
          month: month.month,
          value: runningCommitted,
        };
        runningCommitted -= month.committed;

        return point;
      });
    }
    default:
      return monthlyStatus.map((month) => ({
        month: month.month,
        value: getMonthlyMetricValue(metric, month, totals.assets),
      }));
  }
}

function getTrendTargetValue(metric: OverviewSummaryMetricKey, totals: OverviewTotals) {
  switch (metric) {
    case "assets":
    case "actual":
      return totals.assets;
    case "committed":
    case "balance":
      return 0;
  }
}

function formatPercentage(value: number, base: number) {
  if (base <= 0) {
    return "0.0%";
  }

  return `${((value / base) * 100).toFixed(1)}%`;
}

function formatMonthAxisLabel(month: string) {
  return month.split("-").at(-1) ?? month;
}

function formatSignedAmount(value: number, amountDisplayMode: AmountDisplayMode) {
  if (value === 0) {
    return formatAmount(0, amountDisplayMode);
  }

  return `${value > 0 ? "+" : "-"}${formatAmount(Math.abs(value), amountDisplayMode)}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCurrentMonthKey() {
  return formatTokyoMonthKey(new Date());
}

function getTodayProgressLabel(metric: OverviewSummaryMetricKey, points: OverviewTrendPoint[], targetValue: number) {
  const currentMonthKey = getCurrentMonthKey();
  const currentPoint = points.find((point) => point.month === currentMonthKey);

  if (!currentPoint) {
    return null;
  }

  if (targetValue > 0) {
    return formatPercentage(currentPoint.value, targetValue);
  }

  const startingValue = points[0]?.value ?? 0;

  if (startingValue <= 0) {
    return "100.0%";
  }

  const progress = ((startingValue - currentPoint.value) / startingValue) * 100;

  return formatPercentage(Math.max(0, Math.min(progress, 100)), 100);
}

function getTodayGoalProgress(metric: OverviewSummaryMetricKey, points: OverviewTrendPoint[], targetValue: number) {
  const currentMonthKey = getCurrentMonthKey();
  const currentPoint = points.find((point) => point.month === currentMonthKey);

  if (!currentPoint) {
    return null;
  }

  if (targetValue > 0) {
    return clamp(currentPoint.value / targetValue, 0, 1);
  }

  const startingValue = points[0]?.value ?? 0;

  if (startingValue <= 0) {
    return 1;
  }

  return clamp((startingValue - currentPoint.value) / startingValue, 0, 1);
}

function getTimelineProgress(todayMarkerX: number, chartWidth: number, paddingLeft: number) {
  return clamp((todayMarkerX - paddingLeft) / Math.max(chartWidth, 1), 0, 1);
}

function getIdealTrendValue(points: OverviewTrendPoint[], targetValue: number, timelineProgress: number) {
  if (targetValue > 0) {
    return targetValue * timelineProgress;
  }

  const startingValue = points[0]?.value ?? 0;
  return startingValue + (targetValue - startingValue) * timelineProgress;
}

function formatPointDelta(delta: number) {
  return `${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)}pt`;
}

function getTodayIdealDeltaLabel(
  metric: OverviewSummaryMetricKey,
  points: OverviewTrendPoint[],
  targetValue: number,
  todayMarkerX: number,
  chartWidth: number,
  paddingLeft: number,
) {
  const currentProgress = getTodayGoalProgress(metric, points, targetValue);

  if (currentProgress === null) {
    return null;
  }

  const idealProgress = getTimelineProgress(todayMarkerX, chartWidth, paddingLeft);
  return `理想比 ${formatPointDelta((currentProgress - idealProgress) * 100)}`;
}

function getTodayAnnotationLines(todayProgressLabel: string | null, todayIdealDeltaLabel: string | null) {
  return [
    todayProgressLabel ? `進捗：${todayProgressLabel}` : null,
    todayIdealDeltaLabel ? todayIdealDeltaLabel.replace("理想比 ", "理想比：") : null,
  ].filter((label): label is string => Boolean(label));
}

function getTodayProgressLabelPlacement({
  chartPoints,
  height,
  idealY,
  labelLines,
  padding,
  targetY,
  todayMarkerX,
  width,
}: {
  chartPoints: Array<OverviewTrendPoint & { x: number; y: number }>;
  height: number;
  idealY: number | null;
  labelLines: string[];
  padding: { top: number; right: number; bottom: number; left: number };
  targetY: number;
  todayMarkerX: number;
  width: number;
}) {
  const estimatedLabelWidth = Math.max(56, ...labelLines.map((line) => line.length * 7.8));
  const lineHeight = 13;
  const blockHeight = 6 + lineHeight * labelLines.length;
  const rightX = todayMarkerX + 8;
  const leftX = todayMarkerX - 8;
  const canPlaceRight = todayMarkerX + 10 + estimatedLabelWidth <= width - padding.right;
  const nearestPoint = chartPoints.reduce<(typeof chartPoints)[number] | null>((closest, point) => {
    if (!closest) {
      return point;
    }

    return Math.abs(point.x - todayMarkerX) < Math.abs(closest.x - todayMarkerX) ? point : closest;
  }, null);
  const obstacles = [targetY, idealY, nearestPoint?.y ?? null].filter((value): value is number => value !== null);
  const candidateYs = [
    padding.top + 12,
    padding.top + 28,
    height - padding.bottom - blockHeight + lineHeight,
    height - padding.bottom - blockHeight - 6 + lineHeight,
  ];

  const bestY = candidateYs
    .map((y) => {
      const blockCenterY = y + (lineHeight * (labelLines.length - 1)) / 2;

      return {
        clearance: Math.min(...obstacles.map((obstacleY) => Math.abs(obstacleY - blockCenterY))),
        y,
      };
    })
    .sort((left, right) => right.clearance - left.clearance)[0]?.y ?? padding.top + 12;
  const textAnchor = canPlaceRight ? "start" : "end";
  const x = canPlaceRight ? rightX : leftX;
  const surfacePaddingX = 5;
  const surfacePaddingY = 4;
  const surfaceWidth = estimatedLabelWidth + surfacePaddingX * 2;
  const unclampedSurfaceX = textAnchor === "start" ? x - surfacePaddingX : x - estimatedLabelWidth - surfacePaddingX;
  const surfaceX = clamp(unclampedSurfaceX, padding.left + 2, width - padding.right - surfaceWidth - 2);
  const textX = textAnchor === "start" ? surfaceX + surfacePaddingX : surfaceX + surfaceWidth - surfacePaddingX;

  return {
    lineHeight,
    surfaceHeight: blockHeight,
    surfaceWidth,
    surfaceX,
    surfaceY: bestY - lineHeight + 1 - surfacePaddingY,
    textAnchor,
    x: textX,
    y: bestY,
  } as const;
}

function getIdealLineStartValue(metric: OverviewSummaryMetricKey, points: OverviewTrendPoint[]) {
  if (metric === "assets" || metric === "actual") {
    return 0;
  }

  return points[0]?.value ?? 0;
}

function getRecentAverageActual(monthlyStatus: OverviewMonthlyStatus[]) {
  const recentActuals = monthlyStatus.slice(-3).map((month) => month.actual);

  if (recentActuals.length === 0) {
    return 0;
  }

  return recentActuals.reduce((sum, value) => sum + value, 0) / recentActuals.length;
}

function getTodayMarker(
  points: OverviewTrendPoint[],
  chartWidth: number,
  paddingLeft: number,
): { dateLabel: string; x: number } | null {
  const today = new Date();
  const monthKey = formatTokyoMonthKey(today);
  const monthIndex = points.findIndex((point) => point.month === monthKey);

  if (monthIndex === -1 || points.length === 0) {
    return null;
  }

  const bandWidth = chartWidth / points.length;
  const { year, month, day } = getTokyoCalendarDate(today);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayPosition = (day - 0.5) / Math.max(daysInMonth, 1);

  return {
    dateLabel: formatTokyoDateKey(today),
    x: paddingLeft + bandWidth * (monthIndex + dayPosition),
  };
}

function getTrendTargetLabel(metric: OverviewSummaryMetricKey, targetValue: number, amountDisplayMode: AmountDisplayMode) {
  if (metric === "committed") {
    return "目標: 計画済み支出を完了";
  }

  return `目標 ${formatAmount(targetValue, amountDisplayMode)}`;
}

function OverviewHelp({
  description,
  label,
}: {
  description: string;
  label: string;
}) {
  const helpId = useId();

  return (
    <span className="overview-context-help">
      <button
        type="button"
        className="overview-context-help-trigger"
        aria-label={`${label}の定義`}
        aria-describedby={helpId}
      >
        ?
      </button>
      <span id={helpId} role="tooltip" className="overview-context-help-tooltip">
        {description}
      </span>
    </span>
  );
}

function createInsightCards({
  amountDisplayMode,
  funds,
  linkedActualAmount,
  metric,
  monthlyStatus,
  pendingPlannedCount,
  totals,
}: {
  amountDisplayMode: AmountDisplayMode;
  funds: OverviewSummaryFund[];
  linkedActualAmount: number;
  metric: OverviewSummaryMetricKey;
  monthlyStatus: OverviewMonthlyStatus[];
  pendingPlannedCount: number;
  totals: OverviewTotals;
}): OverviewInsight[] {
  switch (metric) {
    case "assets": {
      return [
        { label: "予算数", value: `${funds.length}件` },
        { label: "計画化率", value: formatPercentage(totals.actual + totals.committed, totals.assets) },
      ];
    }
    case "actual": {
      const latestActual = monthlyStatus.at(-1)?.actual ?? 0;
      const previousActual = monthlyStatus.at(-2)?.actual ?? 0;
      const recentAverage = getRecentAverageActual(monthlyStatus);

      return [
        { label: "前月差", value: formatSignedAmount(latestActual - previousActual, amountDisplayMode) },
        { label: "到達率", value: formatPercentage(totals.actual, totals.assets) },
        { label: "直近3ヶ月平均執行額", value: formatAmount(recentAverage, amountDisplayMode) },
      ];
    }
    case "committed": {
      const currentMonthKey = getCurrentMonthKey();
      const overduePlannedAmount = monthlyStatus
        .filter((month) => month.month < currentMonthKey)
        .reduce((sum, month) => sum + month.committed, 0);
      const trackedPlannedAmount = linkedActualAmount + totals.committed;

      return [
        {
          label: "計画済み支出の実行率",
          help:
            "計画済み支出のうち、すでに実績化した割合です。実績化済み金額 ÷（実績化済み金額 + まだ未完了の計画済み金額）で計算します。",
          value: formatPercentage(linkedActualAmount, trackedPlannedAmount || 1),
        },
        { label: "未実行予定件数", value: `${pendingPlannedCount}件` },
        {
          label: "期限超過の予定残高",
          help:
            "過去月に予定していたのに、まだ支出完了していない予定残高です。例: 4月予定の25万円のうち5万円だけ実績化済みなら、5月時点の期限超過の予定残高は20万円です。",
          value: formatAmount(overduePlannedAmount, amountDisplayMode),
        },
      ];
    }
    case "balance": {
      const lowestBalanceFund = [...funds]
        .filter((fund) => fund.awarded_amount > 0)
        .sort((left, right) => left.freeBalance / left.awarded_amount - right.freeBalance / right.awarded_amount)[0];

      return [
        { label: "未計画率", value: formatPercentage(totals.freeBalance, totals.assets) },
        {
          label: "最低残高率",
          value: lowestBalanceFund
            ? formatPercentage(lowestBalanceFund.freeBalance, lowestBalanceFund.awarded_amount)
            : "0.0%",
        },
      ];
    }
  }
}

function OverviewTrendChart({
  amountDisplayMode,
  label,
  metric,
  points,
  targetValue,
}: {
  amountDisplayMode: AmountDisplayMode;
  label: string;
  metric: OverviewSummaryMetricKey;
  points: OverviewTrendPoint[];
  targetValue: number;
}) {
  const summaryId = useId();
  const width = 320;
  const height = 150;
  const padding = { top: 16, right: 14, bottom: 16, left: 14 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;
  const minValue = Math.min(targetValue, 0, ...points.map((point) => point.value));
  const maxValue = Math.max(targetValue, 0, ...points.map((point) => point.value));
  const valueRange = Math.max(maxValue - minValue, 1);
  const describeValue = (value: number) => formatAmount(value, amountDisplayMode);
  const targetLabel = getTrendTargetLabel(metric, targetValue, amountDisplayMode);
  const todayMarker = getTodayMarker(points, chartWidth, padding.left);
  const todayProgressLabel = getTodayProgressLabel(metric, points, targetValue);
  const todayIdealDeltaLabel = todayMarker
    ? getTodayIdealDeltaLabel(metric, points, targetValue, todayMarker.x, chartWidth, padding.left)
    : null;
  const chartPoints = points.map((point, index) => {
    const x =
      points.length === 1 ? width / 2 : padding.left + (chartWidth * index) / Math.max(points.length - 1, 1);
    const y = padding.top + ((maxValue - point.value) / valueRange) * chartHeight;

    return { ...point, x, y };
  });
  const idealStartValue = getIdealLineStartValue(metric, points);
  const idealStartY = padding.top + ((maxValue - idealStartValue) / valueRange) * chartHeight;
  const targetY = padding.top + ((maxValue - targetValue) / valueRange) * chartHeight;
  const todayIdealY =
    todayMarker
      ? padding.top +
        ((maxValue - getIdealTrendValue(points, targetValue, getTimelineProgress(todayMarker.x, chartWidth, padding.left))) /
          valueRange) *
          chartHeight
      : null;
  const polylinePoints = chartPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const todayLabels = getTodayAnnotationLines(todayProgressLabel, todayIdealDeltaLabel);
  const todayProgressLabelPlacement =
    todayMarker && todayLabels.length > 0
      ? getTodayProgressLabelPlacement({
          chartPoints,
          height,
          idealY: todayIdealY,
          labelLines: todayLabels,
          padding,
          targetY,
          todayMarkerX: todayMarker.x,
          width,
        })
      : null;
  const accessibleSummary = [
    `目標 ${describeValue(targetValue)}`,
    todayMarker ? `現在日 ${todayMarker.dateLabel}` : null,
    todayProgressLabel ? `現在進捗 ${todayProgressLabel}` : null,
    todayIdealDeltaLabel,
    ...points.map((point) => `${point.month} ${describeValue(point.value)}`),
  ]
    .filter((item): item is string => Boolean(item))
    .join("、");

  return (
    <div className="overview-context-trend">
      <div className="overview-context-trend-meta">
        <span className="overview-context-trend-target-badge">{targetLabel}</span>
      </div>
      <figure className="overview-context-trend-figure">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${label}の月次推移グラフ`}
          aria-describedby={summaryId}
          className="overview-context-trend-chart"
          focusable="false"
        >
          <rect
            x={padding.left}
            y={padding.top}
            width={chartWidth}
            height={chartHeight}
            rx="14"
            className="overview-context-trend-surface"
          />
          <line
            x1={padding.left}
            y1={idealStartY}
            x2={width - padding.right}
            y2={targetY}
            className="overview-context-trend-ideal-line"
          />
          <line
            x1={padding.left}
            y1={targetY}
            x2={width - padding.right}
            y2={targetY}
            className="overview-context-trend-target-line"
          />
          {todayMarker ? (
            <line
              x1={todayMarker.x}
              y1={padding.top}
              x2={todayMarker.x}
              y2={height - padding.bottom}
              className="overview-context-trend-today-line"
              aria-hidden="true"
            />
          ) : null}
          {chartPoints.length > 1 ? (
            <polyline points={polylinePoints} fill="none" className="overview-context-trend-series-line" />
          ) : null}
          {chartPoints.map((point, index) => (
            <circle
              key={point.month}
              cx={point.x}
              cy={point.y}
              r={index === chartPoints.length - 1 ? 4.5 : 3.5}
              className="overview-context-trend-point"
            />
          ))}
          {todayMarker && todayLabels.length > 0 ? (
            <g aria-hidden="true">
              <rect
                x={todayProgressLabelPlacement?.surfaceX ?? todayMarker.x - 6}
                y={todayProgressLabelPlacement?.surfaceY ?? padding.top + 2}
                width={todayProgressLabelPlacement?.surfaceWidth ?? 72}
                height={todayProgressLabelPlacement?.surfaceHeight ?? 22}
                rx="8"
                className="overview-context-trend-today-label-surface"
              />
              {todayLabels.map((line, index) => (
                <text
                  key={line}
                  x={todayProgressLabelPlacement?.x ?? todayMarker.x}
                  y={
                    (todayProgressLabelPlacement?.y ?? padding.top + 12) +
                    index * (todayProgressLabelPlacement?.lineHeight ?? 13)
                  }
                  className="overview-context-trend-today-label"
                  textAnchor={todayProgressLabelPlacement?.textAnchor ?? "start"}
                >
                  {line}
                </text>
              ))}
            </g>
          ) : null}
        </svg>
        <figcaption id={summaryId} className="sr-only">
          {accessibleSummary}
        </figcaption>
      </figure>
      <div
        className="overview-context-trend-axis"
        style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}
      >
        {points.map((point) => (
          <span key={point.month}>{formatMonthAxisLabel(point.month)}</span>
        ))}
      </div>
    </div>
  );
}

function OverviewCrossAggregateDonut({
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

export function OverviewSummaryPanel({
  id,
  amountDisplayMode,
  crossAggregateCategories,
  funds,
  linkedActualAmount,
  metric,
  monthlyStatus,
  pendingPlannedCount,
  palette,
  totals,
}: OverviewSummaryPanelProps) {
  const copy = metricCopy[metric];
  const totalValue = getTotalMetricValue(metric, totals);
  const breakdown = [...funds]
    .map((fund) => ({
      id: fund.id,
      name: fund.name,
      value: getFundMetricValue(metric, fund),
    }))
    .sort((left, right) => right.value - left.value);
  const insights = createInsightCards({
    amountDisplayMode,
    funds,
    linkedActualAmount,
    metric,
    monthlyStatus,
    pendingPlannedCount,
    totals,
  });
  const monthlySeries = getMonthlyMetricSeries(metric, monthlyStatus, totals);
  const trendTargetValue = getTrendTargetValue(metric, totals);
  const crossAggregateChartColors = getCrossAggregateChartColors(palette);

  return (
    <aside
      id={id}
      className="overview-context-panel"
      aria-label="予算概要の分析"
      data-testid="tour-target-overview-summary"
      data-tour-id="overview-summary"
    >
      <div className="overview-context-panel-header">
        <div>
          <h2>{`${copy.label}の分析`}</h2>
        </div>
        <div className="overview-context-panel-value">
          <strong>{formatAmount(totalValue, amountDisplayMode)}</strong>
        </div>
      </div>

      <section className="overview-context-panel-section" aria-labelledby={`${id}-breakdown-heading`}>
        <div className="overview-context-panel-section-header">
          <h3 id={`${id}-breakdown-heading`}>予算別内訳</h3>
          <span>{copy.breakdownLabel}</span>
        </div>
        {breakdown.length > 0 ? (
          <ol className="overview-context-list">
            {breakdown.map((item, index) => (
              <li key={item.id} className="overview-context-row overview-context-row-compact">
                <span className="overview-context-inline-summary">
                  <span className="overview-context-inline-rank">{`${index + 1}.`}</span>
                  <span className="overview-context-inline-name">{item.name}</span>
                  <span className="overview-context-inline-value">{formatAmount(item.value, amountDisplayMode)}</span>
                  <span className="overview-context-inline-share">{`(${formatPercentage(item.value, totalValue || 1)})`}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="overview-context-empty">まだデータがありません。</p>
        )}
      </section>

      {metric !== "balance" ? (
        <section className="overview-context-panel-section" aria-labelledby={`${id}-cross-aggregate-heading`}>
          <div className="overview-context-panel-section-header">
            <h3 id={`${id}-cross-aggregate-heading`}>大費目別内訳</h3>
            <span>{`${copy.label}（パーセント）`}</span>
          </div>
          <OverviewCrossAggregateDonut
            amountDisplayMode={amountDisplayMode}
            colors={crossAggregateChartColors}
            metric={metric}
            rows={crossAggregateCategories}
            totalValue={totalValue}
          />
        </section>
      ) : null}

      <section className="overview-context-panel-section" aria-labelledby={`${id}-trend-heading`}>
        <div className="overview-context-panel-section-header">
          <h3 id={`${id}-trend-heading`}>月次推移</h3>
          <span className="overview-context-panel-section-label">
            {copy.trendLabel}
            {"trendHelp" in copy ? (
              <OverviewHelp label={copy.trendLabel} description={copy.trendHelp} />
            ) : null}
          </span>
        </div>
        {monthlySeries.length > 0 ? (
          <OverviewTrendChart
            amountDisplayMode={amountDisplayMode}
            label={copy.label}
            metric={metric}
            points={monthlySeries}
            targetValue={trendTargetValue}
          />
        ) : (
          <p className="overview-context-empty">まだ月次データがありません。</p>
        )}
      </section>

      <section className="overview-context-panel-section">
        <div className="overview-context-insight-grid">
          {insights.map((insight) => (
            <article key={insight.label} className="overview-context-insight-card">
              <span className="overview-context-insight-label">
                {insight.label}
                {insight.help ? (
                  <OverviewHelp label={insight.label} description={insight.help} />
                ) : null}
              </span>
              <strong>{insight.value}</strong>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}

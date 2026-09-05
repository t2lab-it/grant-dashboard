import { formatTokyoDateKey, formatTokyoMonthKey, getTokyoCalendarDate } from "../../lib/calendar";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import type { OverviewCrossAggregateCategory, OverviewMonthlyStatus, OverviewSummaryFund, OverviewSummaryMetricKey, OverviewTotals, OverviewTrendPoint } from "./overviewSummaryTypes";

export const metricCopy = {
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

export function getTotalMetricValue(metric: OverviewSummaryMetricKey, totals: OverviewTotals) {
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
export function getFundMetricValue(metric: OverviewSummaryMetricKey, fund: OverviewSummaryFund) {
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

export function getCrossAggregateMetricValue(
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

export function getMonthlyMetricValue(metric: OverviewSummaryMetricKey, month: OverviewMonthlyStatus, totalAssets: number) {
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

export function getMonthlyMetricSeries(
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

export function getTrendTargetValue(metric: OverviewSummaryMetricKey, totals: OverviewTotals) {
  switch (metric) {
    case "assets":
    case "actual":
      return totals.assets;
    case "committed":
    case "balance":
      return 0;
  }
}

export function formatPercentage(value: number, base: number) {
  if (base <= 0) {
    return "0.0%";
  }

  return `${((value / base) * 100).toFixed(1)}%`;
}

export function formatMonthAxisLabel(month: string) {
  return month.split("-").at(-1) ?? month;
}

export function formatSignedAmount(value: number, amountDisplayMode: AmountDisplayMode) {
  if (value === 0) {
    return formatAmount(0, amountDisplayMode);
  }

  return `${value > 0 ? "+" : "-"}${formatAmount(Math.abs(value), amountDisplayMode)}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getCurrentMonthKey() {
  return formatTokyoMonthKey(new Date());
}

export function getTodayProgressLabel(points: OverviewTrendPoint[], targetValue: number) {
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

export function getTodayGoalProgress(points: OverviewTrendPoint[], targetValue: number) {
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

export function getTimelineProgress(todayMarkerX: number, chartWidth: number, paddingLeft: number) {
  return clamp((todayMarkerX - paddingLeft) / Math.max(chartWidth, 1), 0, 1);
}

export function getIdealTrendValue(points: OverviewTrendPoint[], targetValue: number, timelineProgress: number) {
  if (targetValue > 0) {
    return targetValue * timelineProgress;
  }

  const startingValue = points[0]?.value ?? 0;
  return startingValue + (targetValue - startingValue) * timelineProgress;
}

export function formatPointDelta(delta: number) {
  return `${delta >= 0 ? "+" : "-"}${Math.abs(delta).toFixed(1)}pt`;
}

export function getTodayIdealDeltaLabel(
  points: OverviewTrendPoint[],
  targetValue: number,
  todayMarkerX: number,
  chartWidth: number,
  paddingLeft: number,
) {
  const currentProgress = getTodayGoalProgress(points, targetValue);

  if (currentProgress === null) {
    return null;
  }

  const idealProgress = getTimelineProgress(todayMarkerX, chartWidth, paddingLeft);
  return `理想比 ${formatPointDelta((currentProgress - idealProgress) * 100)}`;
}

export function getTodayAnnotationLines(todayProgressLabel: string | null, todayIdealDeltaLabel: string | null) {
  return [
    todayProgressLabel ? `進捗：${todayProgressLabel}` : null,
    todayIdealDeltaLabel ? todayIdealDeltaLabel.replace("理想比 ", "理想比：") : null,
  ].filter((label): label is string => Boolean(label));
}

export function getTodayProgressLabelPlacement({
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

export function getIdealLineStartValue(metric: OverviewSummaryMetricKey, points: OverviewTrendPoint[]) {
  if (metric === "assets" || metric === "actual") {
    return 0;
  }

  return points[0]?.value ?? 0;
}

export function getRecentAverageActual(monthlyStatus: OverviewMonthlyStatus[]) {
  const recentActuals = monthlyStatus.slice(-3).map((month) => month.actual);

  if (recentActuals.length === 0) {
    return 0;
  }

  return recentActuals.reduce((sum, value) => sum + value, 0) / recentActuals.length;
}

export function getTodayMarker(
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

export function getTrendTargetLabel(metric: OverviewSummaryMetricKey, targetValue: number, amountDisplayMode: AmountDisplayMode) {
  if (metric === "committed") {
    return "目標: 計画済み支出を完了";
  }

  return `目標 ${formatAmount(targetValue, amountDisplayMode)}`;
}

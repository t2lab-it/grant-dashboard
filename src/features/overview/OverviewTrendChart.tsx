import { useId } from "react";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import type { OverviewSummaryMetricKey, OverviewTrendPoint } from "./overviewSummaryTypes";
import { formatMonthAxisLabel, getIdealLineStartValue, getIdealTrendValue, getTimelineProgress, getTodayAnnotationLines, getTodayIdealDeltaLabel, getTodayMarker, getTodayProgressLabel, getTodayProgressLabelPlacement, getTrendTargetLabel } from "./overviewSummaryModel";

export function OverviewTrendChart({
  amountDisplayMode,
  label,
  metric,
  onSelectMonth,
  points,
  targetValue,
}: {
  amountDisplayMode: AmountDisplayMode;
  label: string;
  metric: OverviewSummaryMetricKey;
  onSelectMonth: (month: string) => void;
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
  const todayProgressLabel = getTodayProgressLabel(points, targetValue);
  const todayIdealDeltaLabel = todayMarker
    ? getTodayIdealDeltaLabel(points, targetValue, todayMarker.x, chartWidth, padding.left)
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
          role="group"
          aria-label={`${label}の月次推移グラフ`}
          aria-describedby={summaryId}
          className="overview-context-trend-chart"
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
          {chartPoints.map((point, index) => {
            const [year, month] = point.month.split("-");
            return (
              <g
                key={point.month}
                role="button"
                tabIndex={0}
                aria-label={`${year}年${Number(month)}月の${label}データ点からサマリを開く`}
                className="overview-context-trend-point-control"
                onClick={() => onSelectMonth(point.month)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectMonth(point.month);
                  }
                }}
              >
                <circle
                  cx={point.x}
                  cy={point.y}
                  r="12"
                  className="overview-context-trend-hit-target"
                  aria-hidden="true"
                />
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={index === chartPoints.length - 1 ? 4.5 : 3.5}
                  className="overview-context-trend-point"
                  aria-hidden="true"
                />
              </g>
            );
          })}
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
        {points.map((point) => {
          const [year, month] = point.month.split("-");
          return (
            <button
              key={point.month}
              type="button"
              className="overview-context-trend-axis-button"
              aria-label={`${year}年${Number(month)}月の月ラベルから${label}サマリを開く`}
              onClick={() => onSelectMonth(point.month)}
            >
              {formatMonthAxisLabel(point.month)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

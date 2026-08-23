import { useId } from "react";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import { getCrossAggregateChartColors } from "./overviewChart";
import { OverviewCrossAggregateDonut } from "./OverviewCrossAggregateDonut";
import { OverviewTrendChart } from "./OverviewTrendChart";
import { formatPercentage, formatSignedAmount, getCurrentMonthKey, getFundMetricValue, getMonthlyMetricSeries, getRecentAverageActual, getTotalMetricValue, getTrendTargetValue, metricCopy } from "./overviewSummaryModel";
import type { OverviewInsight, OverviewMonthlyStatus, OverviewSummaryFund, OverviewSummaryMetricKey, OverviewSummaryPanelProps, OverviewTotals } from "./overviewSummaryTypes";

export type { OverviewSummaryMetricKey } from "./overviewSummaryTypes";

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

export function OverviewSummaryPanel({
  id,
  amountDisplayMode,
  crossAggregateCategories,
  funds,
  linkedActualAmount,
  metric,
  monthlyStatus,
  onSelectMonth,
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
            onSelectMonth={onSelectMonth}
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

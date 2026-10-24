import { useState } from "react";
import { CROSS_AGGREGATE_CATEGORY_LABELS } from "../../contracts/crossAggregateCategory";
import {
  getRateMetric,
  getRateMetricLabel,
  type BalanceRateThresholds,
  type ExecutionRateThresholds,
  type RateMetricKey,
} from "../../lib/executionRate";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import type { FundDetailResponse } from "./fundDetailTypes";
import { FundDetailChart } from "./FundDetailChart";
import { RateMetricToggle } from "./RateMetricToggle";
import type { CustomOverviewChartPreset, OverviewChartPresetRef } from "../overview/overviewChart";

type FundCategoriesSectionProps = {
  amountDisplayMode: AmountDisplayMode;
  awardedAmount: number;
  balanceRateThresholds: BalanceRateThresholds;
  categories: FundDetailResponse["categories"];
  crossAggregateCategories: FundDetailResponse["crossAggregateCategories"];
  customChartPresets: CustomOverviewChartPreset[];
  executionRateThresholds: ExecutionRateThresholds;
  fundName: string;
  ledgerExportHref: string;
  onEditFund: () => void;
  onRateMetricChange: (value: RateMetricKey) => void;
  plannedAmount: number;
  actualAmount: number;
  rateMetric: RateMetricKey;
  staticDemoMode: boolean;
  themePreset: OverviewChartPresetRef;
};

function formatBudgetAmount(amount: number | null, amountDisplayMode: AmountDisplayMode) {
  return amount === null ? "未設定" : formatAmount(amount, amountDisplayMode);
}

export function FundCategoriesSection({
  amountDisplayMode,
  awardedAmount,
  balanceRateThresholds,
  categories,
  crossAggregateCategories,
  customChartPresets,
  executionRateThresholds,
  fundName,
  ledgerExportHref,
  onEditFund,
  onRateMetricChange,
  plannedAmount,
  actualAmount,
  rateMetric,
  staticDemoMode,
  themePreset,
}: FundCategoriesSectionProps) {
  const [isCrossAggregateExpanded, setIsCrossAggregateExpanded] = useState(false);

  return (
    <section className="detail-panel" aria-labelledby="fund-categories-heading">
      <div className="detail-panel-header">
        <div className="detail-panel-title-actions">
          <h3 id="fund-categories-heading">費目別の状況</h3>
          <button type="button" className="detail-action-button detail-action-button-edit" onClick={onEditFund}>
            予算を編集
          </button>
        </div>
        <div className="detail-panel-actions">
          <RateMetricToggle rateMetric={rateMetric} onRateMetricChange={onRateMetricChange} />
          {staticDemoMode ? null : <a className="detail-action-button" href={ledgerExportHref}>収支簿出力</a>}
        </div>
      </div>
      <div className="detail-categories-layout">
        <div className="detail-category-tables">
          <div className="comparison-scroll" role="region" aria-label="費目別の状況の横スクロール" tabIndex={0}>
            <table className="comparison-table" aria-label="費目別の状況">
              <thead><tr><th scope="col">費目</th><th scope="col">予算</th><th scope="col">執行予定額</th><th scope="col">執行済額</th><th scope="col">{getRateMetricLabel(rateMetric).replace(" [%]", "")}</th></tr></thead>
              <tbody>{categories.map((row) => {
                const rate = getRateMetric(rateMetric, row.budgetAmount, row.plannedAmount, row.actualAmount,
                  (row.budgetAmount ?? 0) - row.plannedAmount - row.actualAmount, executionRateThresholds, balanceRateThresholds);
                return <tr key={row.id}><th scope="row">{row.categoryName}</th><td>{formatBudgetAmount(row.budgetAmount, amountDisplayMode)}</td><td>{formatAmount(row.plannedAmount, amountDisplayMode)}</td><td>{formatAmount(row.actualAmount, amountDisplayMode)}</td><td className={rate.className}>{rate.label}</td></tr>;
              })}</tbody>
              <tfoot><tr><th scope="row">合計</th><td></td><td>{formatAmount(plannedAmount, amountDisplayMode)}</td><td>{formatAmount(actualAmount, amountDisplayMode)}</td><td></td></tr></tfoot>
            </table>
          </div>
          {crossAggregateCategories.length > 0 ? (
            <div className="detail-cross-aggregate-disclosure">
              <button className="detail-cross-aggregate-toggle" type="button" aria-expanded={isCrossAggregateExpanded}
                onClick={() => setIsCrossAggregateExpanded((current) => !current)}>
                横断集計カテゴリ別の状況
              </button>
              {isCrossAggregateExpanded ? (
                <div className="comparison-scroll" role="region" aria-label="大費目別の横スクロール" tabIndex={0}>
                  <table className="comparison-table" aria-label="横断集計カテゴリ別の状況">
                    <thead><tr><th scope="col">大費目</th><th scope="col">予算</th><th scope="col">執行予定額</th><th scope="col">執行済額</th><th scope="col">残高</th></tr></thead>
                    <tbody>{crossAggregateCategories.map((row) => <tr key={row.crossAggregateCategory}>
                      <th scope="row">{CROSS_AGGREGATE_CATEGORY_LABELS[row.crossAggregateCategory]}</th>
                      <td>{formatBudgetAmount(row.budgetAmount, amountDisplayMode)}</td><td>{formatAmount(row.plannedAmount, amountDisplayMode)}</td><td>{formatAmount(row.actualAmount, amountDisplayMode)}</td><td>{formatAmount((row.budgetAmount ?? 0) - row.plannedAmount - row.actualAmount, amountDisplayMode)}</td>
                    </tr>)}</tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
        <FundDetailChart fundName={fundName} awardedAmount={awardedAmount} categories={categories} preset={themePreset}
          customChartPresets={customChartPresets} rateMetric={rateMetric} amountDisplayMode={amountDisplayMode}
          executionRateThresholds={executionRateThresholds} balanceRateThresholds={balanceRateThresholds} />
      </div>
    </section>
  );
}

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
          <div className="detail-table" role="table" aria-label="費目別の状況">
            <div className="detail-table-head" role="row">
              <span>費目</span>
              <span className="detail-table-money-heading">予算</span>
              <span className="detail-table-money-heading">執行予定額</span>
              <span className="detail-table-money-heading">執行済額</span>
              <span className="detail-table-rate-heading">{getRateMetricLabel(rateMetric).replace(" [%]", "")}</span>
            </div>
            {categories.map((row) => {
              const rate = getRateMetric(rateMetric, row.budgetAmount, row.plannedAmount, row.actualAmount,
                (row.budgetAmount ?? 0) - row.plannedAmount - row.actualAmount,
                executionRateThresholds, balanceRateThresholds);
              return (
                <div key={row.id} className="detail-table-row" role="row">
                  <strong>{row.categoryName}</strong>
                  <span className="detail-table-money-cell">{formatBudgetAmount(row.budgetAmount, amountDisplayMode)}</span>
                  <span className="detail-table-money-cell">{formatAmount(row.plannedAmount, amountDisplayMode)}</span>
                  <span className="detail-table-money-cell">{formatAmount(row.actualAmount, amountDisplayMode)}</span>
                  <span className={`detail-table-rate-cell ${rate.className}`}>{rate.label}</span>
                </div>
              );
            })}
            <div className="detail-table-row detail-table-total-row" role="row">
              <strong>合計</strong><span className="detail-table-money-cell" />
              <span className="detail-table-money-cell">{formatAmount(plannedAmount, amountDisplayMode)}</span>
              <span className="detail-table-money-cell">{formatAmount(actualAmount, amountDisplayMode)}</span>
              <span className="detail-table-rate-cell" />
            </div>
          </div>
          {crossAggregateCategories.length > 0 ? (
            <div className="detail-cross-aggregate-disclosure">
              <button className="detail-cross-aggregate-toggle" type="button" aria-expanded={isCrossAggregateExpanded}
                onClick={() => setIsCrossAggregateExpanded((current) => !current)}>
                横断集計カテゴリ別の状況
              </button>
              {isCrossAggregateExpanded ? (
                <div className="detail-table detail-cross-aggregate-table" role="table" aria-label="横断集計カテゴリ別の状況">
                  <div className="detail-table-head" role="row">
                    <span>横断集計カテゴリ</span><span className="detail-table-money-heading">予算</span>
                    <span className="detail-table-money-heading">執行予定額</span><span className="detail-table-money-heading">執行済額</span>
                    <span className="detail-table-money-heading">残高</span>
                  </div>
                  {crossAggregateCategories.map((row) => {
                    const balance = (row.budgetAmount ?? 0) - row.plannedAmount - row.actualAmount;
                    return (
                      <div key={row.crossAggregateCategory} className="detail-table-row" role="row">
                        <strong>{CROSS_AGGREGATE_CATEGORY_LABELS[row.crossAggregateCategory]}</strong>
                        <span className="detail-table-money-cell">{formatBudgetAmount(row.budgetAmount, amountDisplayMode)}</span>
                        <span className="detail-table-money-cell">{formatAmount(row.plannedAmount, amountDisplayMode)}</span>
                        <span className="detail-table-money-cell">{formatAmount(row.actualAmount, amountDisplayMode)}</span>
                        <span className="detail-table-money-cell">{formatAmount(balance, amountDisplayMode)}</span>
                      </div>
                    );
                  })}
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

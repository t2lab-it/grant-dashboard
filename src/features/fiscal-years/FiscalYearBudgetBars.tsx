import { Link } from "react-router-dom";
import type { AmountDisplayMode } from "../../lib/format";
import { formatAmount } from "../../lib/format";
import type { FiscalYearComparisonViewYear } from "./fiscalYearComparisonModel";

function segmentWidths(year: FiscalYearComparisonViewYear) {
  const assets = year.budget.assets;
  if (assets <= 0) return { actual: 0, committed: 0, balance: 0 };
  const actual = Math.min((year.budget.drawableActual / assets) * 100, 100);
  const committed = Math.min((year.budget.drawableCommitted / assets) * 100, Math.max(100 - actual, 0));
  return { actual, committed, balance: Math.max(100 - actual - committed, 0) };
}

export function FiscalYearBudgetBars({ amountDisplayMode, maxAssets, years }: {
  amountDisplayMode: AmountDisplayMode;
  maxAssets: number;
  years: FiscalYearComparisonViewYear[];
}) {
  return (
    <section className="fiscal-year-comparison-section" aria-labelledby="fiscal-year-budget-title">
      <div className="fiscal-year-comparison-section-heading">
        <h2 id="fiscal-year-budget-title">年度別の予算総額</h2>
        <div className="fiscal-year-comparison-legend" aria-label="予算総額グラフの凡例">
          <span><i className="fiscal-year-swatch fiscal-year-swatch-actual" aria-hidden="true" />執行済</span>
          <span><i className="fiscal-year-swatch fiscal-year-swatch-planned" aria-hidden="true" />執行予定</span>
          <span><i className="fiscal-year-swatch fiscal-year-swatch-balance" aria-hidden="true" />残高</span>
        </div>
      </div>
      <div className="fiscal-year-budget-chart" role="group" aria-label={`年度別の予算総額。共通軸の最大値は${formatAmount(maxAssets, amountDisplayMode)}です。`}>
        <div className="fiscal-year-budget-axis" aria-hidden="true">
          <span>0円</span>
          <span>{formatAmount(maxAssets / 2, amountDisplayMode)}</span>
          <span>{formatAmount(maxAssets, amountDisplayMode)}</span>
        </div>
        {years.map((year) => {
          const widths = segmentWidths(year);
          const outerWidth = maxAssets > 0 ? Math.max(0, Math.min((year.budget.assets / maxAssets) * 100, 100)) : 0;
          const rate = year.budget.displayRate === null ? "算出不可" : `${Math.round(year.budget.displayRate)}%`;
          return (
            <Link key={year.fiscalYear} className="fiscal-year-budget-row" to={`/?year=${year.fiscalYear}`} aria-label={`${year.fiscalYear}年度の年度ページを開く`}>
              <span className="fiscal-year-budget-year">{year.fiscalYear}年度</span>
              <span className="fiscal-year-budget-scale" aria-hidden="true">
                <span className="fiscal-year-budget-bar" style={{ width: `${outerWidth}%` }}>
                  <span className="fiscal-year-budget-segment fiscal-year-budget-segment-actual" style={{ width: `${widths.actual}%` }} />
                  <span className="fiscal-year-budget-segment fiscal-year-budget-segment-planned" style={{ width: `${widths.committed}%` }} />
                  <span className="fiscal-year-budget-segment fiscal-year-budget-segment-balance" style={{ width: `${widths.balance}%` }} />
                </span>
              </span>
              <span className="fiscal-year-budget-value">
                <strong>{formatAmount(year.budget.assets, amountDisplayMode)}</strong>
                <small>{year.budget.statusLabel} {rate}</small>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

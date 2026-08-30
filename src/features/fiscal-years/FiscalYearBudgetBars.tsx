import { useState } from "react";
import { Link } from "react-router-dom";
import { CROSS_AGGREGATE_CATEGORY_CODES, CROSS_AGGREGATE_CATEGORY_LABELS } from "../../contracts/crossAggregateCategory";
import type { AmountDisplayMode } from "../../lib/format";
import { formatAmount } from "../../lib/format";
import type { CrossAggregateChartColors } from "../overview/overviewChart";
import { colorForFiscalYearFund, FISCAL_YEAR_MONTH_COLORS, FISCAL_YEAR_MONTH_LABELS } from "./fiscalYearChartColors";
import type { FiscalYearComparisonViewYear } from "./fiscalYearComparisonModel";

type BreakdownMode = "funds" | "categories" | "months";

type BudgetBreakdownItem = {
  key: string;
  label: string;
  amount: number;
  color: string;
};

const BREAKDOWN_OPTIONS: { mode: BreakdownMode; label: string }[] = [
  { mode: "funds", label: "予算構成" },
  { mode: "categories", label: "横断集計カテゴリ" },
  { mode: "months", label: "月別執行額" },
];

function buildBudgetAxis(maxAssets: number) {
  if (maxAssets <= 0) return { maximum: 0, ticks: [0] };

  const roughStep = maxAssets / 4;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const step = (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) * magnitude;
  const ticks = Array.from({ length: Math.floor(maxAssets / step) + 1 }, (_, index) => index * step);

  return { maximum: maxAssets, ticks: ticks.at(-1) === maxAssets ? ticks : [...ticks, maxAssets] };
}

function breakdownForYear(
  mode: BreakdownMode,
  year: FiscalYearComparisonViewYear,
  categoryColors: CrossAggregateChartColors,
): BudgetBreakdownItem[] {
  if (mode === "funds") {
    return year.funds.map((fund) => ({
      key: String(fund.id),
      label: fund.name,
      amount: fund.awardedAmount,
      color: colorForFiscalYearFund(fund.colorIndex),
    }));
  }

  if (mode === "categories") {
    return year.categories.map((category) => ({
      key: category.code,
      label: category.label,
      amount: category.displayAmount,
      color: categoryColors[category.code],
    }));
  }

  return year.monthlyExecution.map((month) => ({
    key: month.month,
    label: FISCAL_YEAR_MONTH_LABELS[month.monthIndex],
    amount: month.amount,
    color: FISCAL_YEAR_MONTH_COLORS[month.monthIndex],
  }));
}

function legendForMode(
  mode: BreakdownMode,
  years: FiscalYearComparisonViewYear[],
  categoryColors: CrossAggregateChartColors,
) {
  if (mode === "funds") {
    const fundsByName = new Map<string, { label: string; color: string; colorIndex: number }>();
    years.flatMap((year) => year.funds).forEach((fund) => {
      fundsByName.set(fund.name, {
        label: fund.name,
        color: colorForFiscalYearFund(fund.colorIndex),
        colorIndex: fund.colorIndex,
      });
    });
    return [...fundsByName.values()].sort((left, right) => left.colorIndex - right.colorIndex);
  }

  if (mode === "categories") {
    return CROSS_AGGREGATE_CATEGORY_CODES.map((code) => ({
      label: CROSS_AGGREGATE_CATEGORY_LABELS[code],
      color: categoryColors[code],
    }));
  }

  return FISCAL_YEAR_MONTH_LABELS.map((label, index) => ({
    label,
    color: FISCAL_YEAR_MONTH_COLORS[index],
  }));
}

export function FiscalYearBudgetBars({ amountDisplayMode, categoryColors, maxAssets, years }: {
  amountDisplayMode: AmountDisplayMode;
  categoryColors: CrossAggregateChartColors;
  maxAssets: number;
  years: FiscalYearComparisonViewYear[];
}) {
  const [breakdownMode, setBreakdownMode] = useState<BreakdownMode>("funds");
  const axis = buildBudgetAxis(maxAssets);
  const legend = legendForMode(breakdownMode, years, categoryColors);

  return (
    <section className="fiscal-year-comparison-section" aria-labelledby="fiscal-year-budget-title">
      <div className="fiscal-year-comparison-section-heading">
        <h2 id="fiscal-year-budget-title">年度別の予算総額</h2>
        <div className="fiscal-year-budget-breakdown-toggle" role="group" aria-label="年度別の予算総額の色分け">
          {BREAKDOWN_OPTIONS.map((option) => (
            <button
              key={option.mode}
              type="button"
              className="fiscal-year-budget-breakdown-button"
              aria-pressed={breakdownMode === option.mode}
              onClick={() => setBreakdownMode(option.mode)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
      <div className="fiscal-year-comparison-legend fiscal-year-budget-legend" aria-label={`${BREAKDOWN_OPTIONS.find((option) => option.mode === breakdownMode)?.label}の凡例`}>
        {legend.map((item) => (
          <span key={item.label}><i className="fiscal-year-swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />{item.label}</span>
        ))}
      </div>
      <div className="fiscal-year-budget-chart" role="group" aria-label={`年度別の予算総額。共通軸の最大値は${formatAmount(axis.maximum, amountDisplayMode)}です。`}>
        <div className="fiscal-year-budget-axis" aria-hidden="true">
          {axis.ticks.map((tick) => <span key={tick}>{formatAmount(tick, amountDisplayMode)}</span>)}
        </div>
        {years.map((year) => {
          const segments = breakdownForYear(breakdownMode, year, categoryColors);
          const outerWidth = axis.maximum > 0 ? Math.max(0, Math.min((year.budget.assets / axis.maximum) * 100, 100)) : 0;
          return (
            <Link key={year.fiscalYear} className="fiscal-year-budget-row" to={`/?year=${year.fiscalYear}`} aria-label={`${year.fiscalYear}年度の年度ページを開く`}>
              <span className="fiscal-year-budget-year">{year.fiscalYear}年度</span>
              <span className="fiscal-year-budget-scale">
                <span className="fiscal-year-budget-tick-guides" aria-hidden="true">
                  {axis.ticks.map((tick, index) => <i key={tick} style={{ left: `${axis.ticks.length > 1 ? (index / (axis.ticks.length - 1)) * 100 : 0}%` }} />)}
                </span>
                <span className="fiscal-year-budget-bar" style={{ width: `${outerWidth}%` }}>
                  {segments.filter((segment) => segment.amount > 0).map((segment) => (
                    <span
                      key={segment.key}
                      role="img"
                      className="fiscal-year-budget-segment"
                      aria-label={`${year.fiscalYear}年度 ${segment.label} ${formatAmount(segment.amount, amountDisplayMode)}`}
                      title={`${segment.label}: ${formatAmount(segment.amount, amountDisplayMode)}`}
                      style={{
                        width: `${year.budget.assets > 0 ? (segment.amount / year.budget.assets) * 100 : 0}%`,
                        backgroundColor: segment.color,
                      }}
                    />
                  ))}
                </span>
              </span>
              <span className="fiscal-year-budget-value">
                <strong>{formatAmount(year.budget.assets, amountDisplayMode)}</strong>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

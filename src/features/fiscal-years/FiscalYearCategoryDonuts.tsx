import { Link } from "react-router-dom";
import { CROSS_AGGREGATE_CATEGORY_CODES, CROSS_AGGREGATE_CATEGORY_LABELS } from "../../contracts/crossAggregateCategory";
import type { AmountDisplayMode } from "../../lib/format";
import { formatAmount } from "../../lib/format";
import type { CrossAggregateChartColors } from "../overview/overviewChart";
import { buildDonutSegments } from "./donutSegments";
import type { FiscalYearComparisonViewYear } from "./fiscalYearComparisonModel";

function formatDonutCenterAmount(value: number) {
  return `${Math.round(value / 1000)}k円`;
}

function FiscalYearCategoryDonut({ colors, year }: {
  colors: CrossAggregateChartColors;
  year: FiscalYearComparisonViewYear;
}) {
  const chartRadius = 45;
  const chartStroke = 16;
  const chartCircumference = 2 * Math.PI * chartRadius;
  const segments = buildDonutSegments(year.categories, (category) => category.percentage);
  const centerLabel = year.categoryTotal <= 0 ? "データなし" : formatDonutCenterAmount(year.categoryTotal);

  return (
    <svg viewBox="0 0 128 128" role="img" aria-label={`${year.fiscalYear}年度の横断集計カテゴリ構成比グラフ`} focusable="false">
      <circle className="fiscal-year-category-track" cx="64" cy="64" r={chartRadius} fill="none" strokeWidth={chartStroke} />
      {segments.map(({ item: category, offsetPercentage, percentage }) => {
        const dashLength = (percentage / 100) * chartCircumference;
        const dashOffset = chartCircumference * (1 - offsetPercentage / 100);

        return <circle key={category.code} cx="64" cy="64" r={chartRadius} fill="none" stroke={colors[category.code]} strokeDasharray={`${dashLength} ${chartCircumference - dashLength}`} strokeDashoffset={dashOffset} strokeLinecap="butt" strokeWidth={chartStroke} transform="rotate(-90 64 64)" />;
      })}
      <text className="fiscal-year-category-total" x="64" y="64" textAnchor="middle" dominantBaseline="middle">{centerLabel}</text>
    </svg>
  );
}

export function FiscalYearCategoryDonuts({ amountDisplayMode, colors, years }: {
  amountDisplayMode: AmountDisplayMode;
  colors: CrossAggregateChartColors;
  years: FiscalYearComparisonViewYear[];
}) {
  return (
    <section className="fiscal-year-comparison-section" aria-labelledby="fiscal-year-category-title">
      <div className="fiscal-year-comparison-section-heading">
        <div><h2 id="fiscal-year-category-title">横断集計カテゴリの構成比</h2></div>
        <div className="fiscal-year-comparison-legend" aria-label="横断集計カテゴリの凡例">
          {CROSS_AGGREGATE_CATEGORY_CODES.map((code) => <span key={code}><i className="fiscal-year-swatch" style={{ backgroundColor: colors[code] }} aria-hidden="true" />{CROSS_AGGREGATE_CATEGORY_LABELS[code]}</span>)}
        </div>
      </div>
      <div className="fiscal-year-category-grid" role="group" aria-label="年度別の横断集計カテゴリ構成比">
        {years.map((year) => (
          <Link key={year.fiscalYear} className="fiscal-year-category-card" to={`/?year=${year.fiscalYear}`} aria-label={`${year.fiscalYear}年度の年度ページを開く`}>
            <strong>{year.fiscalYear}年度</strong>
            <span className="fiscal-year-category-donut"><FiscalYearCategoryDonut colors={colors} year={year} /></span>
            <ul className="sr-only">
              {year.categories.map((category) => <li key={category.code}>{year.fiscalYear}年度 {category.label} {formatAmount(category.displayAmount, amountDisplayMode)} {category.percentage === null ? "割合なし" : `${category.percentage.toFixed(1)}%`}</li>)}
            </ul>
          </Link>
        ))}
      </div>
    </section>
  );
}

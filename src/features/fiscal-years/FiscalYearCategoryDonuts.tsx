import { Link } from "react-router-dom";
import { CROSS_AGGREGATE_CATEGORY_CODES, CROSS_AGGREGATE_CATEGORY_LABELS } from "../../contracts/crossAggregateCategory";
import type { AmountDisplayMode } from "../../lib/format";
import { formatAmount } from "../../lib/format";
import type { CrossAggregateChartColors } from "../overview/overviewChart";
import type { FiscalYearComparisonViewYear } from "./fiscalYearComparisonModel";

function donutBackground(colors: CrossAggregateChartColors, year: FiscalYearComparisonViewYear) {
  if (year.categoryTotal <= 0) return undefined;
  let offset = 0;
  const stops = year.categories.map((category) => {
    const start = offset;
    offset += category.percentage ?? 0;
    return `${colors[category.code]} ${start}% ${offset}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function stateCopy(year: FiscalYearComparisonViewYear) {
  if (year.state === "past") return "終了・最終実績";
  if (year.state === "future") return "未来・予定";
  return "進行中・消化見込み";
}

export function FiscalYearCategoryDonuts({ amountDisplayMode, colors, years }: {
  amountDisplayMode: AmountDisplayMode;
  colors: CrossAggregateChartColors;
  years: FiscalYearComparisonViewYear[];
}) {
  return (
    <section className="fiscal-year-comparison-section" aria-labelledby="fiscal-year-category-title">
      <div className="fiscal-year-comparison-section-heading">
        <div><h2 id="fiscal-year-category-title">横断集計カテゴリの構成比</h2><p>終了年度は最終実績、進行年度と未来年度は消化見込み</p></div>
        <div className="fiscal-year-comparison-legend" aria-label="横断集計カテゴリの凡例">
          {CROSS_AGGREGATE_CATEGORY_CODES.map((code) => <span key={code}><i className="fiscal-year-swatch" style={{ backgroundColor: colors[code] }} aria-hidden="true" />{CROSS_AGGREGATE_CATEGORY_LABELS[code]}</span>)}
        </div>
      </div>
      <div className="fiscal-year-category-grid" role="group" aria-label="年度別の横断集計カテゴリ構成比">
        {years.map((year) => (
          <Link key={year.fiscalYear} className="fiscal-year-category-card" to={`/?year=${year.fiscalYear}`} aria-label={`${year.fiscalYear}年度の年度ページを開く`}>
            <strong>{year.fiscalYear}年度</strong>
            <span className={`fiscal-year-category-donut${year.categoryTotal <= 0 ? " fiscal-year-category-donut-empty" : ""}`} style={{ background: donutBackground(colors, year) }} aria-hidden="true">
              <span>{year.categoryTotal <= 0 ? "データなし" : formatAmount(year.categoryTotal, amountDisplayMode)}</span>
            </span>
            <small>{stateCopy(year)}</small>
            <ul className="sr-only">
              {year.categories.map((category) => <li key={category.code}>{year.fiscalYear}年度 {category.label} {formatAmount(category.displayAmount, amountDisplayMode)} {category.percentage === null ? "割合なし" : `${category.percentage.toFixed(1)}%`}</li>)}
            </ul>
          </Link>
        ))}
      </div>
    </section>
  );
}

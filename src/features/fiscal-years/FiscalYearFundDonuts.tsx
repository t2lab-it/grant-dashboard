import { Link } from "react-router-dom";
import type { AmountDisplayMode } from "../../lib/format";
import { formatAmount } from "../../lib/format";
import { buildDonutSegments } from "./donutSegments";
import type { FiscalYearComparisonViewYear } from "./fiscalYearComparisonModel";

const FUND_COLORS = [
  "#4e79a7",
  "#f28e2b",
  "#e15759",
  "#76b7b2",
  "#59a14f",
  "#edc948",
  "#b07aa1",
  "#ff9da7",
  "#9c755f",
  "#bab0ab",
  "#1f77b4",
  "#ff7f0e",
  "#2ca02c",
  "#d62728",
  "#9467bd",
  "#17becf",
] as const;

function colorForFund(colorIndex: number) {
  return FUND_COLORS[colorIndex % FUND_COLORS.length];
}

function formatDonutCenterAmount(value: number) {
  return `${Math.round(value / 1000)}k円`;
}

function FiscalYearFundDonut({ year }: { year: FiscalYearComparisonViewYear }) {
  const chartRadius = 45;
  const chartStroke = 16;
  const chartCircumference = 2 * Math.PI * chartRadius;
  const segments = buildDonutSegments(year.funds, (fund) => fund.percentage);
  const centerLabel = year.budget.assets <= 0 ? "データなし" : formatDonutCenterAmount(year.budget.assets);

  return (
    <svg viewBox="0 0 128 128" role="img" aria-label={`${year.fiscalYear}年度の予算構成比グラフ`} focusable="false">
      <circle className="fiscal-year-category-track" cx="64" cy="64" r={chartRadius} fill="none" strokeWidth={chartStroke} />
      {segments.map(({ item: fund, offsetPercentage, percentage }) => {
        const dashLength = (percentage / 100) * chartCircumference;
        const dashOffset = chartCircumference * (1 - offsetPercentage / 100);

        return <circle key={fund.id} cx="64" cy="64" r={chartRadius} fill="none" stroke={colorForFund(fund.colorIndex)} strokeDasharray={`${dashLength} ${chartCircumference - dashLength}`} strokeDashoffset={dashOffset} strokeLinecap="butt" strokeWidth={chartStroke} transform="rotate(-90 64 64)" />;
      })}
      <text className="fiscal-year-category-total" x="64" y="64" textAnchor="middle" dominantBaseline="middle">{centerLabel}</text>
    </svg>
  );
}

export function FiscalYearFundDonuts({ amountDisplayMode, years }: {
  amountDisplayMode: AmountDisplayMode;
  years: FiscalYearComparisonViewYear[];
}) {
  return (
    <section className="fiscal-year-comparison-section" aria-labelledby="fiscal-year-fund-title">
      <div className="fiscal-year-comparison-section-heading">
        <h2 id="fiscal-year-fund-title">各年度の予算構成比</h2>
      </div>
      <div className="fiscal-year-fund-grid" role="group" aria-label="年度別の予算構成比">
        {years.map((year) => (
          <Link key={year.fiscalYear} className="fiscal-year-fund-card" to={`/?year=${year.fiscalYear}`} aria-label={`${year.fiscalYear}年度の年度ページを開く`}>
            <strong>{year.fiscalYear}年度</strong>
            <span className="fiscal-year-fund-donut"><FiscalYearFundDonut year={year} /></span>
            {year.funds.length > 0 ? (
              <ul className="fiscal-year-fund-list">
                {year.funds.map((fund) => (
                  <li key={fund.id}>
                    <i style={{ backgroundColor: colorForFund(fund.colorIndex) }} aria-hidden="true" />
                    <span className="fiscal-year-fund-name" title={fund.name}>{fund.name}</span>
                    <span className="fiscal-year-fund-percentage">{fund.percentage === null ? "割合なし" : `${fund.percentage.toFixed(1)}%`}</span>
                    <span className="fiscal-year-fund-amount">{formatAmount(fund.awardedAmount, amountDisplayMode)}</span>
                  </li>
                ))}
              </ul>
            ) : <span className="fiscal-year-fund-empty">予算内訳なし</span>}
          </Link>
        ))}
      </div>
    </section>
  );
}

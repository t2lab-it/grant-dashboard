import type { FiscalYearComparisonViewYear, FiscalYearPacePoint } from "./fiscalYearComparisonModel";

const WIDTH = 720;
const HEIGHT = 300;
const LEFT = 58;
const RIGHT = 20;
const TOP = 24;
const BOTTOM = 54;
const PLOT_WIDTH = WIDTH - LEFT - RIGHT;
const PLOT_HEIGHT = HEIGHT - TOP - BOTTOM;
const MONTH_LABELS = ["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月"];
const VIRIDIS_COLOR_COUNT = 6;

function colorForFiscalYear(index: number, yearCount: number) {
  const oldestFirstIndex = yearCount - 1 - index;
  const scale = Math.max(yearCount - 1, 1);
  const colorIndex = Math.round((oldestFirstIndex / scale) * (VIRIDIS_COLOR_COUNT - 1));
  return `var(--fiscal-year-line-${colorIndex})`;
}

function pathFor(points: FiscalYearPacePoint[], yMax: number) {
  return points.filter((point): point is FiscalYearPacePoint & { rate: number } => point.rate !== null).map((point, index) => {
    const x = LEFT + (point.monthIndex / 11) * PLOT_WIDTH;
    const y = TOP + PLOT_HEIGHT - (point.rate / yMax) * PLOT_HEIGHT;
    return `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(" ");
}

export function FiscalYearExecutionPaceChart({ maxPaceRate, years }: {
  maxPaceRate: number;
  years: FiscalYearComparisonViewYear[];
}) {
  const yMax = Math.max(100, Math.ceil(maxPaceRate / 25) * 25);
  const descriptions = years.map((year) => {
    const last = [...year.pace.actualPoints, ...year.pace.projectedPoints].at(-1);
    return year.pace.hasBudget ? `${year.fiscalYear}年度 ${last?.rate?.toFixed(1) ?? "0.0"}%` : `${year.fiscalYear}年度 予算総額なし`;
  }).join("。 ");
  return (
    <section className="fiscal-year-comparison-section" aria-labelledby="fiscal-year-pace-title">
      <div className="fiscal-year-comparison-section-heading">
        <div><h2 id="fiscal-year-pace-title">月別の執行ペース</h2><p>4月から3月までの累積執行率を年度間で比較</p></div>
        <div className="fiscal-year-comparison-legend" aria-label="月別執行ペースの凡例">
          <span><i className="fiscal-year-line-sample" aria-hidden="true" />実績（実線）</span>
          <span><i className="fiscal-year-line-sample fiscal-year-line-sample-dashed" aria-hidden="true" />見込み・予定（破線）</span>
        </div>
      </div>
      <figure className="fiscal-year-pace-figure">
        <svg className="fiscal-year-pace-chart" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby="fiscal-year-pace-svg-title fiscal-year-pace-svg-description">
          <title id="fiscal-year-pace-svg-title">4月から3月までの累積執行率の年度比較</title>
          <desc id="fiscal-year-pace-svg-description">{descriptions}</desc>
          {[0, yMax / 2, yMax].map((rate) => {
            const y = TOP + PLOT_HEIGHT - (rate / yMax) * PLOT_HEIGHT;
            return <g key={rate}><line x1={LEFT} x2={WIDTH - RIGHT} y1={y} y2={y} className="fiscal-year-pace-grid-line" /><text x={LEFT - 10} y={y + 4} textAnchor="end">{Math.round(rate)}%</text></g>;
          })}
          {MONTH_LABELS.map((label, index) => <text key={label} x={LEFT + (index / 11) * PLOT_WIDTH} y={HEIGHT - 22} textAnchor="middle" className={index % 2 === 1 ? "fiscal-year-pace-tick-optional" : undefined}>{label}</text>)}
          {years.map((year, index) => {
            const color = colorForFiscalYear(index, years.length);
            const actualPath = pathFor(year.pace.actualPoints, yMax);
            const projectedPath = pathFor(year.pace.projectedPoints, yMax);
            return <g key={year.fiscalYear}>
              {actualPath ? <path d={actualPath} fill="none" stroke={color} strokeWidth={year.state === "current" ? 5 : 3.5} data-series={year.state === "current" ? "current-actual" : "past-actual"} /> : null}
              {projectedPath ? <path d={projectedPath} fill="none" stroke={color} strokeWidth={year.state === "current" ? 5 : 3.5} strokeDasharray="8 6" data-series={year.state === "current" ? "current-projection" : "future-projection"} /> : null}
            </g>;
          })}
        </svg>
        <figcaption><ul className="fiscal-year-pace-year-legend">{years.map((year, index) => <li key={year.fiscalYear}><i style={{ backgroundColor: colorForFiscalYear(index, years.length) }} aria-hidden="true" />{year.fiscalYear}年度{year.pace.hasBudget ? "" : " 予算総額なし"}</li>)}</ul></figcaption>
      </figure>
    </section>
  );
}

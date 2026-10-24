import { useQuery } from "@tanstack/react-query";
import { Link, useParams } from "react-router-dom";
import { PageStatusMessage } from "../../app/PageStatusMessage";
import type { ImportDetailResponse, ReconciliationMetric, ReconciliationMetricSet } from "../../contracts/imports";
import { apiGet } from "../../lib/api";
import { formatLocalDateTime, formatYen } from "../../lib/format";
import { ImportWarningList } from "./ImportWarningList";

const metrics: Array<[ReconciliationMetric, string]> = [
  ["assets", "交付額"],
  ["planned", "執行予定額"],
  ["actual", "執行済額"],
  ["free_balance", "残高"],
];

function ComparisonRows({ expected, actual }: {
  expected: ReconciliationMetricSet;
  actual: ReconciliationMetricSet;
}) {
  return <>{metrics.map(([key, label]) => (
    <tr key={key} data-mismatch={expected[key] !== actual[key] || undefined}>
      <th scope="row">{label}</th>
      <td>{formatYen(expected[key])}</td>
      <td>{formatYen(actual[key])}</td>
      <td>{formatYen(actual[key] - expected[key])}</td>
    </tr>
  ))}</>;
}

function ComparisonHead() {
  return (
    <thead><tr>
      <th scope="col">項目</th>
      <th scope="col">取込値</th>
      <th scope="col">登録値</th>
      <th scope="col">差額</th>
    </tr></thead>
  );
}

export function ImportDetailPage() {
  const { importId } = useParams();
  const id = Number(importId);
  const valid = Number.isInteger(id) && id > 0;
  const { data, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["import", valid ? id : "invalid"],
    queryFn: () => apiGet<ImportDetailResponse>(`/api/imports/${id}`),
    enabled: valid,
    retry: false,
  });

  if (!valid) return <div>インポートIDを確認してください。</div>;
  if (isError) {
    return (
      <PageStatusMessage kind="error">
        <p>インポート詳細を読み込めませんでした。</p>
        <p>{error.message}</p>
        <button type="button" className="detail-action-button" disabled={isFetching} onClick={() => void refetch()}>
          再試行
        </button>{" "}
        <Link to="/imports">履歴に戻る</Link>
      </PageStatusMessage>
    );
  }
  if (!data) return <PageStatusMessage kind="loading">読み込み中...</PageStatusMessage>;

  const years = [...new Set(data.reconciliation.funds.map((fund) => fund.fiscal_year))].sort((a, b) => b - a);
  const counts = data.mapping_summary.counts;
  const countRows = [
    ["予算", counts.funds], ["費目", counts.categories], ["予算行", counts.budget_lines],
    ["予定", counts.planned_items], ["実績", counts.actual_entries], ["警告", counts.warnings],
  ] as const;

  return (
    <section className="detail-grid import-detail-page">
      <header className="detail-hero">
        <div>
          <Link to="/imports">インポート履歴</Link>
          <h2>{data.source_filename}</h2>
          <p>{formatLocalDateTime(data.imported_at)} · {data.mapping_summary.mode === "initial" ? "初回取込" : "置換取込"}</p>
        </div>
        <span className={`status-pill ${data.reconciliation.ok ? "ok" : "warn"}`}>
          {data.reconciliation.ok ? "照合OK" : "照合不一致"}
        </span>
      </header>

      <section className="detail-panel">
        <h3>取込件数</h3>
        <dl className="import-counts">
          {countRows.map(([label, count]) => <div key={label}><dt>{label}</dt><dd>{count}件</dd></div>)}
        </dl>
      </section>

      <section className="detail-panel">
        <h3>全体照合</h3>
        <p className="comparison-note">差額 = 登録値 − 取込値（円）</p>
        <div className="comparison-scroll" tabIndex={0} role="region" aria-label="全体照合の横スクロール">
          <table className="comparison-table" aria-label="全体照合">
            <ComparisonHead />
            <tbody><ComparisonRows {...data.reconciliation.overall} /></tbody>
          </table>
        </div>
      </section>

      <section className="detail-panel">
        <h3>予算別照合</h3>
        {years.length === 0 ? <p>このインポートに予算別の照合結果はありません。</p> : years.map((year) => (
          <section key={year} className="import-year-group" aria-labelledby={`import-year-${year}`}>
            <h4 id={`import-year-${year}`}>{year}年度</h4>
            <div className="comparison-scroll" tabIndex={0} role="region" aria-label={`${year}年度の照合の横スクロール`}>
              <table className="comparison-table" aria-label={`${year}年度の予算別照合`}>
                <ComparisonHead />
                {data.reconciliation.funds.filter((fund) => fund.fiscal_year === year).map((fund) => (
                  <tbody key={fund.fund_code}>
                    <tr className="comparison-group-heading"><th colSpan={4} scope="rowgroup">{fund.fund_name}</th></tr>
                    <ComparisonRows expected={fund.expected} actual={fund.actual} />
                  </tbody>
                ))}
              </table>
            </div>
          </section>
        ))}
      </section>

      <section className="detail-panel">
        <h3>警告 · {data.warning_count}件</h3>
        {data.warnings.length ? <ImportWarningList warnings={data.warnings} /> : <p>このインポートに警告はありません。</p>}
      </section>
      <p>{data.reconciliation.mismatches.length
        ? `照合差異 ${data.reconciliation.mismatches.length}件。表の差額を確認してください。`
        : "このインポートに差異はありません。"}</p>
    </section>
  );
}

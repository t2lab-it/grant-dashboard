import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { PageStatusMessage } from "../../app/PageStatusMessage";
import type { ImportDetailResponse, ReconciliationMetric } from "../../contracts/imports";
import { apiGet } from "../../lib/api";
import { formatLocalDateTime, formatYen } from "../../lib/format";

const reconciliationMetricLabels: Record<ReconciliationMetric, string> = {
  assets: "交付額",
  planned: "執行予定額",
  actual: "執行済額",
  free_balance: "残高",
};

function formatComparisonLabel(expected: number, actual: number) {
  return `取込値 ${formatYen(expected)} / 登録値 ${formatYen(actual)}`;
}

function formatFundComparisonLabel(metric: ReconciliationMetric, expected: number, actual: number) {
  return `${reconciliationMetricLabels[metric]}: ${formatComparisonLabel(expected, actual)}`;
}

export function ImportDetailPage() {
  const { importId } = useParams();
  const parsedImportId = importId === undefined ? Number.NaN : Number(importId);
  const hasValidImportId = Number.isInteger(parsedImportId) && parsedImportId > 0;

  const { data, isError } = useQuery({
    queryKey: ["import", hasValidImportId ? parsedImportId : "invalid"],
    queryFn: () => apiGet<ImportDetailResponse>(`/api/imports/${parsedImportId}`),
    enabled: hasValidImportId,
  });

  if (!hasValidImportId) {
    return <div>インポートIDを確認してください。</div>;
  }

  if (isError) {
    return <PageStatusMessage kind="error">インポート詳細を読み込めませんでした。</PageStatusMessage>;
  }

  if (!data) {
    return <PageStatusMessage kind="loading">読み込み中...</PageStatusMessage>;
  }

  return (
    <section className="detail-grid">
      <header className="detail-hero">
        <div>
          <p className="eyebrow">インポート詳細</p>
          <h2>{data.source_filename}</h2>
          <p>{formatLocalDateTime(data.imported_at)}</p>
        </div>
        <p className="detail-award">
          <span>警告</span>
          <strong>{data.warning_count}</strong>
        </p>
      </header>

      <section className="detail-panel">
        <h3>取込概要</h3>
        <div className="import-detail-list">
          <div className="import-detail-row">
            <strong>取込モード</strong>
            <span>{data.mapping_summary.mode === "initial" ? "初回取込" : "置換取込"}</span>
          </div>
          <div className="import-detail-row">
            <strong>予算</strong>
            <span>{`予算 ${data.mapping_summary.counts.funds}件`}</span>
          </div>
          <div className="import-detail-row">
            <strong>費目</strong>
            <span>{`費目 ${data.mapping_summary.counts.categories}件`}</span>
          </div>
          <div className="import-detail-row">
            <strong>予算行</strong>
            <span>{`予算行 ${data.mapping_summary.counts.budget_lines}件`}</span>
          </div>
          <div className="import-detail-row">
            <strong>予定</strong>
            <span>{`予定 ${data.mapping_summary.counts.planned_items}件`}</span>
          </div>
          <div className="import-detail-row">
            <strong>実績</strong>
            <span>{`実績 ${data.mapping_summary.counts.actual_entries}件`}</span>
          </div>
          <div className="import-detail-row">
            <strong>警告</strong>
            <span>{`警告 ${data.mapping_summary.counts.warnings}件`}</span>
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <h3>全体照合</h3>
        <div className="import-detail-list">
          <div className="import-detail-row">
            <strong>照合結果</strong>
            <span>{data.reconciliation.ok ? "照合OK" : "照合不一致"}</span>
          </div>
          <div className="import-detail-row">
            <strong>交付額</strong>
            <span>
              {formatComparisonLabel(
                data.reconciliation.overall.expected.assets,
                data.reconciliation.overall.actual.assets,
              )}
            </span>
          </div>
          <div className="import-detail-row">
            <strong>執行予定額</strong>
            <span>
              {formatComparisonLabel(
                data.reconciliation.overall.expected.planned,
                data.reconciliation.overall.actual.planned,
              )}
            </span>
          </div>
          <div className="import-detail-row">
            <strong>執行済額</strong>
            <span>
              {formatComparisonLabel(
                data.reconciliation.overall.expected.actual,
                data.reconciliation.overall.actual.actual,
              )}
            </span>
          </div>
          <div className="import-detail-row">
            <strong>残高</strong>
            <span>
              {formatComparisonLabel(
                data.reconciliation.overall.expected.free_balance,
                data.reconciliation.overall.actual.free_balance,
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <h3>予算別照合</h3>
        {data.reconciliation.funds.length === 0 ? (
          <p>このインポートに予算別の照合結果はありません。</p>
        ) : (
          <div className="import-detail-list">
            {data.reconciliation.funds.map((fund) => (
              <div key={fund.fund_name} className="import-detail-row">
                <strong>{fund.fund_name}</strong>
                <span>
                  {formatFundComparisonLabel(
                    "assets",
                    fund.expected.assets,
                    fund.actual.assets,
                  )}
                </span>
                <span>
                  {formatFundComparisonLabel(
                    "planned",
                    fund.expected.planned,
                    fund.actual.planned,
                  )}
                </span>
                <span>
                  {formatFundComparisonLabel(
                    "actual",
                    fund.expected.actual,
                    fund.actual.actual,
                  )}
                </span>
                <span>
                  {formatFundComparisonLabel(
                    "free_balance",
                    fund.expected.free_balance,
                    fund.actual.free_balance,
                  )}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="detail-panel">
        <h3>警告</h3>
        {data.warnings.length === 0 ? (
          <p>このインポートに警告はありません。</p>
        ) : (
          <div className="import-detail-list">
            {data.warnings.map((warning) => (
              <div
                key={`${warning.code}-${warning.sheet_name}-${warning.row_number}`}
                className="import-detail-row"
              >
                <strong>{warning.sheet_name}</strong>
                <span>{`${warning.row_number}行目`}</span>
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="detail-panel">
        <h3>照合差異</h3>
        {data.reconciliation.mismatches.length === 0 ? (
          <p>このインポートに差異はありません。</p>
        ) : (
          <div className="import-detail-list">
            {data.reconciliation.mismatches.map((mismatch) => (
              <div
                key={`${mismatch.scope}-${mismatch.fund_name ?? "overall"}-${mismatch.metric}`}
                className="import-detail-row"
              >
                <strong>{`${mismatch.fund_name ?? "全体"} / ${reconciliationMetricLabels[mismatch.metric]}`}</strong>
                <span>{`取込値 ${formatYen(mismatch.expected)}`}</span>
                <span>{`登録値 ${formatYen(mismatch.actual)}`}</span>
                <span>{`差額 ${formatYen(mismatch.delta)}`}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

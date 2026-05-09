import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { PageStatusMessage } from "../../app/PageStatusMessage";
import type { ImportDetailResponse } from "../../contracts/imports";
import { apiGet } from "../../lib/api";

function formatComparisonLabel(label: string, expected: number, actual: number) {
  return `Expected ${label} ${expected} / Actual ${label} ${actual}`;
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
    return <div>Import id is invalid.</div>;
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
          <p className="eyebrow">Import Detail</p>
          <h2>{data.source_filename}</h2>
          <p>{data.imported_at}</p>
        </div>
        <p className="detail-award">
          <span>Warnings</span>
          <strong>{data.warning_count}</strong>
        </p>
      </header>

      <section className="detail-panel">
        <h3>Mapping Summary</h3>
        <div className="import-detail-list">
          <div className="import-detail-row">
            <strong>Mode</strong>
            <span>{data.mapping_summary.mode}</span>
          </div>
          <div className="import-detail-row">
            <strong>Funds</strong>
            <span>{`Funds ${data.mapping_summary.counts.funds}`}</span>
          </div>
          <div className="import-detail-row">
            <strong>Categories</strong>
            <span>{`Categories ${data.mapping_summary.counts.categories}`}</span>
          </div>
          <div className="import-detail-row">
            <strong>Budget Lines</strong>
            <span>{`Budget Lines ${data.mapping_summary.counts.budget_lines}`}</span>
          </div>
          <div className="import-detail-row">
            <strong>Planned Items</strong>
            <span>{`Planned Items ${data.mapping_summary.counts.planned_items}`}</span>
          </div>
          <div className="import-detail-row">
            <strong>Actual Entries</strong>
            <span>{`Actual Entries ${data.mapping_summary.counts.actual_entries}`}</span>
          </div>
          <div className="import-detail-row">
            <strong>Warnings</strong>
            <span>{`Warnings ${data.mapping_summary.counts.warnings}`}</span>
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <h3>Overall Summary</h3>
        <div className="import-detail-list">
          <div className="import-detail-row">
            <strong>Status</strong>
            <span>{data.reconciliation.ok ? "Reconciliation OK" : "Reconciliation mismatch"}</span>
          </div>
          <div className="import-detail-row">
            <strong>Assets</strong>
            <span>
              {formatComparisonLabel(
                "assets",
                data.reconciliation.overall.expected.assets,
                data.reconciliation.overall.actual.assets,
              )}
            </span>
          </div>
          <div className="import-detail-row">
            <strong>Planned</strong>
            <span>
              {formatComparisonLabel(
                "planned",
                data.reconciliation.overall.expected.planned,
                data.reconciliation.overall.actual.planned,
              )}
            </span>
          </div>
          <div className="import-detail-row">
            <strong>Actual</strong>
            <span>
              {formatComparisonLabel(
                "actual",
                data.reconciliation.overall.expected.actual,
                data.reconciliation.overall.actual.actual,
              )}
            </span>
          </div>
          <div className="import-detail-row">
            <strong>Free Balance</strong>
            <span>
              {formatComparisonLabel(
                "free balance",
                data.reconciliation.overall.expected.free_balance,
                data.reconciliation.overall.actual.free_balance,
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="detail-panel">
        <h3>Fund Summary</h3>
        {data.reconciliation.funds.length === 0 ? (
          <p>No fund summaries recorded for this import.</p>
        ) : (
          <div className="import-detail-list">
            {data.reconciliation.funds.map((fund) => (
              <div key={fund.fund_name} className="import-detail-row">
                <strong>{fund.fund_name}</strong>
                <span>
                  {formatComparisonLabel(
                    "assets",
                    fund.expected.assets,
                    fund.actual.assets,
                  )}
                </span>
                <span>
                  {formatComparisonLabel(
                    "planned",
                    fund.expected.planned,
                    fund.actual.planned,
                  )}
                </span>
                <span>
                  {formatComparisonLabel(
                    "actual",
                    fund.expected.actual,
                    fund.actual.actual,
                  )}
                </span>
                <span>
                  {formatComparisonLabel(
                    "free balance",
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
        <h3>Warnings</h3>
        {data.warnings.length === 0 ? (
          <p>No warnings recorded for this import.</p>
        ) : (
          <div className="import-detail-list">
            {data.warnings.map((warning) => (
              <div
                key={`${warning.code}-${warning.sheet_name}-${warning.row_number}`}
                className="import-detail-row"
              >
                <strong>{warning.sheet_name}</strong>
                <span>{`row ${warning.row_number}`}</span>
                <span>{warning.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="detail-panel">
        <h3>Reconciliation</h3>
        {data.reconciliation.mismatches.length === 0 ? (
          <p>No mismatches recorded for this import.</p>
        ) : (
          <div className="import-detail-list">
            {data.reconciliation.mismatches.map((mismatch) => (
              <div
                key={`${mismatch.scope}-${mismatch.fund_name ?? "overall"}-${mismatch.metric}`}
                className="import-detail-row"
              >
                <strong>{`${mismatch.fund_name ?? "overall"} / ${mismatch.metric}`}</strong>
                <span>{`expected ${mismatch.expected}`}</span>
                <span>{`actual ${mismatch.actual}`}</span>
                <span>{`delta ${mismatch.delta}`}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

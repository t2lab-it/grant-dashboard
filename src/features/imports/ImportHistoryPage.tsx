import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageStatusMessage } from "../../app/PageStatusMessage";
import type { ImportHistoryResponse } from "../../contracts/imports";
import { apiGet } from "../../lib/api";

export function ImportHistoryPage() {
  const { data, isError } = useQuery({
    queryKey: ["imports"],
    queryFn: () => apiGet<ImportHistoryResponse>("/api/imports"),
  });

  if (isError) {
    return <PageStatusMessage kind="error">インポート履歴を読み込めませんでした。</PageStatusMessage>;
  }

  if (!data) {
    return <PageStatusMessage kind="loading">読み込み中...</PageStatusMessage>;
  }

  if (data.length === 0) {
    return <div>No import runs yet.</div>;
  }

  return (
    <section className="detail-grid">
      <header className="detail-hero">
        <div>
          <p className="eyebrow">Import Review</p>
          <h2>Import History</h2>
        </div>
      </header>
      <div className="import-list">
        {data.map((item) => (
          <div key={item.id} className="import-card">
            <div className="import-card-header">
              <strong>
                <Link to={`/imports/${item.id}`}>{item.source_filename}</Link>
              </strong>
              <span className={item.reconciliation_ok ? "status-pill ok" : "status-pill warn"}>
                {item.reconciliation_ok ? "Reconciliation OK" : "Reconciliation mismatch"}
              </span>
            </div>
            <p>{item.imported_at}</p>
            <p>{`Warnings: ${item.warning_count}`}</p>
            <p>
              {`Funds ${item.mapping_summary.counts.funds} / Planned ${item.mapping_summary.counts.planned_items} / Actual ${item.mapping_summary.counts.actual_entries}`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

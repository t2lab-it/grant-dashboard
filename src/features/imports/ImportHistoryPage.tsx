import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { PageStatusMessage } from "../../app/PageStatusMessage";
import type { ImportHistoryResponse } from "../../contracts/imports";
import { apiGet } from "../../lib/api";
import { formatLocalDateTime } from "../../lib/format";

export function ImportHistoryPage() {
  const { data, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["imports"],
    queryFn: () => apiGet<ImportHistoryResponse>("/api/imports"),
  });

  if (isError) {
    return <PageStatusMessage kind="error">インポート履歴を読み込めませんでした。<p>{error.message}</p><button type="button" disabled={isFetching} onClick={() => void refetch()}>再試行</button></PageStatusMessage>;
  }

  if (!data) {
    return <PageStatusMessage kind="loading">読み込み中...</PageStatusMessage>;
  }

  if (data.length === 0) {
    return <div>インポート履歴はまだありません。</div>;
  }

  return (
    <section className="detail-grid">
      <header className="detail-hero">
        <div>
          <h2>インポート履歴</h2>
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
                {item.reconciliation_ok === null ? "照合履歴は読込不可" : item.reconciliation_ok ? "照合OK" : "照合不一致"}
              </span>
            </div>
            <p>{formatLocalDateTime(item.imported_at)}</p>
            <p>{`警告: ${item.warning_count}件`}</p>
            <p>
              {`予算 ${item.mapping_summary.counts.funds}件 / 予定 ${item.mapping_summary.counts.planned_items}件 / 実績 ${item.mapping_summary.counts.actual_entries}件`}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}

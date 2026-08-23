import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ModalShell } from "../../app/ModalShell";
import { CROSS_AGGREGATE_CATEGORY_LABELS } from "../../contracts/crossAggregateCategory";
import type {
  MonthlySummaryAmounts,
  MonthlySummaryCrossAggregateCategory,
  MonthlySummaryFund,
  MonthlySummaryResponse,
} from "../../contracts/monthlySummary";
import { apiGet } from "../../lib/api";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import { queryKeys } from "../../lib/queryKeys";
import { listFiscalYearMonths } from "../../lib/calendar";
import type { OverviewSummaryMetricKey } from "./overviewSummaryTypes";

type MonthlySummaryValueKey =
  | "actualCumulativeAmount"
  | "actualAmount"
  | "plannedAmount"
  | "plannedRemainingAmount"
  | "spendAndPlannedCumulativeAmount"
  | "calculatedBalance";

const metricValueKeys: Record<OverviewSummaryMetricKey, MonthlySummaryValueKey> = {
  assets: "spendAndPlannedCumulativeAmount",
  actual: "actualCumulativeAmount",
  committed: "plannedRemainingAmount",
  balance: "calculatedBalance",
};

const tableColumns: Array<{ key: MonthlySummaryValueKey; label: string }> = [
  { key: "actualAmount", label: "当月実績" },
  { key: "plannedAmount", label: "当月予定" },
  { key: "actualCumulativeAmount", label: "累計執行済" },
  { key: "spendAndPlannedCumulativeAmount", label: "執行＋予定累計" },
  { key: "plannedRemainingAmount", label: "予定残高" },
  { key: "calculatedBalance", label: "計算上の残高" },
];

export function formatMonthlySummaryHeading(month: string) {
  const [year, monthNumber] = month.split("-");
  return `${year}年${Number(monthNumber)}月の予算横断サマリ`;
}

function sortByMetric<T extends MonthlySummaryAmounts>(rows: T[], metric: OverviewSummaryMetricKey) {
  const key = metricValueKeys[metric];
  return [...rows].sort((left, right) => right[key] - left[key]);
}

function highlightedAttributes(isHighlighted: boolean) {
  return isHighlighted ? { className: "monthly-summary-highlight", "data-highlighted": "true" } : {};
}

export function MonthlySummaryDialog({
  amountDisplayMode,
  fiscalYear,
  metric,
  month,
  onClose,
  onMonthChange,
}: {
  amountDisplayMode: AmountDisplayMode;
  fiscalYear: number;
  metric: OverviewSummaryMetricKey;
  month: string;
  onClose: () => void;
  onMonthChange: (month: string) => void;
}) {
  const headingId = useId();
  const monthNumber = Number(month.slice(5));
  const highlightedKey = metricValueKeys[metric];
  const fiscalMonths = listFiscalYearMonths(fiscalYear);
  const monthIndex = fiscalMonths.indexOf(month);
  const previousMonth = monthIndex > 0 ? fiscalMonths[monthIndex - 1] : null;
  const nextMonth = monthIndex >= 0 && monthIndex < fiscalMonths.length - 1 ? fiscalMonths[monthIndex + 1] : null;
  const { data, isError, isFetching, refetch } = useQuery({
    queryKey: queryKeys.overview.monthlySummary(fiscalYear, month),
    queryFn: () => apiGet<MonthlySummaryResponse>(
      `/api/overview/monthly-summary?year=${fiscalYear}&month=${month}`,
    ),
  });

  return (
    <ModalShell
      ariaLabelledBy={headingId}
      className="overview-monthly-summary-modal"
      onRequestClose={onClose}
      usePortal
    >
      <header className="budget-modal-header">
        <div>
          <h2 id={headingId}>{formatMonthlySummaryHeading(month)}</h2>
          <div className="monthly-summary-month-navigation" role="group" aria-label="対象月の切り替え">
            <button
              type="button"
              className="budget-modal-secondary"
              disabled={previousMonth === null}
              onClick={() => previousMonth && onMonthChange(previousMonth)}
            >
              前月
            </button>
            <button
              type="button"
              className="budget-modal-secondary"
              disabled={nextMonth === null}
              onClick={() => nextMonth && onMonthChange(nextMonth)}
            >
              翌月
            </button>
          </div>
        </div>
        <button type="button" className="budget-modal-secondary" aria-label="月別サマリを閉じる" onClick={onClose}>
          ×
        </button>
      </header>
      {isError ? (
        <div className="monthly-summary-error" role="alert">
          <p>月別サマリを読み込めませんでした。</p>
          <button type="button" className="budget-modal-secondary" disabled={isFetching} onClick={() => void refetch()}>
            {isFetching ? "再読み込み中..." : "再試行"}
          </button>
        </div>
      ) : null}
      {!data && !isError ? <p role="status">月別サマリを読み込み中...</p> : null}
      {data ? (
        <div className="monthly-summary-content" data-summary-metric={metric}>
          <p className="monthly-summary-basis-note">
            現在登録されている予定・実績を月別に配分した計算値です。過去時点の保存値ではありません。
          </p>

          <section aria-label="月別概要">
            <div className="monthly-summary-card-grid">
              <article {...highlightedAttributes(highlightedKey === "actualCumulativeAmount")}>
                <span>その月までの累計執行済額</span>
                <strong>{formatAmount(data.summary.actualCumulativeAmount, amountDisplayMode)}</strong>
              </article>
              <article {...highlightedAttributes(highlightedKey === "actualAmount")}>
                <span>その月の実績額</span>
                <strong>{formatAmount(data.summary.actualAmount, amountDisplayMode)}</strong>
              </article>
              <article {...highlightedAttributes(highlightedKey === "plannedAmount")}>
                <span>現在、その月に割り当てられている未実行予定額</span>
                <strong>{formatAmount(data.summary.plannedAmount, amountDisplayMode)}</strong>
              </article>
              <article {...highlightedAttributes(highlightedKey === "plannedRemainingAmount")}>
                <span>{`${monthNumber}月時点の予定残高`}</span>
                <strong>{formatAmount(data.summary.plannedRemainingAmount, amountDisplayMode)}</strong>
              </article>
              <article {...highlightedAttributes(highlightedKey === "calculatedBalance")}>
                <span>{`${monthNumber}月終了時点の計算上の残高`}</span>
                <strong>{formatAmount(data.summary.calculatedBalance, amountDisplayMode)}</strong>
              </article>
              <article {...highlightedAttributes(highlightedKey === "spendAndPlannedCumulativeAmount")}>
                <span>{`${monthNumber}月までの執行＋予定累計`}</span>
                <strong>{formatAmount(data.summary.spendAndPlannedCumulativeAmount, amountDisplayMode)}</strong>
              </article>
            </div>
          </section>

          <MonthlySummaryTable
            amountDisplayMode={amountDisplayMode}
            caption="予算別一覧"
            highlightedKey={highlightedKey}
            nameHeading="予算名"
            rows={sortByMetric(data.funds, metric)}
            rowKey={(row) => String(row.fundId)}
            rowLabel={(row) => row.fundName}
          />

          <MonthlySummaryTable
            amountDisplayMode={amountDisplayMode}
            caption="大費目別内訳"
            highlightedKey={highlightedKey}
            nameHeading="大費目"
            rows={sortByMetric(data.crossAggregateCategories, metric)}
            rowKey={(row) => row.crossAggregateCategory}
            rowLabel={(row) => CROSS_AGGREGATE_CATEGORY_LABELS[row.crossAggregateCategory]}
          />

          <div className="monthly-summary-actions">
            <Link
              className="detail-action-button"
              to={`/search?year=${fiscalYear}&monthFrom=${month}&monthTo=${month}`}
            >
              この月の明細を見る
            </Link>
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}

function MonthlySummaryTable<TRow extends MonthlySummaryFund | MonthlySummaryCrossAggregateCategory>({
  amountDisplayMode,
  caption,
  highlightedKey,
  nameHeading,
  rowKey,
  rowLabel,
  rows,
}: {
  amountDisplayMode: AmountDisplayMode;
  caption: string;
  highlightedKey: MonthlySummaryValueKey;
  nameHeading: string;
  rowKey: (row: TRow) => string;
  rowLabel: (row: TRow) => string;
  rows: TRow[];
}) {
  return (
    <section className="monthly-summary-table-section">
      <h3>{caption}</h3>
      <div className="monthly-summary-table-scroll">
        <table aria-label={caption}>
          <thead>
            <tr>
              <th scope="col">{nameHeading}</th>
              {tableColumns.map((column) => (
                <th key={column.key} scope="col" {...highlightedAttributes(highlightedKey === column.key)}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? rows.map((row) => (
              <tr key={rowKey(row)}>
                <th scope="row">{rowLabel(row)}</th>
                {tableColumns.map((column) => (
                  <td key={column.key} {...highlightedAttributes(highlightedKey === column.key)}>
                    {formatAmount(row[column.key], amountDisplayMode)}
                  </td>
                ))}
              </tr>
            )) : (
              <tr>
                <td colSpan={tableColumns.length + 1}>対象データはありません。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

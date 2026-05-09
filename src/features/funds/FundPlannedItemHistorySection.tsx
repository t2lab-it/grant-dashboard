import { FundHistoryEntry } from "./FundHistoryEntry";
import type { FundDetailAmountDisplayMode, PlannedItemHistory } from "./fundDetailTypes";
import type { FundDetailNoteController } from "./useFundDetailNotes";

type FundPlannedItemHistorySectionProps = {
  amountDisplayMode: FundDetailAmountDisplayMode;
  deleteError?: string;
  deletingItemId?: number | null;
  focusedItemId?: number | null;
  items: PlannedItemHistory[];
  notes: FundDetailNoteController;
  onDeleteCancelledItem?: (item: PlannedItemHistory) => void;
  onRestoreCancelledItem?: (item: PlannedItemHistory) => void;
  restoreError?: string;
  restoringItemId?: number | null;
  totalItemCount: number;
};

export function FundPlannedItemHistorySection({
  amountDisplayMode,
  deleteError = "",
  deletingItemId = null,
  focusedItemId,
  items,
  notes,
  onDeleteCancelledItem,
  onRestoreCancelledItem,
  restoreError = "",
  restoringItemId = null,
  totalItemCount,
}: FundPlannedItemHistorySectionProps) {
  if (totalItemCount === 0) {
    return null;
  }

  return (
    <section className="detail-panel" aria-labelledby="fund-planned-item-history-heading">
      <div className="detail-panel-header">
        <div className="detail-panel-title-actions">
          <h3 id="fund-planned-item-history-heading">取消済項目一覧</h3>
        </div>
      </div>
      {deleteError || restoreError ? (
        <p className="budget-form-status budget-form-status-error" role="alert">
          {deleteError || restoreError}
        </p>
      ) : null}
      {items.length === 0 ? (
        <p className="detail-empty-state">条件に一致する項目はありません。</p>
      ) : (
        <div
          className="detail-table detail-history-table detail-history-table-planned"
          role="table"
          aria-label="Fund planned item history"
        >
          <div className="detail-table-head detail-history-head detail-planned-head" role="row">
            <span>予定月</span>
            <span>費目</span>
            <span>内容</span>
            <span className="detail-history-heading-amount">金額</span>
            <span>操作</span>
          </div>
          {items.map((item) => (
            <FundHistoryEntry
              key={item.id}
              amountDisplayMode={amountDisplayMode}
              entryId={`planned-item-${item.id}`}
              focused={focusedItemId === item.id}
              item={item}
              noteController={notes}
              primaryText={item.scheduledMonth}
              rowClassName="detail-planned-row"
            >
              {onRestoreCancelledItem ? (
                <button
                  type="button"
                  className="detail-action-button"
                  disabled={restoringItemId === item.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRestoreCancelledItem(item);
                  }}
                >
                  {restoringItemId === item.id ? "再計画中..." : "再計画"}
                </button>
              ) : null}
              {onDeleteCancelledItem ? (
                <button
                  type="button"
                  className="detail-action-button detail-action-button-danger"
                  disabled={deletingItemId === item.id}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDeleteCancelledItem(item);
                  }}
                >
                  {deletingItemId === item.id ? "削除中..." : "削除"}
                </button>
              ) : null}
            </FundHistoryEntry>
          ))}
        </div>
      )}
    </section>
  );
}

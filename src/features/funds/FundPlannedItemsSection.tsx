import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FundHistoryEntry } from "./FundHistoryEntry";
import type { FundDetailNoteController } from "./useFundDetailNotes";
import type { FundDetailAmountDisplayMode, PlannedItem } from "./fundDetailTypes";

type FundPlannedItemsSectionProps = {
  amountDisplayMode: FundDetailAmountDisplayMode;
  createHref: string;
  createState?: unknown;
  focusedItemId?: number | null;
  items: PlannedItem[];
  notes: FundDetailNoteController;
  onDuplicateItem: (item: PlannedItem) => void;
  onEditItem: (item: PlannedItem) => void;
  onSettleItem: (item: PlannedItem) => void;
  sortControls: ReactNode;
  totalItemCount: number;
};

export function FundPlannedItemsSection({
  amountDisplayMode,
  createHref,
  createState,
  focusedItemId,
  items,
  notes,
  onDuplicateItem,
  onEditItem,
  onSettleItem,
  sortControls,
  totalItemCount,
}: FundPlannedItemsSectionProps) {
  return (
    <section
      className="detail-panel"
      aria-labelledby="fund-planned-items-heading"
      data-testid="tour-target-fund-planned-list"
      data-tour-id="fund-planned-list"
    >
      <div className="detail-panel-header">
        <div className="detail-panel-title-actions">
          <h3 id="fund-planned-items-heading">計画項目一覧</h3>
          <Link
            className="detail-action-button detail-action-button-edit"
            to={createHref}
            state={createState}
          >
            計画作成
          </Link>
        </div>
      </div>
      {totalItemCount === 0 ? (
        <p className="detail-empty-state">未精算の計画項目はまだありません。</p>
      ) : items.length === 0 ? (
        <p className="detail-empty-state">条件に一致する項目はありません。</p>
      ) : (
        <div
          className="detail-table detail-history-table detail-history-table-planned"
          role="table"
          aria-label="計画項目一覧"
        >
          <div className="detail-table-head detail-history-head detail-planned-head detail-sort-head" role="row">
            {sortControls}
            <span className="detail-history-heading-actions">操作</span>
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
              <button
                type="button"
                className="detail-action-button detail-action-button-settle"
                data-tour-id="planned-settle-action"
                onClick={(event) => {
                  event.stopPropagation();
                  onSettleItem(item);
                }}
              >
                精算
              </button>
              <button
                type="button"
                className="detail-action-button detail-action-button-edit"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditItem(item);
                }}
              >
                編集
              </button>
              <button
                type="button"
                className="detail-action-button detail-action-button-duplicate"
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicateItem(item);
                }}
              >
                複製
              </button>
            </FundHistoryEntry>
          ))}
        </div>
      )}
    </section>
  );
}

import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { FundHistoryEntry } from "./FundHistoryEntry";
import type { FundDetailNoteController } from "./useFundDetailNotes";
import type { ActualEntry, FundDetailAmountDisplayMode } from "./fundDetailTypes";

type FundActualEntriesSectionProps = {
  amountDisplayMode: FundDetailAmountDisplayMode;
  createHref: string;
  createState?: unknown;
  entries: ActualEntry[];
  focusedEntryId?: number | null;
  notes: FundDetailNoteController;
  onDuplicateEntry: (entry: ActualEntry) => void;
  onEditEntry: (entry: ActualEntry) => void;
  sortControls: ReactNode;
  totalEntryCount: number;
};

export function FundActualEntriesSection({
  amountDisplayMode,
  createHref,
  createState,
  entries,
  focusedEntryId,
  notes,
  onDuplicateEntry,
  onEditEntry,
  sortControls,
  totalEntryCount,
}: FundActualEntriesSectionProps) {
  return (
    <section
      className="detail-panel"
      aria-labelledby="fund-actual-history-heading"
      data-tour-id="fund-actual-list"
    >
      <div className="detail-panel-header">
        <div className="detail-panel-title-actions">
          <h3 id="fund-actual-history-heading">精算項目一覧</h3>
          <Link
            className="detail-action-button detail-action-button-settle"
            to={createHref}
            state={createState}
          >
            実績作成
          </Link>
        </div>
      </div>
      {totalEntryCount === 0 ? (
        <p className="detail-empty-state">精算済み項目はまだありません。</p>
      ) : entries.length === 0 ? (
        <p className="detail-empty-state">条件に一致する項目はありません。</p>
      ) : (
        <div
          className="detail-table detail-history-table detail-history-table-actual"
          role="table"
          aria-label="Fund actual entries"
        >
          <div className="detail-table-head detail-history-head detail-actual-head detail-sort-head" role="row">
            {sortControls}
            <span className="detail-history-heading-actions">操作</span>
          </div>
          {entries.map((entry) => (
            <FundHistoryEntry
              key={entry.id}
              amountDisplayMode={amountDisplayMode}
              entryId={`actual-entry-${entry.id}`}
              focused={focusedEntryId === entry.id}
              item={entry}
              noteController={notes}
              primaryText={entry.actualDate}
              rowClassName="detail-actual-row"
            >
              <button
                type="button"
                className="detail-action-button detail-action-button-edit"
                onClick={(event) => {
                  event.stopPropagation();
                  onEditEntry(entry);
                }}
              >
                編集
              </button>
              <button
                type="button"
                className="detail-action-button detail-action-button-duplicate"
                onClick={(event) => {
                  event.stopPropagation();
                  onDuplicateEntry(entry);
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

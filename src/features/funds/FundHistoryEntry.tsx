import type { ReactNode } from "react";
import { formatAmount } from "../../lib/format";
import { FundAuxiliaryLabelChips } from "./FundAuxiliaryLabelChips";
import type { FundDetailAmountDisplayMode } from "./fundDetailTypes";
import type { FundDetailNoteController } from "./useFundDetailNotes";

type AuxiliaryLabel = { id: number; name: string };
type FundHistoryItem = {
  id: number; amount: number; auxiliaryLabels?: AuxiliaryLabel[];
  categoryName: string; description: string; notes: string;
};

type FundHistoryEntryProps = {
  amountDisplayMode: FundDetailAmountDisplayMode; children: ReactNode; entryId: string; focused?: boolean;
  item: FundHistoryItem; noteController: FundDetailNoteController; primaryText: string; rowClassName: string;
};

function FundHistoryNoteIndicator() {
  return (
    <span className="detail-note-indicator" role="img" aria-label="メモあり">
      <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16">
        <path
          d="M6 7.5h12a2.5 2.5 0 0 1 2.5 2.5v5A2.5 2.5 0 0 1 18 17.5H10l-4 3v-3H6A2.5 2.5 0 0 1 3.5 15v-5A2.5 2.5 0 0 1 6 7.5Z"
          fill="currentColor"
        />
      </svg>
    </span>
  );
}

export function FundHistoryEntry({
  amountDisplayMode,
  children,
  entryId,
  focused = false,
  item,
  noteController,
  primaryText,
  rowClassName,
}: FundHistoryEntryProps) {
  const hasNotes = item.notes.trim().length > 0;
  const isInteractive = noteController.isInteractive(hasNotes);
  const isExpanded = noteController.isExpanded(item.id, hasNotes);

  return (
    <div
      id={entryId}
      className={`detail-history-entry${isInteractive ? " detail-history-entry-interactive" : ""}${
        focused ? " detail-history-entry-focused" : ""
      }`}
      data-search-focus={focused ? "true" : undefined}
      onClick={isInteractive ? () => noteController.onRowClick(item.id, hasNotes) : undefined}
      onKeyDown={isInteractive ? (event) => noteController.onRowKeyDown(event, item.id, hasNotes) : undefined}
      onMouseEnter={hasNotes ? () => noteController.onRowHover(item.id, hasNotes) : undefined}
      onMouseLeave={hasNotes ? () => noteController.onRowLeave(item.id, hasNotes) : undefined}
      onFocus={hasNotes ? () => noteController.onRowHover(item.id, hasNotes) : undefined}
      onBlur={hasNotes ? noteController.onRowBlur : undefined}
      tabIndex={isInteractive ? 0 : undefined}
    >
      <div className={`detail-table-row detail-history-row ${rowClassName}`} role="row">
        <strong>{primaryText}</strong>
        <span>{item.categoryName}</span>
        <span className="detail-history-description">
          <span className="detail-history-description-main">
            <span>{item.description}</span>
            {hasNotes ? <FundHistoryNoteIndicator /> : null}
          </span>
          <FundAuxiliaryLabelChips labels={item.auxiliaryLabels} />
        </span>
        <span className="detail-history-amount">{formatAmount(item.amount, amountDisplayMode)}</span>
        <span className="detail-history-actions">{children}</span>
      </div>
      {hasNotes && isExpanded ? (
        <div className="detail-history-note" role="note">
          {item.notes}
        </div>
      ) : null}
    </div>
  );
}

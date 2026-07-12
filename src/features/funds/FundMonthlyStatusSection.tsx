import type { Dispatch, SetStateAction } from "react";
import { formatAmount, type AmountDisplayMode } from "../../lib/format";
import { FundSortButtons } from "./FundSortButtons";
import {
  MONTHLY_STATUS_SORT_FIELDS,
  type FundDetailSortState,
  type MonthlyStatusSortKey,
} from "./fundDetailSort";
import type { FundDetailResponse } from "./fundDetailTypes";

type FundMonthlyStatusSectionProps = {
  amountDisplayMode: AmountDisplayMode;
  items: FundDetailResponse["monthlyStatus"];
  onSortChange: Dispatch<SetStateAction<FundDetailSortState<MonthlyStatusSortKey>>>;
  sortState: FundDetailSortState<MonthlyStatusSortKey>;
};

export function FundMonthlyStatusSection({ amountDisplayMode, items, onSortChange, sortState }: FundMonthlyStatusSectionProps) {
  return (
    <section className="detail-panel" aria-labelledby="fund-timeline-heading">
      <div className="detail-panel-header"><div><h3 id="fund-timeline-heading">月別の状況</h3></div></div>
      <div className="timeline-list">
        <div className="timeline-head timeline-sort-head" role="row">
          <FundSortButtons fields={MONTHLY_STATUS_SORT_FIELDS} sortState={sortState} onSortChange={onSortChange} />
        </div>
        {items.map((item) => (
          <div key={item.month} className="timeline-row">
            <strong>{item.month}</strong>
            <span className="detail-table-money-cell">{formatAmount(item.plannedAmount, amountDisplayMode)}</span>
            <span className="detail-table-money-cell">{formatAmount(item.actualAmount, amountDisplayMode)}</span>
            <span className="detail-table-money-cell">{formatAmount(item.totalAmount, amountDisplayMode)}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

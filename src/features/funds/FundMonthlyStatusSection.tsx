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
      <div className="comparison-scroll" role="region" aria-label="月別の状況の横スクロール" tabIndex={0}>
        <table className="comparison-table" aria-label="月別の状況">
          <thead><tr>{MONTHLY_STATUS_SORT_FIELDS.map((field) => <th scope="col" key={field.key} aria-sort={sortState.key === field.key ? (sortState.direction === "asc" ? "ascending" : "descending") : "none"}>
            <FundSortButtons fields={[field]} sortState={sortState} onSortChange={onSortChange} />
          </th>)}</tr></thead>
          <tbody>{items.map((item) => <tr key={item.month}>
            <th scope="row">{item.month}</th><td>{formatAmount(item.plannedAmount, amountDisplayMode)}</td><td>{formatAmount(item.actualAmount, amountDisplayMode)}</td><td>{formatAmount(item.totalAmount, amountDisplayMode)}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

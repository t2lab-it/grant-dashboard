import type { ActualEntry, FundDetailResponse, PlannedItem } from "./fundDetailTypes";

export type SortDirection = "asc" | "desc";
export type MonthlyStatusSortKey = "month" | "plannedAmount" | "actualAmount" | "totalAmount";
export type ActualEntrySortKey = "actualDate" | "categoryName" | "description" | "amount";
export type PlannedItemSortKey = "scheduledMonth" | "categoryName" | "description" | "amount";
export type FundDetailSortState<K extends string> = {
  key: K;
  direction: SortDirection;
};
export type FundDetailSortField<K extends string> = {
  key: K;
  label: string;
  defaultDirection: SortDirection;
  align?: "start" | "end";
  className?: string;
};

type MonthlyStatusItem = FundDetailResponse["monthlyStatus"][number];

export const MONTHLY_STATUS_SORT_FIELDS: FundDetailSortField<MonthlyStatusSortKey>[] = [
  { key: "month", label: "月", defaultDirection: "asc" },
  { key: "plannedAmount", label: "執行予定額", defaultDirection: "desc", align: "end", className: "detail-table-money-heading" },
  { key: "actualAmount", label: "執行済額", defaultDirection: "desc", align: "end", className: "detail-table-money-heading" },
  {
    key: "totalAmount",
    label: "執行予定額+執行済額",
    defaultDirection: "desc",
    align: "end",
    className: "detail-table-money-heading",
  },
];

export const ACTUAL_ENTRY_SORT_FIELDS: FundDetailSortField<ActualEntrySortKey>[] = [
  { key: "actualDate", label: "日付", defaultDirection: "asc" },
  { key: "categoryName", label: "費目", defaultDirection: "asc" },
  { key: "description", label: "内容", defaultDirection: "asc" },
  { key: "amount", label: "金額", defaultDirection: "desc", align: "end", className: "detail-history-heading-amount" },
];

export const PLANNED_ITEM_SORT_FIELDS: FundDetailSortField<PlannedItemSortKey>[] = [
  { key: "scheduledMonth", label: "執行予定月", defaultDirection: "asc" },
  { key: "categoryName", label: "費目", defaultDirection: "asc" },
  { key: "description", label: "内容", defaultDirection: "asc" },
  { key: "amount", label: "金額", defaultDirection: "desc", align: "end", className: "detail-history-heading-amount" },
];

function compareText(a: string, b: string) {
  return a.localeCompare(b);
}

function compareNumbers(left: number, right: number, direction: SortDirection) {
  return direction === "asc" ? left - right : right - left;
}

function compareOrderedText(left: string, right: string, direction: SortDirection) {
  return direction === "asc" ? compareText(left, right) : compareText(right, left);
}

export function toggleSortState<K extends string>(
  current: FundDetailSortState<K>,
  fields: FundDetailSortField<K>[],
  key: K,
): FundDetailSortState<K> {
  if (current.key === key) {
    return {
      key,
      direction: current.direction === "asc" ? "desc" : "asc",
    };
  }

  return {
    key,
    direction: fields.find((field) => field.key === key)?.defaultDirection ?? "asc",
  };
}

export function sortMonthlyStatus(items: MonthlyStatusItem[], sortState: FundDetailSortState<MonthlyStatusSortKey>) {
  return [...items].sort((left, right) => {
    switch (sortState.key) {
      case "plannedAmount":
        return compareNumbers(left.plannedAmount, right.plannedAmount, sortState.direction) ||
          compareOrderedText(left.month, right.month, "desc");
      case "actualAmount":
        return compareNumbers(left.actualAmount, right.actualAmount, sortState.direction) ||
          compareOrderedText(left.month, right.month, "desc");
      case "totalAmount":
        return compareNumbers(left.totalAmount, right.totalAmount, sortState.direction) ||
          compareOrderedText(left.month, right.month, "desc");
      case "month":
      default:
        return compareOrderedText(left.month, right.month, sortState.direction);
    }
  });
}

export function sortActualEntries(entries: ActualEntry[], sortState: FundDetailSortState<ActualEntrySortKey>) {
  return [...entries].sort((left, right) => {
    switch (sortState.key) {
      case "categoryName":
        return compareOrderedText(left.categoryName, right.categoryName, sortState.direction) ||
          compareOrderedText(left.actualDate, right.actualDate, "desc");
      case "description":
        return compareOrderedText(left.description, right.description, sortState.direction) ||
          compareOrderedText(left.actualDate, right.actualDate, "desc");
      case "amount":
        return compareNumbers(left.amount, right.amount, sortState.direction) ||
          compareOrderedText(left.actualDate, right.actualDate, "desc");
      case "actualDate":
      default:
        return compareOrderedText(left.actualDate, right.actualDate, sortState.direction) ||
          compareText(left.description, right.description);
    }
  });
}

export function sortPlannedItems(items: PlannedItem[], sortState: FundDetailSortState<PlannedItemSortKey>) {
  return [...items].sort((left, right) => {
    switch (sortState.key) {
      case "categoryName":
        return compareOrderedText(left.categoryName, right.categoryName, sortState.direction) ||
          compareOrderedText(left.scheduledMonth, right.scheduledMonth, "desc");
      case "description":
        return compareOrderedText(left.description, right.description, sortState.direction) ||
          compareOrderedText(left.scheduledMonth, right.scheduledMonth, "desc");
      case "amount":
        return compareNumbers(left.amount, right.amount, sortState.direction) ||
          compareOrderedText(left.scheduledMonth, right.scheduledMonth, "desc");
      case "scheduledMonth":
      default:
        return compareOrderedText(left.scheduledMonth, right.scheduledMonth, sortState.direction) ||
          compareOrderedText(left.plannedDate, right.plannedDate, sortState.direction);
    }
  });
}

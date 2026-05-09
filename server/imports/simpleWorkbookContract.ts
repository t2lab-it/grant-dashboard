export const SIMPLE_WORKBOOK_HEADERS = {
  funds: [
    "fund_code",
    "name",
    "fiscal_year",
    "awarded_amount",
    "notes",
    "project_tags",
    "auxiliary_labels",
    "display_order",
  ],
  categories: ["fund_code", "category_code", "name", "cross_aggregate_category", "display_order"],
  budget_lines: ["fund_code", "category_code", "amount", "notes"],
  planned_items: [
    "planned_ref",
    "fund_code",
    "category_code",
    "planned_date",
    "scheduled_month",
    "description",
    "amount",
    "notes",
    "auxiliary_labels",
  ],
  actual_entries: [
    "fund_code",
    "category_code",
    "actual_date",
    "description",
    "amount",
    "planned_ref",
    "notes",
    "auxiliary_labels",
  ],
} as const;

export type SimpleWorkbookSheetName = keyof typeof SIMPLE_WORKBOOK_HEADERS;

export const SIMPLE_WORKBOOK_SHEET_NAMES = Object.keys(
  SIMPLE_WORKBOOK_HEADERS,
) as SimpleWorkbookSheetName[];

export function getSimpleWorkbookHeaders(sheetName: SimpleWorkbookSheetName) {
  return [...SIMPLE_WORKBOOK_HEADERS[sheetName]];
}

function headersEqual(left: string[], right: readonly string[]) {
  return left.length === right.length && right.every((cell, index) => left[index] === cell);
}

export function resolveSimpleWorkbookHeader(
  sheetName: SimpleWorkbookSheetName,
  header: string[],
) {
  const currentHeader = SIMPLE_WORKBOOK_HEADERS[sheetName];
  if (headersEqual(header, currentHeader)) {
    return header;
  }

  throw new Error(`Invalid header for ${sheetName}: expected ${currentHeader.join(", ")}`);
}

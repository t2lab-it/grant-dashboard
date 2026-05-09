import type {
  ImportWarning,
  ImportWarningCode,
  ImportedCategoryDraft,
  ImportedFundDraft,
} from "../types";

export type SheetRow = {
  rowNumber: number;
  values: Record<string, string>;
};

export type ParsedFund = ImportedFundDraft;
export type ParsedCategory = ImportedCategoryDraft;

export function categoryKey(fundCode: string, categoryCode: string) {
  return `${fundCode}\u0000${categoryCode}`;
}

export function pushWarning(
  warnings: ImportWarning[],
  code: ImportWarningCode,
  sheet_name: string,
  row_number: number,
  message: string,
) {
  warnings.push({ code, sheet_name, row_number, message });
}

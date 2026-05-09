import { readActualEntries, readBudgetLines, readCategories, readFunds, readPlannedItems } from "./parse/parseSheets";
import { assertRequiredWorkbookSheets, readSimpleWorkbook, readWorkbookSheetRows } from "./parse/workbookLoader";
import type { DryRunImportResult } from "./types";

export function dryRunSimpleWorkbookImport({
  workbookPath,
}: {
  workbookPath: string;
}): DryRunImportResult {
  const workbook = readSimpleWorkbook(workbookPath);

  assertRequiredWorkbookSheets(workbook);

  const funds = readFunds(readWorkbookSheetRows(workbook, "funds"));
  const categories = readCategories(readWorkbookSheetRows(workbook, "categories"), funds.fundNameByCode);
  const budgetLines = readBudgetLines(
    readWorkbookSheetRows(workbook, "budget_lines"),
    funds.fundNameByCode,
    categories.categoryNameByKey,
  );
  const plannedItems = readPlannedItems(
    readWorkbookSheetRows(workbook, "planned_items"),
    funds.fundNameByCode,
    categories.categoryNameByKey,
  );
  const actualEntries = readActualEntries(
    readWorkbookSheetRows(workbook, "actual_entries"),
    funds.fundNameByCode,
    categories.categoryNameByKey,
    plannedItems.plannedRefSet,
  );
  const warnings = [...budgetLines.warnings, ...actualEntries.warnings];

  return {
    workbook_path: workbookPath,
    funds: funds.rows,
    categories: categories.rows,
    budget_lines: budgetLines.rows,
    planned_items: plannedItems.rows,
    actual_entries: actualEntries.rows,
    warnings,
    counts: {
      funds: funds.rows.length,
      categories: categories.rows.length,
      budget_lines: budgetLines.rows.length,
      planned_items: plannedItems.rows.length,
      actual_entries: actualEntries.rows.length,
      warnings: warnings.length,
    },
  };
}

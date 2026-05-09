import type {
  ImportWarning,
  ImportedActualEntryDraft,
  ImportedBudgetLineDraft,
  ImportedPlannedItemDraft,
} from "../types";
import { categoryKey, pushWarning, type ParsedCategory, type ParsedFund, type SheetRow } from "./parseContext";
import { assertCode, assertRequiredText, parseDate, parseInteger, parseMonth } from "./parseScalars";
import {
  isCrossAggregateCategory,
} from "../../../src/contracts/crossAggregateCategory";

function parseClassificationNames(value: string) {
  const names: string[] = [];

  for (const rawName of value.split(";")) {
    const name = rawName.trim();
    if (name !== "" && !names.includes(name)) {
      names.push(name);
    }
  }

  return names;
}

export function readFunds(rows: SheetRow[]) {
  const parsedFunds: ParsedFund[] = [];
  const fundNameByCode = new Map<string, string>();

  for (const row of rows) {
    const fundCode = assertCode(row.values.fund_code, "fund_code", "funds", row.rowNumber);

    if (fundNameByCode.has(fundCode)) {
      throw new Error(`Duplicate fund_code: ${fundCode}`);
    }

    const fund = {
      fund_code: fundCode,
      name: assertRequiredText(row.values.name, "name", "funds", row.rowNumber),
      fiscal_year: parseInteger(row.values.fiscal_year, "fiscal_year", "funds", row.rowNumber),
      awarded_amount: parseInteger(
        row.values.awarded_amount,
        "awarded_amount",
        "funds",
        row.rowNumber,
      ),
      notes: row.values.notes,
      project_tag_names: parseClassificationNames(row.values.project_tags),
      auxiliary_label_names: parseClassificationNames(row.values.auxiliary_labels),
      display_order: parseInteger(row.values.display_order, "display_order", "funds", row.rowNumber),
    } satisfies ParsedFund;

    parsedFunds.push(fund);
    fundNameByCode.set(fundCode, fund.name);
  }

  return {
    rows: parsedFunds,
    fundNameByCode,
  };
}

export function readCategories(rows: SheetRow[], fundNameByCode: Map<string, string>) {
  const parsedCategories: ParsedCategory[] = [];
  const categoryNameByKey = new Map<string, string>();

  for (const row of rows) {
    const fundCode = assertCode(row.values.fund_code, "fund_code", "categories", row.rowNumber);
    const fundName = fundNameByCode.get(fundCode);
    if (!fundName) {
      throw new Error(`Unknown fund_code at categories:${row.rowNumber}: ${fundCode}`);
    }

    const categoryCode = assertCode(row.values.category_code, "category_code", "categories", row.rowNumber);
    const key = categoryKey(fundCode, categoryCode);
    if (categoryNameByKey.has(key)) {
      throw new Error(`Duplicate category_code for ${fundCode}: ${categoryCode}`);
    }
    const crossAggregateCategoryRaw = row.values.cross_aggregate_category.trim();
    if (!isCrossAggregateCategory(crossAggregateCategoryRaw)) {
      throw new Error(
        `Invalid cross_aggregate_category at categories:${row.rowNumber}: ${crossAggregateCategoryRaw}`,
      );
    }

    const category = {
      fund_code: fundCode,
      category_code: categoryCode,
      fund_name: fundName,
      name: assertRequiredText(row.values.name, "name", "categories", row.rowNumber),
      cross_aggregate_category: crossAggregateCategoryRaw,
      display_order: parseInteger(row.values.display_order, "display_order", "categories", row.rowNumber),
    } satisfies ParsedCategory;

    parsedCategories.push(category);
    categoryNameByKey.set(key, category.name);
  }

  return {
    rows: parsedCategories,
    categoryNameByKey,
  };
}

export function readBudgetLines(
  rows: SheetRow[],
  fundNameByCode: Map<string, string>,
  categoryNameByKey: Map<string, string>,
) {
  const warnings: ImportWarning[] = [];
  const parsedBudgetLines: ImportedBudgetLineDraft[] = [];

  for (const row of rows) {
    const fundCode = assertCode(row.values.fund_code, "fund_code", "budget_lines", row.rowNumber);
    const fundName = fundNameByCode.get(fundCode);
    if (!fundName) {
      throw new Error(`Unknown fund_code at budget_lines:${row.rowNumber}: ${fundCode}`);
    }

    const categoryCode = assertCode(
      row.values.category_code,
      "category_code",
      "budget_lines",
      row.rowNumber,
    );
    const categoryName = categoryNameByKey.get(categoryKey(fundCode, categoryCode));
    if (!categoryName) {
      throw new Error(`Unknown category_code at budget_lines:${row.rowNumber}: ${fundCode}/${categoryCode}`);
    }

    let amount: number | null = null;
    if (row.values.amount === "") {
      pushWarning(
        warnings,
        "null_budget_amount",
        "budget_lines",
        row.rowNumber,
        `budget_lines.amount is blank for ${fundCode}/${categoryCode}`,
      );
    } else {
      amount = parseInteger(row.values.amount, "amount", "budget_lines", row.rowNumber);
    }

    parsedBudgetLines.push({
      fund_code: fundCode,
      category_code: categoryCode,
      fund_name: fundName,
      category_name: categoryName,
      amount,
      notes: row.values.notes,
    });
  }

  return {
    rows: parsedBudgetLines,
    warnings,
  };
}

export function readPlannedItems(
  rows: SheetRow[],
  fundNameByCode: Map<string, string>,
  categoryNameByKey: Map<string, string>,
) {
  const parsedPlannedItems: ImportedPlannedItemDraft[] = [];
  const plannedRefSet = new Set<string>();

  for (const row of rows) {
    const plannedRef = assertCode(row.values.planned_ref, "planned_ref", "planned_items", row.rowNumber);
    if (plannedRefSet.has(plannedRef)) {
      throw new Error(`Duplicate planned_ref: ${plannedRef}`);
    }

    const fundCode = assertCode(row.values.fund_code, "fund_code", "planned_items", row.rowNumber);
    const fundName = fundNameByCode.get(fundCode);
    if (!fundName) {
      throw new Error(`Unknown fund_code at planned_items:${row.rowNumber}: ${fundCode}`);
    }

    const categoryCode = assertCode(
      row.values.category_code,
      "category_code",
      "planned_items",
      row.rowNumber,
    );
    const categoryName = categoryNameByKey.get(categoryKey(fundCode, categoryCode));
    if (!categoryName) {
      throw new Error(`Unknown category_code at planned_items:${row.rowNumber}: ${fundCode}/${categoryCode}`);
    }

    parsedPlannedItems.push({
      fund_code: fundCode,
      category_code: categoryCode,
      planned_ref: plannedRef,
      fund_name: fundName,
      category_name: categoryName,
      planned_date: parseDate(row.values.planned_date, "planned_date", "planned_items", row.rowNumber),
      scheduled_month: parseMonth(
        row.values.scheduled_month,
        "scheduled_month",
        "planned_items",
        row.rowNumber,
      ),
      description: assertRequiredText(row.values.description, "description", "planned_items", row.rowNumber),
      amount: parseInteger(row.values.amount, "amount", "planned_items", row.rowNumber),
      status: "planned",
      notes: row.values.notes,
      auxiliary_label_names: parseClassificationNames(row.values.auxiliary_labels),
    });
    plannedRefSet.add(plannedRef);
  }

  return {
    rows: parsedPlannedItems,
    plannedRefSet,
  };
}

export function readActualEntries(
  rows: SheetRow[],
  fundNameByCode: Map<string, string>,
  categoryNameByKey: Map<string, string>,
  plannedRefSet: Set<string>,
) {
  const warnings: ImportWarning[] = [];
  const parsedActualEntries: ImportedActualEntryDraft[] = [];

  for (const row of rows) {
    const fundCode = assertCode(row.values.fund_code, "fund_code", "actual_entries", row.rowNumber);
    const fundName = fundNameByCode.get(fundCode);
    if (!fundName) {
      throw new Error(`Unknown fund_code at actual_entries:${row.rowNumber}: ${fundCode}`);
    }

    const categoryCode = assertCode(
      row.values.category_code,
      "category_code",
      "actual_entries",
      row.rowNumber,
    );
    const categoryName = categoryNameByKey.get(categoryKey(fundCode, categoryCode));
    if (!categoryName) {
      throw new Error(`Unknown category_code at actual_entries:${row.rowNumber}: ${fundCode}/${categoryCode}`);
    }

    const plannedRef = row.values.planned_ref
      ? assertCode(row.values.planned_ref, "planned_ref", "actual_entries", row.rowNumber)
      : null;

    if (plannedRef && !plannedRefSet.has(plannedRef)) {
      throw new Error(`Unknown planned_ref at actual_entries:${row.rowNumber}: ${plannedRef}`);
    }

    if (!plannedRef) {
      pushWarning(
        warnings,
        "unlinked_actual_entry",
        "actual_entries",
        row.rowNumber,
        `actual_entries.planned_ref is blank for ${fundCode}/${categoryCode}`,
      );
    }

    parsedActualEntries.push({
      fund_code: fundCode,
      category_code: categoryCode,
      planned_ref: plannedRef,
      fund_name: fundName,
      category_name: categoryName,
      planned_item_id: null,
      actual_date: parseDate(row.values.actual_date, "actual_date", "actual_entries", row.rowNumber),
      description: assertRequiredText(row.values.description, "description", "actual_entries", row.rowNumber),
      amount: parseInteger(row.values.amount, "amount", "actual_entries", row.rowNumber),
      notes: row.values.notes,
      auxiliary_label_names: parseClassificationNames(row.values.auxiliary_labels),
    });
  }

  return {
    rows: parsedActualEntries,
    warnings,
  };
}

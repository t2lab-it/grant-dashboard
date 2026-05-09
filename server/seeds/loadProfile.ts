import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type {
  ActualEntrySeed,
  BudgetLineSeed,
  CategorySeed,
  ClassificationAssignmentSeed,
  ClassificationTagSeed,
  FundSeed,
  PlannedItemSeed,
  SeedProfileData,
} from "./types";
import { CROSS_AGGREGATE_CATEGORY_CODES } from "../../src/contracts/crossAggregateCategory";

const CODE_PATTERN = /^[A-Za-z0-9_-]+$/;

const fundSchema = z
  .object({
    id: z.number().int(),
    fund_code: z.string(),
    name: z.string().min(1),
    fiscal_year: z.number().int(),
    awarded_amount: z.number().int(),
    notes: z.string(),
    display_order: z.number().int(),
  })
  .strict();

const categorySchema = z
  .object({
    id: z.number().int(),
    fund_id: z.number().int(),
    category_code: z.string(),
    name: z.string().min(1),
    cross_aggregate_category: z.enum(CROSS_AGGREGATE_CATEGORY_CODES),
    display_order: z.number().int(),
  })
  .strict();

const budgetLineSchema = z
  .object({
    id: z.number().int(),
    fund_id: z.number().int(),
    category_id: z.number().int(),
    amount: z.number().int().nullable(),
    notes: z.string(),
  })
  .strict();

const plannedItemSchema = z
  .object({
    id: z.number().int(),
    fund_id: z.number().int(),
    category_id: z.number().int(),
    planned_ref: z.string(),
    planned_date: z.string().min(1),
    scheduled_month: z.string().min(1),
    description: z.string().min(1),
    amount: z.number().int(),
    status: z.string().min(1),
    notes: z.string(),
  })
  .strict();

const actualEntrySchema = z
  .object({
    id: z.number().int(),
    fund_id: z.number().int(),
    category_id: z.number().int(),
    planned_item_id: z.number().int().nullable(),
    actual_date: z.string().min(1),
    description: z.string().min(1),
    amount: z.number().int(),
    notes: z.string(),
  })
  .strict();

const classificationTagSchema = z
  .object({
    id: z.number().int(),
    kind: z.enum(["project", "auxiliary"]),
    name: z.string().min(1),
    color: z.string().min(1),
  })
  .strict();

const classificationAssignmentSchema = z
  .object({
    tag_id: z.number().int(),
    target_type: z.enum(["fund", "planned_item", "actual_entry"]),
    target_id: z.number().int(),
  })
  .strict();

function readSeedTable<T>(filePath: string, schema: z.ZodType<T[]>) {
  return schema.parse(JSON.parse(readFileSync(filePath, "utf8")));
}

function assertUniqueIds(rows: Array<{ id: number }>, filename: string) {
  const seen = new Set<number>();

  for (const row of rows) {
    if (seen.has(row.id)) {
      throw new Error(`Duplicate id ${row.id} in ${filename}`);
    }
    seen.add(row.id);
  }
}

function assertWorkbookIdentity(value: string, label: string, filename: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing ${label} in ${filename}`);
  }

  if (!CODE_PATTERN.test(trimmed)) {
    throw new Error(`Invalid ${label} in ${filename}: ${trimmed}`);
  }

  return trimmed;
}

function assertUniqueCategoryIdentity(rows: CategorySeed[]) {
  const seen = new Set<string>();

  for (const row of rows) {
    const categoryCode = assertWorkbookIdentity(row.category_code, "category_code", "categories.json");
    const key = `${row.fund_id}:${categoryCode}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate category identity ${key} in categories.json`);
    }
    seen.add(key);
  }
}

function assertForeignKey(filename: string, fieldName: string, value: number, ids: Set<number>) {
  if (!ids.has(value)) {
    throw new Error(`${filename} references missing ${fieldName} ${value}`);
  }
}

function assertCategoryMatchesFund(
  filename: string,
  rowId: number,
  fundId: number,
  categoryId: number,
  categoryById: Map<number, CategorySeed>,
) {
  const category = categoryById.get(categoryId);
  if (!category) {
    return;
  }

  if (category.fund_id !== fundId) {
    throw new Error(
      `${filename} ${rowId} category_id ${categoryId} belongs to fund_id ${category.fund_id}, expected ${fundId}`,
    );
  }
}

function assertPlannedItemMatchesActualEntry(
  rowId: number,
  fundId: number,
  categoryId: number,
  plannedItemId: number,
  plannedItemById: Map<number, PlannedItemSeed>,
) {
  const plannedItem = plannedItemById.get(plannedItemId);
  if (!plannedItem) {
    return;
  }

  if (plannedItem.fund_id !== fundId || plannedItem.category_id !== categoryId) {
    throw new Error(
      `actual_entries.json ${rowId} planned_item_id ${plannedItemId} belongs to fund_id ${plannedItem.fund_id}/category_id ${plannedItem.category_id}, expected ${fundId}/${categoryId}`,
    );
  }
}

function assertRelations(
  data: Pick<
    SeedProfileData,
    | "funds"
    | "categories"
    | "budget_lines"
    | "planned_items"
    | "actual_entries"
    | "classification_tags"
    | "classification_assignments"
  >,
) {
  const fundIds = new Set(data.funds.map((row) => row.id));
  const categoryIds = new Set(data.categories.map((row) => row.id));
  const plannedItemIds = new Set(data.planned_items.map((item) => item.id));
  const actualEntryIds = new Set(data.actual_entries.map((entry) => entry.id));
  const classificationTagIds = new Set(data.classification_tags.map((tag) => tag.id));
  const categoryById = new Map(data.categories.map((row) => [row.id, row]));
  const plannedItemById = new Map(data.planned_items.map((row) => [row.id, row]));

  for (const category of data.categories) {
    assertForeignKey("categories.json", "fund_id", category.fund_id, fundIds);
  }

  for (const row of data.budget_lines) {
    assertForeignKey("budget_lines.json", "fund_id", row.fund_id, fundIds);
    assertForeignKey("budget_lines.json", "category_id", row.category_id, categoryIds);
    assertCategoryMatchesFund("budget_lines.json", row.id, row.fund_id, row.category_id, categoryById);
  }

  for (const row of data.planned_items) {
    assertForeignKey("planned_items.json", "fund_id", row.fund_id, fundIds);
    assertForeignKey("planned_items.json", "category_id", row.category_id, categoryIds);
    assertCategoryMatchesFund("planned_items.json", row.id, row.fund_id, row.category_id, categoryById);
  }

  for (const row of data.actual_entries) {
    assertForeignKey("actual_entries.json", "fund_id", row.fund_id, fundIds);
    assertForeignKey("actual_entries.json", "category_id", row.category_id, categoryIds);
    if (row.planned_item_id !== null) {
      assertForeignKey("actual_entries.json", "planned_item_id", row.planned_item_id, plannedItemIds);
      assertPlannedItemMatchesActualEntry(row.id, row.fund_id, row.category_id, row.planned_item_id, plannedItemById);
    }
    assertCategoryMatchesFund("actual_entries.json", row.id, row.fund_id, row.category_id, categoryById);
  }

  for (const assignment of data.classification_assignments) {
    assertForeignKey("classification_assignments.json", "tag_id", assignment.tag_id, classificationTagIds);
    if (assignment.target_type === "fund") {
      assertForeignKey("classification_assignments.json", "target_id", assignment.target_id, fundIds);
    } else if (assignment.target_type === "planned_item") {
      assertForeignKey("classification_assignments.json", "target_id", assignment.target_id, plannedItemIds);
    } else {
      assertForeignKey("classification_assignments.json", "target_id", assignment.target_id, actualEntryIds);
    }
  }
}

export function loadSeedProfile({
  rootDir = process.cwd(),
  profile,
}: {
  rootDir?: string;
  profile: string;
}): SeedProfileData {
  const profileDir = resolve(rootDir, "seeds", profile);

  const funds = readSeedTable<FundSeed>(resolve(profileDir, "funds.json"), z.array(fundSchema)).map((row) => ({
    ...row,
    fund_code: assertWorkbookIdentity(row.fund_code, "fund_code", "funds.json"),
  }));
  const categories = readSeedTable<CategorySeed>(resolve(profileDir, "categories.json"), z.array(categorySchema)).map(
    (row) => ({
      ...row,
      category_code: assertWorkbookIdentity(row.category_code, "category_code", "categories.json"),
      cross_aggregate_category: row.cross_aggregate_category,
    }),
  );
  const budgetLines = readSeedTable<BudgetLineSeed>(resolve(profileDir, "budget_lines.json"), z.array(budgetLineSchema));
  const plannedItems = readSeedTable<PlannedItemSeed>(resolve(profileDir, "planned_items.json"), z.array(plannedItemSchema)).map(
    (row) => ({
      ...row,
      planned_ref: assertWorkbookIdentity(row.planned_ref, "planned_ref", "planned_items.json"),
    }),
  );
  const actualEntries = readSeedTable<ActualEntrySeed>(resolve(profileDir, "actual_entries.json"), z.array(actualEntrySchema));
  const classificationTags = readSeedTable<ClassificationTagSeed>(
    resolve(profileDir, "classification_tags.json"),
    z.array(classificationTagSchema),
  );
  const classificationAssignments = readSeedTable<ClassificationAssignmentSeed>(
    resolve(profileDir, "classification_assignments.json"),
    z.array(classificationAssignmentSchema),
  );

  assertUniqueIds(funds, "funds.json");
  assertUniqueIds(categories, "categories.json");
  assertUniqueIds(budgetLines, "budget_lines.json");
  assertUniqueIds(plannedItems, "planned_items.json");
  assertUniqueIds(actualEntries, "actual_entries.json");
  assertUniqueIds(classificationTags, "classification_tags.json");
  assertUniqueIdentityValues(funds, "fund_code", (row) => row.fund_code);
  assertUniqueCategoryIdentity(categories);
  assertUniqueIdentityValues(plannedItems, "planned_ref", (row) => row.planned_ref);

  assertRelations({
    funds,
    categories,
    budget_lines: budgetLines,
    planned_items: plannedItems,
    actual_entries: actualEntries,
    classification_tags: classificationTags,
    classification_assignments: classificationAssignments,
  });

  return {
    funds,
    categories,
    budget_lines: budgetLines,
    planned_items: plannedItems,
    actual_entries: actualEntries,
    classification_tags: classificationTags,
    classification_assignments: classificationAssignments,
  };
}

function assertUniqueIdentityValues<T>(
  rows: T[],
  fieldName: string,
  getValue: (row: T) => string,
) {
  const seen = new Set<string>();

  for (const row of rows) {
    const value = getValue(row);
    if (seen.has(value)) {
      throw new Error(`Duplicate ${fieldName}: ${value}`);
    }
    seen.add(value);
  }
}

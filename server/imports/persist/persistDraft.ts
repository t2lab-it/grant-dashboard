import type Database from "better-sqlite3";
import type { DryRunImportResult } from "../types";
import {
  createDraftIdentifierMaps,
  resolveCategoryId,
  resolveFundId,
  resolvePlannedItemId,
  setCategoryId,
} from "./identifierMaps";

type ClassificationKind = "project" | "auxiliary";
type ClassificationTargetType = "fund" | "planned_item" | "actual_entry";

const IMPORTED_CLASSIFICATION_COLOR = "#64748b";

function insertAndReadId(db: Database.Database) {
  const row = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
  return Number(row.id);
}

function classificationKey(kind: ClassificationKind, name: string) {
  return `${kind}\u0000${name}`;
}

function createClassificationResolver(db: Database.Database) {
  const rows = db
    .prepare(
      `
      SELECT id, kind, name
      FROM classification_tags
      ORDER BY id
      `,
    )
    .all() as Array<{ id: number; kind: ClassificationKind; name: string }>;
  const tagIdByKey = new Map<string, number>();

  for (const row of rows) {
    const key = classificationKey(row.kind, row.name);
    if (!tagIdByKey.has(key)) {
      tagIdByKey.set(key, row.id);
    }
  }

  const insertTag = db.prepare(`
    INSERT INTO classification_tags (kind, name, color)
    VALUES (@kind, @name, @color)
  `);

  return {
    resolveTagId(kind: ClassificationKind, name: string) {
      const key = classificationKey(kind, name);
      const existingId = tagIdByKey.get(key);
      if (existingId !== undefined) {
        return existingId;
      }

      insertTag.run({ kind, name, color: IMPORTED_CLASSIFICATION_COLOR });
      const tagId = insertAndReadId(db);
      tagIdByKey.set(key, tagId);
      return tagId;
    },
  };
}

function assignClassifications(
  db: Database.Database,
  resolver: ReturnType<typeof createClassificationResolver>,
  targetType: ClassificationTargetType,
  targetId: number,
  kind: ClassificationKind,
  names: string[],
) {
  const insertAssignment = db.prepare(`
    INSERT OR IGNORE INTO classification_assignments (tag_id, target_type, target_id)
    VALUES (@tagId, @targetType, @targetId)
  `);

  for (const name of names) {
    insertAssignment.run({
      tagId: resolver.resolveTagId(kind, name),
      targetType,
      targetId,
    });
  }
}

export function persistDraftRecords(db: Database.Database, draft: DryRunImportResult) {
  const fundStmt = db.prepare(`
    INSERT INTO funds (fund_code, name, fiscal_year, awarded_amount, notes, display_order)
    VALUES (@fund_code, @name, @fiscal_year, @awarded_amount, @notes, @display_order)
  `);
  const categoryStmt = db.prepare(`
    INSERT INTO categories (fund_id, category_code, name, cross_aggregate_category, display_order)
    VALUES (@fund_id, @category_code, @name, @cross_aggregate_category, @display_order)
  `);
  const budgetLineStmt = db.prepare(`
    INSERT INTO budget_lines (fund_id, category_id, amount, notes)
    VALUES (@fund_id, @category_id, @amount, @notes)
  `);
  const plannedItemStmt = db.prepare(`
    INSERT INTO planned_items (fund_id, category_id, planned_ref, planned_date, scheduled_month, description, amount, status, notes)
    VALUES (@fund_id, @category_id, @planned_ref, @planned_date, @scheduled_month, @description, @amount, @status, @notes)
  `);
  const actualEntryStmt = db.prepare(`
    INSERT INTO actual_entries (fund_id, category_id, planned_item_id, actual_date, description, amount, notes)
    VALUES (@fund_id, @category_id, @planned_item_id, @actual_date, @description, @amount, @notes)
  `);

  const { fundIdByCode, categoryIdByCode, plannedItemIdByRef } = createDraftIdentifierMaps();
  const classificationResolver = createClassificationResolver(db);

  for (const fund of draft.funds) {
    fundStmt.run(fund);
    const fundId = insertAndReadId(db);
    fundIdByCode.set(fund.fund_code, fundId);
    assignClassifications(db, classificationResolver, "fund", fundId, "project", fund.project_tag_names ?? []);
    assignClassifications(
      db,
      classificationResolver,
      "fund",
      fundId,
      "auxiliary",
      fund.auxiliary_label_names ?? [],
    );
  }

  for (const category of draft.categories) {
    const fundId = resolveFundId(fundIdByCode, category.fund_code, `category ${category.fund_code}/${category.category_code}`);

    categoryStmt.run({
      fund_id: fundId,
      category_code: category.category_code,
      name: category.name,
      cross_aggregate_category: category.cross_aggregate_category,
      display_order: category.display_order,
    });
    setCategoryId(categoryIdByCode, category.fund_code, category.category_code, insertAndReadId(db));
  }

  for (const budgetLine of draft.budget_lines) {
    const fundId = resolveFundId(
      fundIdByCode,
      budgetLine.fund_code,
      `budget line ${budgetLine.fund_code}/${budgetLine.category_code}`,
    );
    const categoryId = resolveCategoryId(
      categoryIdByCode,
      budgetLine.fund_code,
      budgetLine.category_code,
      "budget line",
    );

    budgetLineStmt.run({
      fund_id: fundId,
      category_id: categoryId,
      amount: budgetLine.amount,
      notes: budgetLine.notes,
    });
  }

  for (const plannedItem of draft.planned_items) {
    const fundId = resolveFundId(
      fundIdByCode,
      plannedItem.fund_code,
      `planned item ${plannedItem.fund_code}/${plannedItem.category_code}`,
    );
    const categoryId = resolveCategoryId(
      categoryIdByCode,
      plannedItem.fund_code,
      plannedItem.category_code,
      "planned item",
    );

    plannedItemStmt.run({
      fund_id: fundId,
      category_id: categoryId,
      planned_ref: plannedItem.planned_ref ?? null,
      planned_date: plannedItem.planned_date,
      scheduled_month: plannedItem.scheduled_month,
      description: plannedItem.description,
      amount: plannedItem.amount,
      status: plannedItem.status,
      notes: plannedItem.notes,
    });

    const plannedItemId = insertAndReadId(db);
    if (plannedItem.planned_ref) {
      plannedItemIdByRef.set(plannedItem.planned_ref, plannedItemId);
    }
    assignClassifications(
      db,
      classificationResolver,
      "planned_item",
      plannedItemId,
      "auxiliary",
      plannedItem.auxiliary_label_names ?? [],
    );
  }

  for (const actualEntry of draft.actual_entries) {
    const fundId = resolveFundId(
      fundIdByCode,
      actualEntry.fund_code,
      `actual entry ${actualEntry.fund_code}/${actualEntry.category_code}`,
    );
    const categoryId = resolveCategoryId(
      categoryIdByCode,
      actualEntry.fund_code,
      actualEntry.category_code,
      "actual entry",
    );

    let plannedItemId: number | null = actualEntry.planned_item_id;
    if (actualEntry.planned_ref) {
      plannedItemId = resolvePlannedItemId(plannedItemIdByRef, actualEntry.planned_ref);
    }

    actualEntryStmt.run({
      fund_id: fundId,
      category_id: categoryId,
      planned_item_id: plannedItemId ?? null,
      actual_date: actualEntry.actual_date,
      description: actualEntry.description,
      amount: actualEntry.amount,
      notes: actualEntry.notes,
    });
    assignClassifications(
      db,
      classificationResolver,
      "actual_entry",
      insertAndReadId(db),
      "auxiliary",
      actualEntry.auxiliary_label_names ?? [],
    );
  }
}

import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createDb } from "../db/client";
import { runMigrations } from "../db/migrate";
import { loadSeedProfile } from "./loadProfile";

export function seedDatabase({
  rootDir = process.cwd(),
  profile,
  dbPath = resolve(rootDir, "app.db"),
}: {
  rootDir?: string;
  profile: string;
  dbPath?: string;
}) {
  const data = loadSeedProfile({ rootDir, profile });
  mkdirSync(dirname(dbPath), { recursive: true });
  rmSync(dbPath, { force: true });

  const db = createDb(dbPath);
  try {
    runMigrations(db);

    const insert = db.transaction(() => {
      const fundStmt = db.prepare(`
        INSERT INTO funds (id, fund_code, name, fiscal_year, awarded_amount, notes, display_order)
        VALUES (@id, @fund_code, @name, @fiscal_year, @awarded_amount, @notes, @display_order)
      `);
      const categoryStmt = db.prepare(`
        INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order)
        VALUES (@id, @fund_id, @category_code, @name, @cross_aggregate_category, @display_order)
      `);
      const budgetStmt = db.prepare(`
        INSERT INTO budget_lines (id, fund_id, category_id, amount, notes)
        VALUES (@id, @fund_id, @category_id, @amount, @notes)
      `);
      const plannedStmt = db.prepare(`
        INSERT INTO planned_items (id, fund_id, category_id, planned_ref, planned_date, scheduled_month, description, amount, status, notes)
        VALUES (@id, @fund_id, @category_id, @planned_ref, @planned_date, @scheduled_month, @description, @amount, @status, @notes)
      `);
      const actualStmt = db.prepare(`
        INSERT INTO actual_entries (id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes)
        VALUES (@id, @fund_id, @category_id, @planned_item_id, @actual_date, @description, @amount, @notes)
      `);
      const classificationTagStmt = db.prepare(`
        INSERT INTO classification_tags (id, kind, name, color)
        VALUES (@id, @kind, @name, @color)
      `);
      const classificationAssignmentStmt = db.prepare(`
        INSERT INTO classification_assignments (tag_id, target_type, target_id)
        VALUES (@tag_id, @target_type, @target_id)
      `);

      for (const row of data.funds) {
        fundStmt.run(row);
      }
      for (const row of data.categories) {
        categoryStmt.run(row);
      }
      for (const row of data.budget_lines) budgetStmt.run(row);
      for (const row of data.planned_items) {
        plannedStmt.run(row);
      }
      for (const row of data.actual_entries) actualStmt.run(row);
      for (const row of data.classification_tags) classificationTagStmt.run(row);
      for (const row of data.classification_assignments) classificationAssignmentStmt.run(row);
    });

    insert();
  } finally {
    db.close();
  }

  return {
    profile,
    dbPath,
    counts: {
      funds: data.funds.length,
      categories: data.categories.length,
      budget_lines: data.budget_lines.length,
      planned_items: data.planned_items.length,
      actual_entries: data.actual_entries.length,
    },
  };
}

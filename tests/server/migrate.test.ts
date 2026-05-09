import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { runMigrations } from "../../server/db/migrate";

function getColumnNames(db: Database.Database, tableName: string) {
  return (
    db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
  ).map((column) => column.name);
}

describe("runMigrations", () => {
  it("adds import review columns to an existing imports table", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-migrate-"));
    const db = new Database(join(tempDir, "app.db"));

    try {
      db.exec(`
        CREATE TABLE imports (
          id INTEGER PRIMARY KEY,
          source_filename TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          warning_count INTEGER NOT NULL DEFAULT 0,
          mapping_summary TEXT NOT NULL DEFAULT '{}'
        );
      `);
      db.exec(`
        INSERT INTO imports (id, source_filename, imported_at, warning_count, mapping_summary)
        VALUES (
          1,
          'budget.xlsx',
          '2026-04-20T12:34:56.000Z',
          3,
          '{"mode":"initial","counts":{"funds":0,"categories":0,"budget_lines":0,"planned_items":0,"actual_entries":0,"warnings":0},"warning_count_by_code":{}}'
        );
      `);

      runMigrations(db);

      expect(
        db.prepare(
          "SELECT id, source_filename, imported_at, warning_count, mapping_summary, warnings_json, reconciliation_json FROM imports",
        ).get(),
      ).toEqual({
        id: 1,
        source_filename: "budget.xlsx",
        imported_at: "2026-04-20T12:34:56.000Z",
        warning_count: 3,
        mapping_summary:
          '{"mode":"initial","counts":{"funds":0,"categories":0,"budget_lines":0,"planned_items":0,"actual_entries":0,"warnings":0},"warning_count_by_code":{}}',
        warnings_json: "[]",
        reconciliation_json: "{}",
      });

      runMigrations(db);

      expect(
        db.prepare(
          "SELECT id, source_filename, imported_at, warning_count, mapping_summary, warnings_json, reconciliation_json FROM imports",
        ).get(),
      ).toEqual({
        id: 1,
        source_filename: "budget.xlsx",
        imported_at: "2026-04-20T12:34:56.000Z",
        warning_count: 3,
        mapping_summary:
          '{"mode":"initial","counts":{"funds":0,"categories":0,"budget_lines":0,"planned_items":0,"actual_entries":0,"warnings":0},"warning_count_by_code":{}}',
        warnings_json: "[]",
        reconciliation_json: "{}",
      });
    } finally {
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("adds workbook identity columns and workbook_path during migration", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-migrate-"));
    const db = new Database(join(tempDir, "app.db"));

    try {
      db.exec(`
        CREATE TABLE funds (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL,
          fiscal_year INTEGER NOT NULL,
          awarded_amount INTEGER NOT NULL,
          notes TEXT NOT NULL DEFAULT '',
          display_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE categories (
          id INTEGER PRIMARY KEY,
          fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          display_order INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE planned_items (
          id INTEGER PRIMARY KEY,
          fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
          category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          planned_date TEXT NOT NULL,
          scheduled_month TEXT NOT NULL,
          description TEXT NOT NULL,
          amount INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'planned',
          notes TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE imports (
          id INTEGER PRIMARY KEY,
          source_filename TEXT NOT NULL,
          imported_at TEXT NOT NULL,
          warning_count INTEGER NOT NULL DEFAULT 0,
          mapping_summary TEXT NOT NULL DEFAULT '{}',
          warnings_json TEXT NOT NULL DEFAULT '[]',
          reconciliation_json TEXT NOT NULL DEFAULT '{}'
        );
      `);

      runMigrations(db);

      expect(getColumnNames(db, "funds")).toContain("fund_code");
      expect(getColumnNames(db, "categories")).toContain("category_code");
      expect(getColumnNames(db, "categories")).toContain("cross_aggregate_category");
      expect(getColumnNames(db, "planned_items")).toContain("planned_ref");
      expect(getColumnNames(db, "imports")).toContain("workbook_path");
    } finally {
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

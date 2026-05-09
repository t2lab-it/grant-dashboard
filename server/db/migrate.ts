import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

function hasColumn(db: Database.Database, tableName: string, columnName: string) {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function ensureColumn(
  db: Database.Database,
  tableName: string,
  columnName: string,
  columnDefinition: string,
) {
  if (hasColumn(db, tableName, columnName)) {
    return;
  }

  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
}

export function runMigrations(db: Database.Database) {
  const schemaPaths = [
    resolve(process.cwd(), "server/db/schema.sql"),
    resolve(dirname(fileURLToPath(import.meta.url)), "schema.sql"),
  ];
  const schemaPath = schemaPaths.find((path) => {
    try {
      readFileSync(path, "utf8");
      return true;
    } catch {
      return false;
    }
  });

  if (!schemaPath) {
    throw new Error("Unable to locate server/db/schema.sql");
  }

  const schema = readFileSync(schemaPath, "utf8");
  db.exec(schema);
  ensureColumn(db, "funds", "fund_code", "TEXT");
  ensureColumn(db, "categories", "category_code", "TEXT");
  ensureColumn(db, "categories", "cross_aggregate_category", "TEXT NOT NULL");
  ensureColumn(db, "planned_items", "planned_ref", "TEXT");
  ensureColumn(db, "imports", "workbook_path", "TEXT NOT NULL DEFAULT ''");
  ensureColumn(db, "imports", "warnings_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "imports", "reconciliation_json", "TEXT NOT NULL DEFAULT '{}'");
}

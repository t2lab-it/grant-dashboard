import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

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
  const migrate = db.transaction(() => {
    db.exec(schema);
    db.exec(`
      UPDATE categories
      SET category_code = 'category-' || id
      WHERE category_code IS NULL OR length(trim(category_code)) = 0;
    `);

    const invalid = db.prepare(`
      SELECT id
      FROM categories
      WHERE category_code IS NULL
         OR length(category_code) = 0
         OR category_code <> trim(category_code)
      LIMIT 1
    `).get();
    if (invalid !== undefined) {
      throw new Error("Category codes must be non-empty and trimmed");
    }

    const duplicate = db.prepare(`
      SELECT fund_id, category_code
      FROM categories
      GROUP BY fund_id, category_code
      HAVING COUNT(*) > 1
      LIMIT 1
    `).get();
    if (duplicate !== undefined) {
      throw new Error("Category codes must be unique within a fund");
    }

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS categories_fund_category_code_unique
        ON categories (fund_id, category_code);

      CREATE TRIGGER IF NOT EXISTS categories_category_code_insert_guard
      BEFORE INSERT ON categories
      WHEN NEW.category_code IS NULL
        OR length(NEW.category_code) = 0
        OR NEW.category_code <> trim(NEW.category_code)
      BEGIN
        SELECT RAISE(ABORT, 'category_code must be non-empty and trimmed');
      END;

      CREATE TRIGGER IF NOT EXISTS categories_category_code_update_guard
      BEFORE UPDATE OF category_code ON categories
      WHEN NEW.category_code IS NULL
        OR length(NEW.category_code) = 0
        OR NEW.category_code <> trim(NEW.category_code)
      BEGIN
        SELECT RAISE(ABORT, 'category_code must be non-empty and trimmed');
      END;
    `);
  });

  migrate();
}

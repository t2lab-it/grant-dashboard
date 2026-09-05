import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

export function runMigrations(db: Database.Database) {
  const schemaPath = resolve(dirname(fileURLToPath(import.meta.url)), "schema.sql");
  const schema = readFileSync(schemaPath, "utf8");
  const applySchema = db.transaction(() => {
    db.exec(schema);
  });
  applySchema();
}

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
  db.exec(schema);
}

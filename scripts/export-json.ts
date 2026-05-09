import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createDb } from "../server/db/client";
import { runMigrations } from "../server/db/migrate";
import { buildJsonExportPayload, countJsonExportRecords } from "../server/exports/jsonSnapshot";

const args = process.argv.slice(2);

if (args.length > 0) {
  throw new Error("Usage: tsx scripts/export-json.ts");
}

const dbPath = resolve(process.env.BUDGET_DB_PATH ?? "app.db");
const outputPath = resolve("exports", "current.json");
mkdirSync(dirname(dbPath), { recursive: true });
mkdirSync(dirname(outputPath), { recursive: true });

const db = createDb(dbPath);

try {
  runMigrations(db);

  const payload = buildJsonExportPayload(db);
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify(
      {
        db_path: dbPath,
        output_path: outputPath,
        record_counts: countJsonExportRecords(payload),
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}

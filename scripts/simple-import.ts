import { basename, dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { createDb } from "../server/db/client";
import { runMigrations } from "../server/db/migrate";
import { persistWorkbookImport } from "../server/imports/persistImport";
import { dryRunSimpleWorkbookImport } from "../server/imports/simpleDryRunImport";

const args = process.argv.slice(2);
const replace = args.includes("--replace");
const workbookArg = args.find((arg) => !arg.startsWith("--"));

if (!workbookArg || args.some((arg) => arg.startsWith("--") && arg !== "--replace")) {
  throw new Error("Usage: tsx scripts/simple-import.ts <workbook-path> [--replace]");
}

const workbookPath = resolve(workbookArg);
const dbPath = resolve(process.env.BUDGET_DB_PATH ?? "app.db");
mkdirSync(dirname(dbPath), { recursive: true });

const db = createDb(dbPath);

try {
  runMigrations(db);

  const draft = dryRunSimpleWorkbookImport({ workbookPath });
  const summary = persistWorkbookImport({
    db,
    dbPath,
    draft,
    sourceFilename: basename(workbookPath),
    importedAt: new Date().toISOString(),
    replace,
  });

  console.log(
    JSON.stringify(
      {
        db_path: dbPath,
        workbook_path: workbookPath,
        import_id: summary.import_id,
        mode: summary.mode,
        counts: summary.counts,
        warning_count_by_code: summary.warning_count_by_code,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}

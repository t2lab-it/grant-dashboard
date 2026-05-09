import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { createDb } from "../server/db/client";
import { buildWorkbookRows, writeWorkbookRows } from "../server/exports/workbookRows";
import { seedDatabase } from "../server/seeds/seedDatabase";

const rootDir = resolve(".");
const tempDir = mkdtempSync(join(tmpdir(), "budget-demo-workbook-"));
const dbPath = join(tempDir, "demo.db");
const outputPath = resolve(rootDir, "seeds", "demo", "demo-budget.xlsx");

try {
  seedDatabase({ rootDir, profile: "demo", dbPath });

  const db = createDb(dbPath);
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeWorkbookRows(outputPath, buildWorkbookRows(db));
  } finally {
    db.close();
  }

  console.log(JSON.stringify({ output_path: outputPath }, null, 2));
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}

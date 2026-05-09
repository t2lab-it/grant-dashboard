import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { createDb } from "../db/client";
import {
  buildActualReconciliationSnapshot,
  buildExpectedReconciliationSnapshot,
  buildReconciliationReport,
} from "../imports/reconcileImport";
import { dryRunSimpleWorkbookImport } from "../imports/simpleDryRunImport";
import {
  buildImportHistoryPayload,
  countWarningsByCode,
} from "../imports/persist/importHistoryPayload";
import { seedDatabase } from "./seedDatabase";

const DEMO_WORKBOOK_FILENAME = "demo-budget.xlsx";
const DEMO_IMPORTED_AT = "2026-04-23T00:00:00.000Z";

export function seedDemoDatabase({
  rootDir = process.cwd(),
  dbPath = resolve(rootDir, "app.db"),
}: {
  rootDir?: string;
  dbPath?: string;
}) {
  const summary = seedDatabase({ rootDir, profile: "demo", dbPath });
  const fixturePath = resolve(rootDir, "seeds", "demo", DEMO_WORKBOOK_FILENAME);
  const uploadsDir = `${dbPath}.uploads`;
  const workbookPath = join(uploadsDir, DEMO_WORKBOOK_FILENAME);

  mkdirSync(uploadsDir, { recursive: true });
  rmSync(workbookPath, { force: true });
  copyFileSync(fixturePath, workbookPath);

  const draft = dryRunSimpleWorkbookImport({ workbookPath });
  const warningCountByCode = countWarningsByCode(draft);
  const { mappingSummary, warningsJson } = buildImportHistoryPayload(
    draft,
    "initial",
    warningCountByCode,
  );

  const db = createDb(dbPath);
  try {
    const reconciliationReport = buildReconciliationReport({
      workbookPath,
      dbPath,
      expected: buildExpectedReconciliationSnapshot(draft),
      actual: buildActualReconciliationSnapshot(db),
    });

    db.prepare(
      `
      INSERT INTO imports (
        source_filename,
        imported_at,
        warning_count,
        mapping_summary,
        warnings_json,
        reconciliation_json,
        workbook_path
      ) VALUES (
        @source_filename,
        @imported_at,
        @warning_count,
        @mapping_summary,
        @warnings_json,
        @reconciliation_json,
        @workbook_path
      )
      `,
    ).run({
      source_filename: DEMO_WORKBOOK_FILENAME,
      imported_at: DEMO_IMPORTED_AT,
      warning_count: draft.warnings.length,
      mapping_summary: mappingSummary,
      warnings_json: warningsJson,
      reconciliation_json: JSON.stringify(reconciliationReport),
      workbook_path: workbookPath,
    });
  } finally {
    db.close();
  }

  return {
    ...summary,
    workbookPath,
  };
}

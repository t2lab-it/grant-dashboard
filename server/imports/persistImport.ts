import type Database from "better-sqlite3";
import {
  buildActualReconciliationSnapshot,
  buildExpectedReconciliationSnapshot,
  buildReconciliationReport,
} from "./reconcileImport";
import { buildImportHistoryPayload, countWarningsByCode } from "./persist/importHistoryPayload";
import { clearManagedTables, getManagedRowCounts, hasManagedData } from "./persist/managedTables";
import { persistDraftRecords } from "./persist/persistDraft";
import type {
  PersistImportMode,
  PersistWorkbookImportArgs,
  PersistImportSummary,
} from "./types";

function insertAndReadId(db: Database.Database) {
  const row = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
  return Number(row.id);
}

export function persistWorkbookImport({
  db,
  dbPath,
  draft,
  sourceFilename,
  importedAt,
  replace,
}: PersistWorkbookImportArgs): PersistImportSummary {
  const mode: PersistImportMode = replace ? "replace" : "initial";
  const existingCounts = getManagedRowCounts(db);

  if (!replace && hasManagedData(existingCounts)) {
    throw new Error("Managed import tables already contain data. Re-run with --replace to overwrite.");
  }

  const warningCountByCode = countWarningsByCode(draft);
  const { mappingSummary, warningsJson } = buildImportHistoryPayload(draft, mode, warningCountByCode);
  const expectedSnapshot = buildExpectedReconciliationSnapshot(draft);

  let importId = 0;

  const persist = db.transaction(() => {
    if (replace) {
      clearManagedTables(db);
    }
    const importStmt = db.prepare(`
      INSERT INTO imports (
        source_filename,
        imported_at,
        warning_count,
        mapping_summary,
        warnings_json,
        reconciliation_json,
        workbook_path
      )
      VALUES (
        @source_filename,
        @imported_at,
        @warning_count,
        @mapping_summary,
        @warnings_json,
        @reconciliation_json,
        @workbook_path
      )
    `);
    persistDraftRecords(db, draft);

    const reconciliationReport = buildReconciliationReport({
      workbookPath: draft.workbook_path,
      dbPath,
      expected: expectedSnapshot,
      actual: buildActualReconciliationSnapshot(db),
    });

    importStmt.run({
      source_filename: sourceFilename,
      imported_at: importedAt,
      warning_count: draft.warnings.length,
      mapping_summary: mappingSummary,
      warnings_json: warningsJson,
      reconciliation_json: JSON.stringify(reconciliationReport),
      workbook_path: draft.workbook_path,
    });
    importId = insertAndReadId(db);
  });

  persist();

  return {
    import_id: importId,
    mode,
    counts: draft.counts,
    warning_count_by_code: warningCountByCode,
  };
}

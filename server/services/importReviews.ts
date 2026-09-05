import type Database from "better-sqlite3";
import type {
  ImportDetailResponse,
  ImportHistoryItem,
  ImportWarning,
  ReconciliationReport,
  StoredImportMappingSummary,
} from "../../src/contracts/imports";

type ImportHistoryRow = {
  id: number;
  source_filename: string;
  imported_at: string;
  warning_count: number;
  mapping_summary: string;
  reconciliation_json: string;
};

type ImportReviewRow = ImportHistoryRow & {
  warnings_json: string;
};

export function listImportReviews(db: Database.Database): ImportHistoryItem[] {
  const rows = db.prepare(
    `
      SELECT id, source_filename, imported_at, warning_count, mapping_summary, reconciliation_json
      FROM imports
      ORDER BY imported_at DESC, id DESC
    `,
  ).all() as ImportHistoryRow[];

  return rows.map((row) => ({
    id: row.id,
    source_filename: row.source_filename,
    imported_at: row.imported_at,
    warning_count: row.warning_count,
    mapping_summary: parseStoredImportJson<StoredImportMappingSummary>(row.mapping_summary, "mapping_summary"),
    reconciliation_ok: parseStoredImportJson<ReconciliationReport>(row.reconciliation_json, "reconciliation_json").ok,
  }));
}

export function getImportReview(db: Database.Database, importId: number): ImportDetailResponse | null {
  const row = db
    .prepare(
      `
        SELECT
          id,
          source_filename,
          imported_at,
          warning_count,
          mapping_summary,
          warnings_json,
          reconciliation_json
        FROM imports
        WHERE id = ?
      `,
    )
    .get(importId) as ImportReviewRow | undefined;

  if (row === undefined) {
    return null;
  }

  return {
    id: row.id,
    source_filename: row.source_filename,
    imported_at: row.imported_at,
    warning_count: row.warning_count,
    mapping_summary: parseStoredImportJson<StoredImportMappingSummary>(row.mapping_summary, "mapping_summary"),
    reconciliation: parseStoredImportJson<ReconciliationReport>(row.reconciliation_json, "reconciliation_json"),
    warnings: parseStoredImportJson<ImportWarning[]>(row.warnings_json, "warnings_json"),
  };
}

function parseStoredImportJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid ${label} JSON in imports table`);
  }
}

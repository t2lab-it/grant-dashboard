import { z } from "zod";
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
    reconciliation_ok: getStoredReconciliationStatus(row.reconciliation_json),
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
    reconciliation: readStoredReconciliation(row.reconciliation_json),
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

const amountsSchema = z.object({ assets: z.number().finite(), planned: z.number().finite(), actual: z.number().finite(), free_balance: z.number().finite() });
const fundIdentitySchema = z.object({ fund_code: z.string().min(1), fund_name: z.string(), fiscal_year: z.number().int() });
const mismatchSchema = z.object({ metric: z.enum(["assets", "planned", "actual", "free_balance"]), expected: z.number().finite(), actual: z.number().finite(), delta: z.number().finite() });
const reportSchema = z.object({
  format_version: z.literal(2), workbook_path: z.string(), db_path: z.string(), ok: z.boolean(),
  overall: z.object({ expected: amountsSchema, actual: amountsSchema }),
  funds: z.array(fundIdentitySchema.extend({ expected: amountsSchema, actual: amountsSchema })),
  mismatches: z.array(z.union([mismatchSchema.extend({ scope: z.literal("overall") }), mismatchSchema.merge(fundIdentitySchema).extend({ scope: z.literal("fund") })])),
});

export class UnsupportedReconciliationFormatError extends Error {
  constructor() {
    super("この照合履歴は対応外の形式のため読込不可です。元のExcelをインポートし、件数・警告と置換対象を確認してから再取込すると、新形式の履歴を作成できます。再取込は現在の登録データを置換します。");
  }
}

export function readStoredReconciliation(raw: string): ReconciliationReport {
  const parsed = parseStoredImportJson<unknown>(raw, "reconciliation_json");
  const result = reportSchema.safeParse(parsed);
  if (!result.success) throw new UnsupportedReconciliationFormatError();
  return result.data;
}

export function getStoredReconciliationStatus(raw: string): boolean | null {
  try { return readStoredReconciliation(raw).ok; }
  catch (error) { if (error instanceof UnsupportedReconciliationFormatError) return null; throw error; }
}

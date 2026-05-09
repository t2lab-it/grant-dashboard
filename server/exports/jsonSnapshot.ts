import type Database from "better-sqlite3";

export const EXPORT_TABLES = ["funds", "categories", "budget_lines", "planned_items", "actual_entries"] as const;

const EXPORT_QUERIES = {
  funds: "SELECT * FROM funds ORDER BY id",
  categories: "SELECT * FROM categories ORDER BY id",
  budget_lines: "SELECT * FROM budget_lines ORDER BY id",
  planned_items: "SELECT * FROM planned_items ORDER BY id",
  actual_entries: "SELECT * FROM actual_entries ORDER BY id",
} as const;

type ExportTable = (typeof EXPORT_TABLES)[number];
type ExportRow = Record<string, unknown>;

export type JsonExportPayload = {
  [K in ExportTable]: ExportRow[];
};

export type JsonExportRecordCounts = {
  [K in ExportTable]: number;
};

export function buildJsonExportPayload(db: Database.Database): JsonExportPayload {
  return Object.fromEntries(
    EXPORT_TABLES.map((table) => [table, db.prepare(EXPORT_QUERIES[table]).all() as ExportRow[]]),
  ) as JsonExportPayload;
}

export function countJsonExportRecords(payload: JsonExportPayload): JsonExportRecordCounts {
  return Object.fromEntries(
    EXPORT_TABLES.map((table) => [table, payload[table].length]),
  ) as JsonExportRecordCounts;
}

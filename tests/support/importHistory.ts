import type Database from "better-sqlite3";

type ImportHistoryFixtureOptions = {
  id?: number;
  sourceFilename?: string;
  importedAt?: string;
  warningCount?: number;
  mappingSummary?: unknown;
  mappingSummaryJson?: string;
  warnings?: unknown;
  warningsJson?: string;
  reconciliation?: unknown;
  reconciliationJson?: string;
};

const defaultMappingSummary = {
  mode: "initial",
  counts: {
    funds: 1,
    categories: 1,
    budget_lines: 1,
    planned_items: 1,
    actual_entries: 1,
    warnings: 1,
  },
  warning_count_by_code: { negative_planned_adjustment: 1 },
};

const defaultWarnings = [
  {
    code: "negative_planned_adjustment",
    sheet_name: "学内研究支援費",
    row_number: 7,
    message: "negative planned adjustment is treated as a warning",
  },
];

const defaultReconciliation = {
  workbook_path: "/tmp/budget2026.xlsx",
  db_path: "/tmp/app.db",
  ok: false,
  overall: {
    expected: { assets: 10, planned: 5, actual: 0, free_balance: 5 },
    actual: { assets: 11, planned: 5, actual: 0, free_balance: 6 },
  },
  funds: [],
  mismatches: [
    {
      scope: "overall",
      metric: "assets",
      expected: 10,
      actual: 11,
      delta: 1,
    },
  ],
};

function serializeJson(value: unknown, jsonOverride: string | undefined) {
  return jsonOverride ?? JSON.stringify(value);
}

export function insertImportHistoryFixture(
  db: Database.Database,
  {
    id = 1,
    sourceFilename = "budget2026.xlsx",
    importedAt = "2026-04-20T15:00:00.000Z",
    warningCount = 1,
    mappingSummary = defaultMappingSummary,
    mappingSummaryJson,
    warnings = defaultWarnings,
    warningsJson,
    reconciliation = defaultReconciliation,
    reconciliationJson,
  }: ImportHistoryFixtureOptions = {},
) {
  db.prepare(
    `
      INSERT INTO imports (
        id,
        source_filename,
        imported_at,
        warning_count,
        mapping_summary,
        warnings_json,
        reconciliation_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run([
    id,
    sourceFilename,
    importedAt,
    warningCount,
    serializeJson(mappingSummary, mappingSummaryJson),
    serializeJson(warnings, warningsJson),
    serializeJson(reconciliation, reconciliationJson),
  ]);
}

import type {
  DryRunImportResult,
  ImportWarning,
  ImportWarningCode,
  PersistImportMode,
  ReconciliationReport,
} from "../types";

export type StoredMappingSummary = {
  mode: PersistImportMode;
  counts: DryRunImportResult["counts"];
  warning_count_by_code: Partial<Record<ImportWarningCode, number>>;
};

export function resolveStoredImportReviewPayloads(
  mappingSummaryRaw: unknown,
  reconciliationRaw: unknown,
): {
  mapping_summary: StoredMappingSummary;
  reconciliation: ReconciliationReport;
} {
  return {
    mapping_summary: mappingSummaryRaw as StoredMappingSummary,
    reconciliation: reconciliationRaw as ReconciliationReport,
  };
}

export function parseStoredImportJson<T>(raw: string, label: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(`Invalid ${label} JSON in imports table`);
  }
}

export function parseStoredImportWarnings(raw: string): ImportWarning[] {
  return parseStoredImportJson<ImportWarning[]>(raw, "warnings_json");
}

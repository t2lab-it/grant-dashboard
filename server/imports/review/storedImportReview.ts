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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasModernMappingSummaryShape(raw: unknown): raw is StoredMappingSummary {
  if (!isRecord(raw)) {
    return false;
  }

  if (raw.mode !== "initial" && raw.mode !== "replace") {
    return false;
  }

  const counts = raw.counts;
  if (!isRecord(counts)) {
    return false;
  }

  return (
    typeof counts.funds === "number" &&
    typeof counts.categories === "number" &&
    typeof counts.budget_lines === "number" &&
    typeof counts.planned_items === "number" &&
    typeof counts.actual_entries === "number" &&
    typeof counts.warnings === "number" &&
    isRecord(raw.warning_count_by_code)
  );
}

function hasMetricSetShape(raw: unknown) {
  return (
    isRecord(raw) &&
    typeof raw.assets === "number" &&
    typeof raw.planned === "number" &&
    typeof raw.actual === "number" &&
    typeof raw.free_balance === "number"
  );
}

function hasReconciliationComparisonShape(raw: unknown) {
  return isRecord(raw) && hasMetricSetShape(raw.expected) && hasMetricSetShape(raw.actual);
}

function hasModernReconciliationReportShape(raw: unknown): raw is ReconciliationReport {
  return (
    isRecord(raw) &&
    typeof raw.workbook_path === "string" &&
    typeof raw.db_path === "string" &&
    typeof raw.ok === "boolean" &&
    hasReconciliationComparisonShape(raw.overall) &&
    Array.isArray(raw.funds) &&
    Array.isArray(raw.mismatches)
  );
}

export function resolveStoredImportReviewPayloads(
  mappingSummaryRaw: unknown,
  reconciliationRaw: unknown,
): {
  mapping_summary: StoredMappingSummary;
  reconciliation: ReconciliationReport;
} {
  if (hasModernMappingSummaryShape(mappingSummaryRaw)) {
    if (!hasModernReconciliationReportShape(reconciliationRaw)) {
      throw new Error("Invalid reconciliation_json JSON in imports table");
    }

    return {
      mapping_summary: mappingSummaryRaw,
      reconciliation: reconciliationRaw,
    };
  }

  throw new Error("Invalid mapping_summary JSON in imports table");
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

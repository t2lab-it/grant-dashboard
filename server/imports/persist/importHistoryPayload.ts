import type { DryRunImportResult, ImportWarningCode, PersistImportMode } from "../types";

export function countWarningsByCode(
  draft: DryRunImportResult,
): Partial<Record<ImportWarningCode, number>> {
  const counts: Partial<Record<ImportWarningCode, number>> = {};

  for (const warning of draft.warnings) {
    counts[warning.code] = (counts[warning.code] ?? 0) + 1;
  }

  return counts;
}

export function buildImportHistoryPayload(
  draft: DryRunImportResult,
  mode: PersistImportMode,
  warningCountByCode: Partial<Record<ImportWarningCode, number>>,
) {
  return {
    mappingSummary: JSON.stringify({
      mode,
      counts: draft.counts,
      warning_count_by_code: warningCountByCode,
    }),
    warningsJson: JSON.stringify(draft.warnings),
  };
}

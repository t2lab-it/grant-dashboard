import type { DryRunImportResult, PersistImportMode } from "../types";

export function countWarningsByCode(
  draft: DryRunImportResult,
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const warning of draft.warnings) {
    counts[warning.code] = (counts[warning.code] ?? 0) + 1;
  }

  return counts;
}

export function buildImportHistoryPayload(
  draft: DryRunImportResult,
  mode: PersistImportMode,
  warningCountByCode: Record<string, number>,
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

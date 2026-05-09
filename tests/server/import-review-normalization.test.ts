import { describe, expect, it } from "vitest";
import {
  parseStoredImportJson,
  resolveStoredImportReviewPayloads,
} from "../../server/imports/review/storedImportReview";

describe("stored import review normalization", () => {
  it("accepts modern payloads as-is", () => {
    const mappingSummary = {
      mode: "replace" as const,
      counts: {
        funds: 1,
        categories: 2,
        budget_lines: 3,
        planned_items: 4,
        actual_entries: 5,
        warnings: 1,
      },
      warning_count_by_code: {
        negative_planned_adjustment: 1,
      },
    };
    const reconciliation = {
      workbook_path: "/tmp/budget.xlsx",
      db_path: "/tmp/app.db",
      ok: true,
      overall: {
        expected: { assets: 10, planned: 4, actual: 3, free_balance: 3 },
        actual: { assets: 10, planned: 4, actual: 3, free_balance: 3 },
      },
      funds: [],
      mismatches: [],
    };

    expect(resolveStoredImportReviewPayloads(mappingSummary, reconciliation)).toEqual({
      mapping_summary: mappingSummary,
      reconciliation,
    });
  });

  it("rejects malformed modern payloads", () => {
    expect(() =>
      resolveStoredImportReviewPayloads(
        parseStoredImportJson(
          JSON.stringify({
            mode: "initial",
            counts: {
              funds: 0,
              categories: 0,
              budget_lines: 0,
              planned_items: 0,
              actual_entries: 0,
              warnings: 0,
            },
            warning_count_by_code: {},
          }),
          "mapping_summary",
        ),
        parseStoredImportJson("[]", "reconciliation_json"),
      ),
    ).toThrow("Invalid reconciliation_json JSON in imports table");
  });
});

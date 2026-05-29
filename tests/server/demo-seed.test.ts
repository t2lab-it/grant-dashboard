import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { buildWorkbookExportPreview } from "../../server/exports/workbookExport";
import { createEmptyWorkbookDiffSummary } from "../../server/exports/workbookDiff";
import { seedDemoDatabase } from "../../server/seeds/demoSeed";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

describe("seedDemoDatabase", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("creates a workbook-backed demo import history entry", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-demo-seed-"));
    const dbPath = join(tempDir, "demo-seed.db");
    tempDirs.push(tempDir);

    const summary = seedDemoDatabase({ rootDir, dbPath });

    expect(existsSync(summary.workbookPath)).toBe(true);

    const db = new Database(dbPath, { readonly: true });

    try {
      const importRow = db
        .prepare(
          `
          SELECT
            source_filename,
            imported_at,
            warning_count,
            mapping_summary,
            reconciliation_json,
            workbook_path
          FROM imports
          ORDER BY imported_at DESC, id DESC
          LIMIT 1
          `,
        )
        .get() as {
        source_filename: string;
        imported_at: string;
        warning_count: number;
        mapping_summary: string;
        reconciliation_json: string;
        workbook_path: string;
      };

      expect(importRow.imported_at).toBe("2026-04-23T00:00:00.000Z");
      expect(importRow.warning_count).toBe(1);
      expect(importRow.workbook_path).toBe(summary.workbookPath);
      expect(JSON.parse(importRow.mapping_summary)).toMatchObject({
        mode: "initial",
        counts: { funds: 4, warnings: 1 },
      });
      expect(JSON.parse(importRow.reconciliation_json)).toMatchObject({
        workbook_path: summary.workbookPath,
        db_path: dbPath,
        ok: true,
        mismatches: [],
        overall: {
          expected: {
            assets: 4200000,
          },
        },
      });

      const preview = buildWorkbookExportPreview(db);

      expect(preview.available).toBe(true);
      expect(preview.changes).toEqual(createEmptyWorkbookDiffSummary());
    } finally {
      db.close();
    }
  });
});

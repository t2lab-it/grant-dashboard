import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../../server/db/client";
import { runMigrations } from "../../server/db/migrate";
import { persistWorkbookImport } from "../../server/imports/persistImport";
import type { DryRunImportResult } from "../../server/imports/types";

function buildDraft({
  sourceLabel = "source.xlsx",
  fundName = "テスト資金",
  categoryName = "物品費",
  amount = 120000,
}: {
  sourceLabel?: string;
  fundName?: string;
  categoryName?: string;
  amount?: number;
} = {}): DryRunImportResult {
  return {
    workbook_path: sourceLabel,
    funds: [
      {
        fund_code: "basic-research",
        name: fundName,
        fiscal_year: 2026,
        awarded_amount: 500000,
        notes: "",
        display_order: 1,
      },
    ],
    categories: [
      {
        fund_code: "basic-research",
        category_code: "equipment",
        fund_name: fundName,
        name: categoryName,
        cross_aggregate_category: "equipment",
        display_order: 1,
      },
    ],
    budget_lines: [
      {
        fund_code: "basic-research",
        category_code: "equipment",
        fund_name: fundName,
        category_name: categoryName,
        amount: 400000,
        notes: "",
      },
    ],
    planned_items: [
      {
        fund_code: "basic-research",
        category_code: "equipment",
        planned_ref: "basic-research-equipment-20260401-001",
        fund_name: fundName,
        category_name: categoryName,
        planned_date: "2026-04-01",
        scheduled_month: "2026-04",
        description: "計算サーバ",
        amount,
        status: "planned",
        notes: "",
      },
    ],
    actual_entries: [
      {
        fund_code: "basic-research",
        category_code: "equipment",
        fund_name: fundName,
        category_name: categoryName,
        planned_item_id: null,
        actual_date: "2026-04-15",
        description: "初回支払",
        amount: Math.floor(amount / 2),
        notes: "",
      },
    ],
    warnings: [
      {
        code: "negative_planned_adjustment",
        sheet_name: fundName,
        row_number: 7,
        message: "negative planned adjustment is treated as a warning",
      },
    ],
    counts: {
      funds: 1,
      categories: 1,
      budget_lines: 1,
      planned_items: 1,
      actual_entries: 1,
      warnings: 1,
    },
  };
}

describe("persistWorkbookImport", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("persists a normalized workbook draft and records import history", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-import-persist-"));
    const dbPath = join(tempDir, "app.db");
    tempDirs.push(tempDir);
    const db = createDb(dbPath);
    runMigrations(db);

    const draft = buildDraft({ sourceLabel: "/tmp/budget2026.xlsx" });
    const summary = persistWorkbookImport({
      db,
      dbPath,
      draft,
      sourceFilename: "budget2026.xlsx",
      importedAt: "2026-04-20T12:34:56.000Z",
      replace: false,
    });

    expect(summary).toMatchObject({
      import_id: 1,
      mode: "initial",
      counts: draft.counts,
    });
    expect(db.prepare("SELECT name, fiscal_year, awarded_amount FROM funds").all()).toEqual([
      { name: "テスト資金", fiscal_year: 2026, awarded_amount: 500000 },
    ]);
    expect(db.prepare("SELECT fund_code FROM funds").get()).toEqual({ fund_code: "basic-research" });
    expect(db.prepare("SELECT name, display_order FROM categories").all()).toEqual([
      { name: "物品費", display_order: 1 },
    ]);
    expect(db.prepare("SELECT category_code FROM categories").get()).toEqual({
      category_code: "equipment",
    });
    expect(
      db.prepare(
        "SELECT planned_ref, planned_date, scheduled_month, description, amount, status FROM planned_items",
      ).all(),
    ).toEqual([
      {
        planned_ref: "basic-research-equipment-20260401-001",
        planned_date: "2026-04-01",
        scheduled_month: "2026-04",
        description: "計算サーバ",
        amount: 120000,
        status: "planned",
      },
    ]);
    expect(
      db.prepare(
        "SELECT actual_date, description, amount, planned_item_id FROM actual_entries",
      ).all(),
    ).toEqual([
      {
        actual_date: "2026-04-15",
        description: "初回支払",
        amount: 60000,
        planned_item_id: null,
      },
    ]);

    const importRow = db.prepare(
      `
        SELECT
          source_filename,
          imported_at,
          warning_count,
          mapping_summary,
          warnings_json,
          reconciliation_json,
          workbook_path
        FROM imports
      `,
    ).get() as {
      source_filename: string;
      imported_at: string;
      warning_count: number;
      mapping_summary: string;
      warnings_json: string;
      reconciliation_json: string;
      workbook_path: string;
    };
    expect(importRow.source_filename).toBe("budget2026.xlsx");
    expect(importRow.imported_at).toBe("2026-04-20T12:34:56.000Z");
    expect(importRow.warning_count).toBe(1);
    expect(JSON.parse(importRow.mapping_summary)).toMatchObject({
      mode: "initial",
      counts: draft.counts,
      warning_count_by_code: {
        negative_planned_adjustment: 1,
      },
    });
    expect(JSON.parse(importRow.warnings_json)).toEqual([
      {
        code: "negative_planned_adjustment",
        sheet_name: "テスト資金",
        row_number: 7,
        message: "negative planned adjustment is treated as a warning",
      },
    ]);
    expect(JSON.parse(importRow.reconciliation_json)).toMatchObject({
      workbook_path: draft.workbook_path,
      db_path: dbPath,
      ok: true,
      mismatches: [],
      overall: {
        expected: {
          assets: expect.any(Number),
          planned: expect.any(Number),
          actual: expect.any(Number),
          free_balance: expect.any(Number),
        },
        actual: {
          assets: expect.any(Number),
          planned: expect.any(Number),
          actual: expect.any(Number),
          free_balance: expect.any(Number),
        },
      },
    });
    expect(importRow.workbook_path).toBe("/tmp/budget2026.xlsx");

    db.close();
  });

  it("uses workbook identity fields when display names are duplicated", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-import-identity-"));
    const dbPath = join(tempDir, "app.db");
    tempDirs.push(tempDir);
    const db = createDb(dbPath);
    runMigrations(db);

    const draft: DryRunImportResult = {
      workbook_path: "/tmp/duplicate-names.xlsx",
      funds: [
        {
          fund_code: "alpha",
          name: "共通資金",
          fiscal_year: 2026,
          awarded_amount: 500000,
          notes: "",
          display_order: 1,
        },
        {
          fund_code: "beta",
          name: "共通資金",
          fiscal_year: 2026,
          awarded_amount: 700000,
          notes: "",
          display_order: 2,
        },
      ],
      categories: [
        {
          fund_code: "alpha",
          category_code: "equipment",
          fund_name: "共通資金",
          name: "共通区分",
          cross_aggregate_category: "equipment",
          display_order: 1,
        },
        {
          fund_code: "beta",
          category_code: "equipment",
          fund_name: "共通資金",
          name: "共通区分",
          cross_aggregate_category: "equipment",
          display_order: 1,
        },
      ],
      budget_lines: [
        {
          fund_code: "alpha",
          category_code: "equipment",
          fund_name: "共通資金",
          category_name: "共通区分",
          amount: 100000,
          notes: "",
        },
        {
          fund_code: "beta",
          category_code: "equipment",
          fund_name: "共通資金",
          category_name: "共通区分",
          amount: 200000,
          notes: "",
        },
      ],
      planned_items: [
        {
          fund_code: "alpha",
          category_code: "equipment",
          planned_ref: "alpha-equipment-001",
          fund_name: "共通資金",
          category_name: "共通区分",
          planned_date: "2026-04-01",
          scheduled_month: "2026-04",
          description: "A計画",
          amount: 100000,
          status: "planned",
          notes: "",
        },
        {
          fund_code: "beta",
          category_code: "equipment",
          planned_ref: "beta-equipment-001",
          fund_name: "共通資金",
          category_name: "共通区分",
          planned_date: "2026-04-02",
          scheduled_month: "2026-04",
          description: "B計画",
          amount: 200000,
          status: "planned",
          notes: "",
        },
      ],
      actual_entries: [
        {
          fund_code: "alpha",
          category_code: "equipment",
          planned_ref: "alpha-equipment-001",
          fund_name: "共通資金",
          category_name: "共通区分",
          planned_item_id: null,
          actual_date: "2026-04-10",
          description: "A実績",
          amount: 50000,
          notes: "",
        },
        {
          fund_code: "beta",
          category_code: "equipment",
          planned_ref: "beta-equipment-001",
          fund_name: "共通資金",
          category_name: "共通区分",
          planned_item_id: null,
          actual_date: "2026-04-11",
          description: "B実績",
          amount: 100000,
          notes: "",
        },
      ],
      warnings: [],
      counts: {
        funds: 2,
        categories: 2,
        budget_lines: 2,
        planned_items: 2,
        actual_entries: 2,
        warnings: 0,
      },
    };

    persistWorkbookImport({
      db,
      dbPath,
      draft,
      sourceFilename: "duplicate-names.xlsx",
      importedAt: "2026-04-20T12:34:56.000Z",
      replace: false,
    });

    expect(
      db.prepare(
        `
          SELECT
            p.planned_ref,
            f.fund_code AS fund_code,
            c.category_code AS category_code
          FROM planned_items p
          JOIN funds f ON f.id = p.fund_id
          JOIN categories c ON c.id = p.category_id
          ORDER BY p.planned_ref
        `,
      ).all(),
    ).toEqual([
      { planned_ref: "alpha-equipment-001", fund_code: "alpha", category_code: "equipment" },
      { planned_ref: "beta-equipment-001", fund_code: "beta", category_code: "equipment" },
    ]);

    const reconciliationRow = db.prepare("SELECT reconciliation_json FROM imports").get() as {
      reconciliation_json: string;
    };
    expect(JSON.parse(reconciliationRow.reconciliation_json)).toMatchObject({
      ok: true,
      funds: [
        {
          fund_code: "alpha",
          fund_name: "共通資金",
        },
        {
          fund_code: "beta",
          fund_name: "共通資金",
        },
      ],
    });

    db.close();
  });

  it("rejects repeated imports unless replace is explicitly enabled", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-import-reject-"));
    const dbPath = join(tempDir, "app.db");
    tempDirs.push(tempDir);
    const db = createDb(dbPath);
    runMigrations(db);
    const draft = buildDraft();

    persistWorkbookImport({
      db,
      dbPath,
      draft,
      sourceFilename: "first.xlsx",
      importedAt: "2026-04-20T12:00:00.000Z",
      replace: false,
    });

    expect(() =>
      persistWorkbookImport({
        db,
        dbPath,
        draft,
        sourceFilename: "second.xlsx",
        importedAt: "2026-04-20T13:00:00.000Z",
        replace: false,
      }),
    ).toThrow(/--replace/);
    expect(db.prepare("SELECT COUNT(*) AS count FROM funds").get()).toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM imports").get()).toEqual({ count: 1 });

    db.close();
  });

  it("replaces previously imported data when replace is enabled", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-import-replace-"));
    const dbPath = join(tempDir, "app.db");
    tempDirs.push(tempDir);
    const db = createDb(dbPath);
    runMigrations(db);

    persistWorkbookImport({
      db,
      dbPath,
      draft: buildDraft({ sourceLabel: "first.xlsx", fundName: "テスト資金A", categoryName: "物品費" }),
      sourceFilename: "first.xlsx",
      importedAt: "2026-04-20T12:00:00.000Z",
      replace: false,
    });

    const summary = persistWorkbookImport({
      db,
      dbPath,
      draft: buildDraft({ sourceLabel: "second.xlsx", fundName: "テスト資金B", categoryName: "旅費", amount: 80000 }),
      sourceFilename: "second.xlsx",
      importedAt: "2026-04-20T13:00:00.000Z",
      replace: true,
    });

    expect(summary).toMatchObject({
      import_id: 1,
      mode: "replace",
      counts: {
        funds: 1,
        categories: 1,
        budget_lines: 1,
        planned_items: 1,
        actual_entries: 1,
        warnings: 1,
      },
    });
    expect(db.prepare("SELECT name FROM funds").all()).toEqual([{ name: "テスト資金B" }]);
    expect(db.prepare("SELECT name FROM categories").all()).toEqual([{ name: "旅費" }]);
    expect(db.prepare("SELECT COUNT(*) AS count FROM imports").get()).toEqual({ count: 1 });
    const importRow = db.prepare(
      `
        SELECT
          source_filename,
          imported_at,
          mapping_summary
        FROM imports
      `,
    ).get() as {
      source_filename: string;
      imported_at: string;
      mapping_summary: string;
    };
    expect(importRow.source_filename).toBe("second.xlsx");
    expect(importRow.imported_at).toBe("2026-04-20T13:00:00.000Z");
    expect(JSON.parse(importRow.mapping_summary)).toMatchObject({
      mode: "replace",
      counts: summary.counts,
    });

    db.close();
  });

  it("rolls back all inserts when any mapped row cannot be persisted", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-import-rollback-"));
    const dbPath = join(tempDir, "app.db");
    tempDirs.push(tempDir);
    const db = createDb(dbPath);
    runMigrations(db);

    const invalidDraft: DryRunImportResult = {
      ...buildDraft(),
      actual_entries: [
        {
          fund_code: "basic-research",
          category_code: "missing-category",
          fund_name: "テスト資金",
          category_name: "存在しないカテゴリ",
          planned_item_id: null,
          actual_date: "2026-04-15",
          description: "失敗する支払",
          amount: 60000,
          notes: "",
        },
      ],
    };

    expect(() =>
      persistWorkbookImport({
        db,
        dbPath,
        draft: invalidDraft,
        sourceFilename: "broken.xlsx",
        importedAt: "2026-04-20T12:00:00.000Z",
        replace: false,
      }),
    ).toThrow(/category/i);
    expect(db.prepare("SELECT COUNT(*) AS count FROM funds").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM categories").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM budget_lines").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM planned_items").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM actual_entries").get()).toEqual({ count: 0 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM imports").get()).toEqual({ count: 0 });

    db.close();
  });
});

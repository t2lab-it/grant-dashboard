import type Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SimpleWorkbookSheetName } from "../../server/imports/simpleWorkbookContract";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

type WorkbookMutator = (
  workbook: import("xlsx").WorkBook,
  xlsxLib: typeof XLSX,
) => void;

export function createSimpleWorkbookFixture() {
  return createWorkbookWithMutator(() => undefined);
}

export function createImportFixtureWorkbook() {
  return createWorkbookWithMutator((workbook, xlsxLib) => {
    workbook.Sheets.funds = xlsxLib.utils.aoa_to_sheet([
      ["fund_code", "name", "fiscal_year", "awarded_amount", "notes", "project_tags", "auxiliary_labels", "display_order"],
      ["basic-research", "基盤研究費", 2026, 5080000, "", "", "", 1],
    ]);
    workbook.Sheets.categories = xlsxLib.utils.aoa_to_sheet([
      ["fund_code", "category_code", "name", "cross_aggregate_category", "display_order"],
      ["basic-research", "equipment", "物品費", "equipment", 1],
    ]);
    workbook.Sheets.budget_lines = xlsxLib.utils.aoa_to_sheet([
      ["fund_code", "category_code", "amount", "notes"],
      ["basic-research", "equipment", 20000, ""],
    ]);
    workbook.Sheets.planned_items = xlsxLib.utils.aoa_to_sheet([
      ["planned_ref", "fund_code", "category_code", "planned_date", "scheduled_month", "description", "amount", "notes", "auxiliary_labels"],
      ["basic-research-equipment-20261001-001", "basic-research", "equipment", "2026-10-01", "2026-10", "計算サーバ購入", 200000, "", ""],
    ]);
    workbook.Sheets.actual_entries = xlsxLib.utils.aoa_to_sheet([
      ["fund_code", "category_code", "actual_date", "description", "amount", "planned_ref", "notes", "auxiliary_labels"],
      ["basic-research", "equipment", "2026-10-05", "着手金", 50000, "basic-research-equipment-20261001-001", "", ""],
    ]);
  });
}

export function createWorkbookWithMutator(mutate?: WorkbookMutator) {
  const tempDir = mkdtempSync(join(tmpdir(), "simple-workbook-"));
  const workbookPath = join(tempDir, "simple-budget.xlsx");
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["fund_code", "name", "fiscal_year", "awarded_amount", "notes", "project_tags", "auxiliary_labels", "display_order"],
      ["basic-research", "基盤研究費", 2026, 5080000, "主要研究費", "", "", 1],
      ["collaborative-research", "共同研究費", 2026, 2000000, "共同研究", "", "", 2],
    ]),
    "funds",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["fund_code", "category_code", "name", "cross_aggregate_category", "display_order"],
      ["basic-research", "equipment", "物品費", "equipment", 1],
      ["basic-research", "travel", "旅費", "travel", 2],
      ["collaborative-research", "salary", "人件費", "personnel", 1],
    ]),
    "categories",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["fund_code", "category_code", "amount", "notes"],
      ["basic-research", "equipment", 1400000, "GPU関連"],
      ["basic-research", "travel", 300000, "研究会旅費"],
      ["collaborative-research", "salary", "", "年度中に確定"],
    ]),
    "budget_lines",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["planned_ref", "fund_code", "category_code", "planned_date", "scheduled_month", "description", "amount", "notes", "auxiliary_labels"],
      ["basic-research-equip-001", "basic-research", "equipment", "2026-04-15", "2026-06", "GPUサーバ", 1200000, "初期導入", ""],
      ["collaborative-research-salary-2026-05", "collaborative-research", "salary", "2026-04-20", "2026-05", "RA給与", 180000, "5月分", ""],
    ]),
    "planned_items",
  );

  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([
      ["fund_code", "category_code", "actual_date", "description", "amount", "planned_ref", "notes", "auxiliary_labels"],
      ["basic-research", "equipment", "2026-06-20", "GPUサーバ", 600000, "basic-research-equip-001", "分割支払", ""],
      ["basic-research", "travel", "2026-07-10", "研究会旅費", 150000, "", "出張旅費", ""],
    ]),
    "actual_entries",
  );

  mutate?.(workbook, XLSX);
  XLSX.writeFile(workbook, workbookPath);

  return {
    workbookPath,
    cleanup: () => rmSync(tempDir, { recursive: true, force: true }),
  };
}

export function seedWorkbookBackedImport(db: Database.Database, workbookPath: string) {
  db.exec(`
    UPDATE funds
    SET fund_code = 'basic-research'
    WHERE id = 1;

    UPDATE categories
    SET category_code = 'equipment',
        cross_aggregate_category = 'equipment'
    WHERE id = 1;

    UPDATE planned_items
    SET planned_ref = 'basic-research-equipment-20261001-001'
    WHERE id = 1;
  `);

  db.prepare(
    `
      INSERT INTO imports (
        source_filename,
        imported_at,
        warning_count,
        mapping_summary,
        warnings_json,
        reconciliation_json,
        workbook_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
  ).run([
    "budget2026.xlsx",
    "2026-04-20T15:00:00.000Z",
    0,
    JSON.stringify({
      mode: "initial",
      counts: {
        funds: 1,
        categories: 1,
        budget_lines: 1,
        planned_items: 1,
        actual_entries: 1,
        warnings: 0,
      },
      warning_count_by_code: {},
    }),
    "[]",
    JSON.stringify({
      workbook_path: workbookPath,
      db_path: "/tmp/app.db",
      ok: true,
      overall: {
        expected: { assets: 0, planned: 0, actual: 0, free_balance: 0 },
        actual: { assets: 0, planned: 0, actual: 0, free_balance: 0 },
      },
      funds: [],
      mismatches: [],
    }),
    workbookPath,
  ]);
}

export function readWorkbookSheetRows(
  workbookPath: string,
  sheetName: SimpleWorkbookSheetName,
) {
  const workbook = XLSX.readFile(workbookPath);
  return XLSX.utils.sheet_to_json<Record<string, string | number>>(workbook.Sheets[sheetName], {
    defval: "",
    raw: false,
  });
}

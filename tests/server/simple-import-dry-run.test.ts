import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { dryRunSimpleWorkbookImport } from "../../server/imports/simpleDryRunImport";
import { writeSimpleWorkbookTemplate } from "../../server/imports/simpleWorkbookTemplate";
import {
  createSimpleWorkbookFixture,
  createWorkbookWithMutator,
} from "../support/simpleWorkbook";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

describe("simple workbook import", () => {
  const tempDirs: string[] = [];
  const fixtureCleanups: Array<() => void> = [];

  afterEach(() => {
    for (const cleanup of fixtureCleanups) {
      cleanup();
    }
    fixtureCleanups.length = 0;

    for (const tempDir of tempDirs) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  it("parses a valid simple workbook into normalized draft data", () => {
    const fixture = createSimpleWorkbookFixture();
    fixtureCleanups.push(fixture.cleanup);

    const result = dryRunSimpleWorkbookImport({ workbookPath: fixture.workbookPath });

    expect(result.counts).toEqual({
      funds: 2,
      categories: 3,
      budget_lines: 3,
      planned_items: 2,
      actual_entries: 2,
      warnings: 2,
    });
    expect(result.funds.map((row) => row.name)).toEqual(["基盤研究費", "共同研究費"]);
    expect(result.funds[0]).toMatchObject({
      project_tag_names: [],
      auxiliary_label_names: [],
    });
    expect(result.categories.map((row) => row.cross_aggregate_category)).toEqual([
      "equipment",
      "travel",
      "personnel",
    ]);
    expect(
      result.budget_lines.find((row) => row.fund_name === "共同研究費" && row.category_name === "人件費"),
    ).toMatchObject({ amount: null });
    expect(
      result.planned_items.find((row) => row.description === "GPUサーバ"),
    ).toMatchObject({
      planned_date: "2026-04-15",
      scheduled_month: "2026-06",
      planned_ref: "basic-research-equip-001",
    });
    expect(
      result.actual_entries.find((row) => row.description === "GPUサーバ"),
    ).toMatchObject({
      planned_ref: "basic-research-equip-001",
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "null_budget_amount",
      "unlinked_actual_entry",
    ]);
  });

  it("rejects category sheets without a cross aggregate category column", () => {
    const fixture = createWorkbookWithMutator((workbook, xlsxLib) => {
      workbook.Sheets.categories = xlsxLib.utils.aoa_to_sheet([
        ["fund_code", "category_code", "name", "display_order"],
        ["basic-research", "equipment", "物品費", 1],
        ["basic-research", "travel", "旅費", 2],
        ["collaborative-research", "salary", "人件費", 1],
      ]);
    });
    fixtureCleanups.push(fixture.cleanup);

    expect(() =>
      dryRunSimpleWorkbookImport({ workbookPath: fixture.workbookPath }),
    ).toThrow(/Invalid header for categories: expected fund_code, category_code, name, cross_aggregate_category, display_order/);
  });

  it("rejects invalid cross aggregate category values", () => {
    const fixture = createWorkbookWithMutator((workbook, xlsxLib) => {
      workbook.Sheets.categories = xlsxLib.utils.aoa_to_sheet([
        ["fund_code", "category_code", "name", "cross_aggregate_category", "display_order"],
        ["basic-research", "equipment", "物品費", "goods", 1],
      ]);
    });
    fixtureCleanups.push(fixture.cleanup);

    expect(() =>
      dryRunSimpleWorkbookImport({ workbookPath: fixture.workbookPath }),
    ).toThrow(/Invalid cross_aggregate_category at categories:2: goods/);
  });

  it("parses semicolon-separated classification columns when present", () => {
    const fixture = createWorkbookWithMutator((workbook, xlsxLib) => {
      workbook.Sheets.funds = xlsxLib.utils.aoa_to_sheet([
        [
          "fund_code",
          "name",
          "fiscal_year",
          "awarded_amount",
          "notes",
          "project_tags",
          "auxiliary_labels",
          "display_order",
        ],
        [
          "basic-research",
          "基盤研究費",
          2026,
          5080000,
          "主要研究費",
          "乱流制御; 学生支援;乱流制御",
          "学生支援; 装置更新",
          1,
        ],
        ["collaborative-research", "共同研究費", 2026, 2000000, "共同研究", "", "", 2],
      ]);
      workbook.Sheets.planned_items = xlsxLib.utils.aoa_to_sheet([
        [
          "planned_ref",
          "fund_code",
          "category_code",
          "planned_date",
          "scheduled_month",
          "description",
          "amount",
          "notes",
          "auxiliary_labels",
        ],
        [
          "basic-research-equip-001",
          "basic-research",
          "equipment",
          "2026-04-15",
          "2026-06",
          "GPUサーバ",
          1200000,
          "初期導入",
          "装置更新",
        ],
      ]);
      workbook.Sheets.actual_entries = xlsxLib.utils.aoa_to_sheet([
        [
          "fund_code",
          "category_code",
          "actual_date",
          "description",
          "amount",
          "planned_ref",
          "notes",
          "auxiliary_labels",
        ],
        [
          "basic-research",
          "equipment",
          "2026-06-20",
          "GPUサーバ",
          600000,
          "basic-research-equip-001",
          "分割支払",
          "学生支援",
        ],
      ]);
    });
    fixtureCleanups.push(fixture.cleanup);

    const result = dryRunSimpleWorkbookImport({ workbookPath: fixture.workbookPath });

    expect(result.funds[0]).toMatchObject({
      project_tag_names: ["乱流制御", "学生支援"],
      auxiliary_label_names: ["学生支援", "装置更新"],
    });
    expect(result.planned_items[0]).toMatchObject({
      auxiliary_label_names: ["装置更新"],
    });
    expect(result.actual_entries[0]).toMatchObject({
      auxiliary_label_names: ["学生支援"],
    });
  });

  it("rejects a workbook with a missing required sheet", () => {
    const fixture = createWorkbookWithMutator((workbook) => {
      delete workbook.Sheets.actual_entries;
      workbook.SheetNames = workbook.SheetNames.filter((name) => name !== "actual_entries");
    });
    fixtureCleanups.push(fixture.cleanup);

    expect(() =>
      dryRunSimpleWorkbookImport({ workbookPath: fixture.workbookPath }),
    ).toThrow(/Missing required sheet: actual_entries/);
  });

  it("rejects duplicate planned_ref values", () => {
    const fixture = createWorkbookWithMutator((workbook, xlsxLib) => {
      workbook.Sheets.planned_items = xlsxLib.utils.aoa_to_sheet([
        ["planned_ref", "fund_code", "category_code", "planned_date", "scheduled_month", "description", "amount", "notes", "auxiliary_labels"],
        ["basic-research-equip-001", "basic-research", "equipment", "2026-04-15", "2026-06", "GPUサーバ", 1200000, "初期導入", ""],
        ["basic-research-equip-001", "basic-research", "equipment", "2026-04-20", "2026-07", "保守契約", 100000, "保守", ""],
      ]);
    });
    fixtureCleanups.push(fixture.cleanup);

    expect(() =>
      dryRunSimpleWorkbookImport({ workbookPath: fixture.workbookPath }),
    ).toThrow(/Duplicate planned_ref: basic-research-equip-001/);
  });

  it("writes a blank template workbook with the required sheets and headers", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "simple-template-"));
    const workbookPath = join(tempDir, "template.xlsx");
    tempDirs.push(tempDir);

    writeSimpleWorkbookTemplate({ workbookPath });
    const workbook = XLSX.readFile(workbookPath);

    expect(workbook.SheetNames).toEqual([
      "funds",
      "categories",
      "budget_lines",
      "planned_items",
      "actual_entries",
    ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.funds, { header: 1 })).toEqual([
      [
        "fund_code",
        "name",
        "fiscal_year",
        "awarded_amount",
        "notes",
        "project_tags",
        "auxiliary_labels",
        "display_order",
      ],
    ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.categories, { header: 1 })).toEqual([
      ["fund_code", "category_code", "name", "cross_aggregate_category", "display_order"],
    ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.budget_lines, { header: 1 })).toEqual([
      ["fund_code", "category_code", "amount", "notes"],
    ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.planned_items, { header: 1 })).toEqual([
      [
        "planned_ref",
        "fund_code",
        "category_code",
        "planned_date",
        "scheduled_month",
        "description",
        "amount",
        "notes",
        "auxiliary_labels",
      ],
    ]);
    expect(XLSX.utils.sheet_to_json(workbook.Sheets.actual_entries, { header: 1 })).toEqual([
      [
        "fund_code",
        "category_code",
        "actual_date",
        "description",
        "amount",
        "planned_ref",
        "notes",
        "auxiliary_labels",
      ],
    ]);
  });

});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "../../server/db/client";
import { runMigrations } from "../../server/db/migrate";
import { dryRunSimpleWorkbookImport } from "../../server/imports/simpleDryRunImport";
import { persistWorkbookImport } from "../../server/imports/persistImport";
import { createSimpleWorkbookFixture } from "../support/simpleWorkbook";

describe("simple workbook persistence", () => {
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

  it("persists a valid simple workbook import and links actual entries by planned_ref", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "simple-import-persist-"));
    const dbPath = join(tempDir, "app.db");
    const fixture = createSimpleWorkbookFixture();
    tempDirs.push(tempDir);
    fixtureCleanups.push(fixture.cleanup);

    const db = createDb(dbPath);
    runMigrations(db);

    const draft = dryRunSimpleWorkbookImport({ workbookPath: fixture.workbookPath });
    const summary = persistWorkbookImport({
      db,
      dbPath,
      draft,
      sourceFilename: "simple-budget.xlsx",
      importedAt: "2026-04-20T12:34:56.000Z",
      replace: false,
    });

    expect(summary).toMatchObject({
      import_id: 1,
      mode: "initial",
      counts: draft.counts,
    });
    expect(
      db.prepare(
        `
          SELECT
            ae.description,
            p.planned_ref
          FROM actual_entries ae
          LEFT JOIN planned_items p ON p.id = ae.planned_item_id
          ORDER BY ae.id
        `,
      ).all(),
    ).toEqual([
      { description: "GPUサーバ", planned_ref: "basic-research-equip-001" },
      { description: "研究会旅費", planned_ref: null },
    ]);

    db.close();
  });

  it("persists workbook classification names as tags and assignments", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "simple-import-classifications-"));
    const dbPath = join(tempDir, "app.db");
    tempDirs.push(tempDir);

    const db = createDb(dbPath);
    runMigrations(db);

    persistWorkbookImport({
      db,
      dbPath,
      draft: {
        workbook_path: "/tmp/simple-budget.xlsx",
        funds: [
          {
            fund_code: "basic-research",
            name: "基盤研究費",
            fiscal_year: 2026,
            awarded_amount: 5080000,
            notes: "主要研究費",
            project_tag_names: ["乱流制御"],
            auxiliary_label_names: ["学生支援"],
            display_order: 1,
          },
        ],
        categories: [
          {
            fund_code: "basic-research",
            category_code: "equipment",
            fund_name: "基盤研究費",
            name: "物品費",
            cross_aggregate_category: "equipment",
            display_order: 1,
          },
        ],
        budget_lines: [
          {
            fund_code: "basic-research",
            category_code: "equipment",
            fund_name: "基盤研究費",
            category_name: "物品費",
            amount: 1400000,
            notes: "",
          },
        ],
        planned_items: [
          {
            fund_code: "basic-research",
            category_code: "equipment",
            planned_ref: "basic-research-equip-001",
            fund_name: "基盤研究費",
            category_name: "物品費",
            planned_date: "2026-04-15",
            scheduled_month: "2026-06",
            description: "GPUサーバ",
            amount: 1200000,
            status: "planned",
            notes: "初期導入",
            auxiliary_label_names: ["装置更新"],
          },
        ],
        actual_entries: [
          {
            fund_code: "basic-research",
            category_code: "equipment",
            planned_ref: "basic-research-equip-001",
            fund_name: "基盤研究費",
            category_name: "物品費",
            planned_item_id: null,
            actual_date: "2026-06-20",
            description: "GPUサーバ",
            amount: 600000,
            notes: "分割支払",
            auxiliary_label_names: ["学生支援"],
          },
        ],
        warnings: [],
        counts: {
          funds: 1,
          categories: 1,
          budget_lines: 1,
          planned_items: 1,
          actual_entries: 1,
          warnings: 0,
        },
      },
      sourceFilename: "simple-budget.xlsx",
      importedAt: "2026-04-20T12:34:56.000Z",
      replace: false,
    });

    expect(
      db
        .prepare(
          `
          SELECT kind, name, color
          FROM classification_tags
          ORDER BY kind DESC, name
          `,
        )
        .all(),
    ).toEqual([
      { kind: "project", name: "乱流制御", color: "#64748b" },
      { kind: "auxiliary", name: "学生支援", color: "#64748b" },
      { kind: "auxiliary", name: "装置更新", color: "#64748b" },
    ]);
    expect(
      db
        .prepare(
          `
          SELECT t.kind, t.name, ca.target_type, ca.target_id
          FROM classification_assignments ca
          INNER JOIN classification_tags t ON t.id = ca.tag_id
          ORDER BY ca.target_type, ca.target_id, t.kind DESC, t.name
          `,
        )
        .all(),
    ).toEqual([
      { kind: "auxiliary", name: "学生支援", target_type: "actual_entry", target_id: 1 },
      { kind: "project", name: "乱流制御", target_type: "fund", target_id: 1 },
      { kind: "auxiliary", name: "学生支援", target_type: "fund", target_id: 1 },
      { kind: "auxiliary", name: "装置更新", target_type: "planned_item", target_id: 1 },
    ]);

    db.close();
  });

});

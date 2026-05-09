import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { rmSync } from "node:fs";
import Database from "better-sqlite3";
import {
  buildWorkbookExportPreview,
  saveWorkbookExport,
} from "../../server/exports/workbookExport";
import { seedTestDatabase } from "../support/seed";
import {
  createImportFixtureWorkbook,
  readWorkbookSheetRows,
  seedWorkbookBackedImport,
} from "../support/simpleWorkbook";

describe("workbook export", () => {
  const dbPath = "test-workbook-export.db";
  let db: Database.Database;

  beforeEach(() => {
    rmSync(dbPath, { force: true });
    seedTestDatabase(dbPath);
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    rmSync(dbPath, { force: true });
  });

  it("builds preview rows with updated field names", () => {
    const fixture = createImportFixtureWorkbook();

    try {
      seedWorkbookBackedImport(db, fixture.workbookPath);
      db.exec(`
        UPDATE planned_items
        SET amount = 210000,
            notes = '見積更新'
        WHERE id = 1;
      `);

      const preview = buildWorkbookExportPreview(db);

      expect(preview).toMatchObject({
        available: true,
        workbook_path: fixture.workbookPath,
        changes: {
          planned_items: {
            added: 0,
            updated: 1,
            removed: 0,
            rows: [
              {
                action: "updated",
                key: "basic-research-equipment-20261001-001",
                fields: ["amount", "notes"],
              },
            ],
          },
        },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("writes a complete workbook snapshot from the current database", () => {
    const fixture = createImportFixtureWorkbook();

    try {
      seedWorkbookBackedImport(db, fixture.workbookPath);
      db.exec(`
        INSERT INTO planned_items (
          id, fund_id, category_id, planned_ref, planned_date, scheduled_month, description, amount, status, notes
        ) VALUES (
          2, 1, 1, 'basic-research-equipment-20261015-001', '2026-10-15', '2026-11', '増設GPU', 120000, 'planned', '追加便'
        );

        INSERT INTO classification_tags (id, kind, name, color) VALUES
          (1, 'project', '乱流制御', '#2563eb'),
          (2, 'project', '学生支援', '#0f766e'),
          (3, 'auxiliary', '学生支援', '#16a34a'),
          (4, 'auxiliary', '装置更新', '#dc2626');

        INSERT INTO classification_assignments (tag_id, target_type, target_id) VALUES
          (1, 'fund', 1),
          (2, 'fund', 1),
          (3, 'fund', 1),
          (4, 'planned_item', 2),
          (3, 'actual_entry', 1);
      `);

      const result = saveWorkbookExport(db);

      expect(result).toMatchObject({
        workbook_path: fixture.workbookPath,
        available: true,
      });
      expect(result.exported_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );

      expect(readWorkbookSheetRows(fixture.workbookPath, "funds")).toEqual([
        {
          fund_code: "basic-research",
          name: "基盤研究費",
          fiscal_year: "2026",
          awarded_amount: "5080000",
          notes: "",
          project_tags: "乱流制御;学生支援",
          auxiliary_labels: "学生支援",
          display_order: "1",
        },
      ]);
      expect(readWorkbookSheetRows(fixture.workbookPath, "categories")).toEqual([
        {
          fund_code: "basic-research",
          category_code: "equipment",
          name: "物品費",
          cross_aggregate_category: "equipment",
          display_order: "1",
        },
      ]);
      expect(readWorkbookSheetRows(fixture.workbookPath, "planned_items")).toEqual([
        {
          planned_ref: "basic-research-equipment-20261001-001",
          fund_code: "basic-research",
          category_code: "equipment",
          planned_date: "2026-10-01",
          scheduled_month: "2026-10",
          description: "計算サーバ購入",
          amount: "200000",
          notes: "",
          auxiliary_labels: "",
        },
        {
          planned_ref: "basic-research-equipment-20261015-001",
          fund_code: "basic-research",
          category_code: "equipment",
          planned_date: "2026-10-15",
          scheduled_month: "2026-11",
          description: "増設GPU",
          amount: "120000",
          notes: "追加便",
          auxiliary_labels: "装置更新",
        },
      ]);
      const actualEntryRows = readWorkbookSheetRows(fixture.workbookPath, "actual_entries");
      expect(actualEntryRows).toEqual([
        {
          fund_code: "basic-research",
          category_code: "equipment",
          actual_date: "2026-10-05",
          description: "着手金",
          amount: "50000",
          planned_ref: "basic-research-equipment-20261001-001",
          notes: "",
          auxiliary_labels: "学生支援",
        },
      ]);
      expect(actualEntryRows[0]).not.toHaveProperty("project_tags");
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps workbook preview available when budget_lines contain duplicate fund/category pairs", () => {
    const fixture = createImportFixtureWorkbook();

    try {
      seedWorkbookBackedImport(db, fixture.workbookPath);
      db.exec(`
        INSERT INTO budget_lines (
          id, fund_id, category_id, amount, notes
        ) VALUES (
          2, 1, 1, 12345, '追加便'
        );
      `);

      const preview = buildWorkbookExportPreview(db);

      expect(preview).toMatchObject({
        available: true,
        workbook_path: fixture.workbookPath,
        changes: {
          budget_lines: {
            added: 1,
            updated: 0,
            removed: 0,
          },
        },
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("keeps workbook preview available when actual_entries contain duplicate display fields", () => {
    const fixture = createImportFixtureWorkbook();

    try {
      seedWorkbookBackedImport(db, fixture.workbookPath);
      db.exec(`
        INSERT INTO actual_entries (
          id, fund_id, category_id, planned_item_id, actual_date, description, amount, notes
        ) VALUES (
          2, 1, 1, NULL, '2026-10-05', '着手金', 50000, '別伝票'
        );
      `);

      const preview = buildWorkbookExportPreview(db);

      expect(preview).toMatchObject({
        available: true,
        workbook_path: fixture.workbookPath,
        changes: {
          actual_entries: {
            added: 1,
            updated: 0,
            removed: 0,
          },
        },
      });
    } finally {
      fixture.cleanup();
    }
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import * as XLSX from "xlsx";
import { buildServer } from "../../server/app";
import { seedDemoDatabase } from "../../server/seeds/demoSeed";
import { createRouteTestContext } from "./routeTestUtils";

describe("API overview and export routes", () => {
  let app: Awaited<ReturnType<typeof createRouteTestContext>>["app"];
  let cleanupContext: () => Promise<void>;
  const cleanups: Array<() => void> = [];

  beforeEach(async () => {
    cleanups.length = 0;
    const context = await createRouteTestContext("test-routes-overview-exports.db");
    app = context.app;
    cleanupContext = context.cleanup;
  });

  afterEach(async () => {
    await cleanupContext();
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it("marks overview data as tutorial eligible after seeding the demo dataset", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "budget-demo-overview-route-"));
    const dbPath = join(tempDir, "demo.db");
    seedDemoDatabase({ rootDir: resolve("."), dbPath });
    const demoApp = await buildServer({ dbPath });

    try {
      const response = await demoApp.inject({ method: "GET", url: "/api/overview" });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        tutorial: { eligibleDemoData: true },
      });
    } finally {
      await demoApp.close();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns a ledger workbook export with summary and detail sheets", async () => {
    app.db.exec(`
      UPDATE funds SET fund_code = 'basic-research' WHERE id = 1;
      UPDATE categories SET category_code = 'equipment' WHERE id = 1;
      UPDATE planned_items SET planned_ref = 'planned-1' WHERE id = 1;
      INSERT INTO categories (id, fund_id, category_code, name, cross_aggregate_category, display_order) VALUES
        (2, 1, 'misc', 'その他費', 'unset', 2);
      INSERT INTO planned_items (id, fund_id, category_id, planned_ref, planned_date, scheduled_month, description, amount, status, notes) VALUES
        (2, 1, 1, 'planned-archived', '2026-10-02', '2026-10', '非計画予定', 30000, 'cancelled', ''),
        (3, 1, 1, 'planned-cancelled', '2026-10-03', '2026-10', '取消済み予定', 40000, 'cancelled', '');
      INSERT INTO imports (source_filename, imported_at, warning_count) VALUES
        ('budget2026.xlsx', '2026-05-08T00:00:00.000Z', 2);
    `);

    const response = await app.inject({ method: "GET", url: "/api/exports/ledger.xlsx?year=2026" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers["content-disposition"]).toBe('attachment; filename="ledger-2026.xlsx"');

    const workbook = XLSX.read(response.rawPayload, { type: "buffer" });
    expect(workbook.SheetNames).toEqual([
      "概要",
      "予算別サマリ",
      "費目別サマリ",
      "月別推移",
      "計画明細",
      "実績明細",
    ]);
  });

  it("filters ledger workbook export by the requested fiscal year", async () => {
    app.db.exec(`
      INSERT INTO funds (id, fund_code, name, fiscal_year, awarded_amount, display_order) VALUES
        (2, 'next-year', '次年度基金', 2027, 100000, 2);
    `);

    const response = await app.inject({ method: "GET", url: "/api/exports/ledger.xlsx?year=2027" });
    const workbook = XLSX.read(response.rawPayload, { type: "buffer" });
    const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets["予算別サマリ"], { header: 1 });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe('attachment; filename="ledger-2027.xlsx"');
    expect(summaryRows).toEqual(expect.arrayContaining([expect.arrayContaining([2, "next-year", "次年度基金"])]));
    expect(summaryRows.flat()).not.toContain("基盤研究費");
  });

  it("scopes ledger workbook export to one fund and rejects fiscal year mismatch", async () => {
    app.db.exec(`
      UPDATE funds SET fund_code = 'basic-research' WHERE id = 1;
      INSERT INTO funds (id, fund_code, name, fiscal_year, awarded_amount, display_order) VALUES
        (2, 'same-year', '同年度基金', 2026, 100000, 2);
    `);

    const response = await app.inject({ method: "GET", url: "/api/exports/ledger.xlsx?year=2026&fundId=1" });
    const workbook = XLSX.read(response.rawPayload, { type: "buffer" });
    const summaryRows = XLSX.utils.sheet_to_json(workbook.Sheets["予算別サマリ"], { header: 1 });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-disposition"]).toBe('attachment; filename="ledger-2026-fund-1.xlsx"');
    expect(summaryRows).toEqual(expect.arrayContaining([expect.arrayContaining([1, "basic-research", "基盤研究費", 2026])]));
    expect(summaryRows.flat()).not.toContain("同年度基金");

    const mismatchResponse = await app.inject({ method: "GET", url: "/api/exports/ledger.xlsx?year=2027&fundId=1" });

    expect(mismatchResponse.statusCode).toBe(400);
    expect(mismatchResponse.json()).toEqual({ error: "Fund does not belong to the requested fiscal year" });
  });

  it("maps workbook export errors to HTTP responses on the save route", async () => {
    const response = await app.inject({ method: "POST", url: "/api/exports/workbook" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      available: false,
      message: "最新のインポート履歴がありません。",
      reason: "最新のインポート履歴がありません。",
    });
  });
});

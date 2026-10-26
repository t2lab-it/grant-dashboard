import { basename, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRouteTestContext } from "./routeTestUtils";
import { insertImportHistoryFixture } from "../support/importHistory";
import { createImportFixtureWorkbook, createSimpleWorkbookFixture } from "../support/simpleWorkbook";

const require = createRequire(import.meta.url);
const XLSX = require("xlsx") as typeof import("xlsx");

describe("API import routes", () => {
  let app: Awaited<ReturnType<typeof createRouteTestContext>>["app"];
  let cleanupContext: () => Promise<void>;
  const cleanups: Array<() => void> = [];

  beforeEach(async () => {
    cleanups.length = 0;
    const context = await createRouteTestContext("test-routes-imports.db");
    app = context.app;
    cleanupContext = context.cleanup;
  });

  afterEach(async () => {
    await cleanupContext();
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it("returns an empty import history list when no import runs exist", async () => {
    const response = await app.inject({ method: "GET", url: "/api/imports" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it("downloads a blank workbook template with the simple workbook contract", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/imports/workbook/template.xlsx",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers["content-disposition"]).toBe(
      'attachment; filename="budget-dashboard-template.xlsx"',
    );

    const workbook = XLSX.read(response.rawPayload, { type: "buffer" });
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
  });

  it("returns workbook import preview data for an uploaded xlsx file", async () => {
    const fixture = createSimpleWorkbookFixture();
    cleanups.push(fixture.cleanup);

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/workbook/preview",
      payload: readFileSync(fixture.workbookPath),
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-workbook-filename": basename(fixture.workbookPath),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      source_filename: "simple-budget.xlsx",
      replace: true,
      counts: {
        funds: 2,
        warnings: 2,
      },
      demoImport: { eligible: false },
    });
    expect(response.json().warnings).toHaveLength(2);
  });

  it("accepts an uppercase XLSX filename extension", async () => {
    const fixture = createSimpleWorkbookFixture();
    cleanups.push(fixture.cleanup);

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/workbook/preview",
      payload: readFileSync(fixture.workbookPath),
      headers: {
        "content-type": "application/octet-stream",
        "x-workbook-filename": "simple-budget.XLSX",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      source_filename: "simple-budget.XLSX",
      replace: true,
      counts: { funds: 2, warnings: 2 },
    });
  });

  it("rejects octet-stream workbook previews when the filename is not an xlsx file", async () => {
    const fixture = createSimpleWorkbookFixture();
    cleanups.push(fixture.cleanup);

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/workbook/preview",
      payload: readFileSync(fixture.workbookPath),
      headers: {
        "content-type": "application/octet-stream",
        "x-workbook-filename": "budget2026.txt",
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_workbook_file",
      message: "`.xlsx` ファイルを選択してください。",
    });
  });

  it("returns demo import metadata for the repository demo workbook preview", async () => {
    const workbookPath = resolve("seeds/demo/demo-budget.xlsx");

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/workbook/preview",
      payload: readFileSync(workbookPath),
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-workbook-filename": basename(workbookPath),
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      source_filename: "demo-budget.xlsx",
      demoImport: { eligible: true },
    });
  });

  it("imports an uploaded workbook with replace mode and stores a managed workbook copy", async () => {
    const fixture = createImportFixtureWorkbook();
    cleanups.push(fixture.cleanup);

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/workbook",
      payload: readFileSync(fixture.workbookPath),
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-workbook-filename": basename(fixture.workbookPath),
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      source_filename: "simple-budget.xlsx",
      mode: "replace",
      counts: { funds: 1, warnings: 0 },
      demoImport: { eligible: false },
    });
    expect(response.json().workbook_path).toMatch(/test-routes-imports\.db\.uploads\/.+\.xlsx$/);

    expect(
      app.db.prepare("SELECT COUNT(*) AS count FROM funds").get(),
    ).toEqual({ count: 1 });
    expect(
      app.db.prepare("SELECT COUNT(*) AS count FROM imports").get(),
    ).toEqual({ count: 1 });
    expect(
      app.db.prepare(
        "SELECT source_filename, workbook_path FROM imports ORDER BY id DESC LIMIT 1",
      ).get(),
    ).toEqual(
      expect.objectContaining({
        source_filename: "simple-budget.xlsx",
        workbook_path: expect.stringMatching(/test-routes-imports\.db\.uploads\/.+\.xlsx$/),
      }),
    );
  });

  it("returns import history summaries and detail payloads", async () => {
    insertImportHistoryFixture(app.db);

    const listResponse = await app.inject({ method: "GET", url: "/api/imports" });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json()).toMatchObject([
      expect.objectContaining({
        id: 1,
        source_filename: "budget2026.xlsx",
        warning_count: 1,
        mapping_summary: expect.objectContaining({
          mode: "initial",
        }),
        reconciliation_ok: false,
      }),
    ]);

    const detailResponse = await app.inject({ method: "GET", url: "/api/imports/1" });
    expect(detailResponse.statusCode).toBe(200);
    expect(detailResponse.json()).toMatchObject({
      id: 1,
      mapping_summary: expect.objectContaining({
        mode: "initial",
      }),
      warnings: [
        expect.objectContaining({
          code: "negative_planned_adjustment",
          row_number: 7,
        }),
      ],
      reconciliation: {
        ok: false,
        mismatches: [expect.objectContaining({ metric: "assets", delta: 1 })],
      },
    });
  });

  it("preserves real fiscal years and amounts through upload, stored history and the API", async () => {
    const payload = readFileSync(resolve("seeds/demo/demo-budget.xlsx"));
    const result = await app.inject({ method: "POST", url: "/api/imports/workbook", payload,
      headers: { "content-type": "application/octet-stream", "x-workbook-filename": "demo-budget.xlsx" } });
    expect(result.statusCode).toBe(201);
    expect(result.json()).toMatchObject({
      source_filename: "demo-budget.xlsx",
      demoImport: { eligible: true },
    });
    const id = result.json().import_id;
    const stored = JSON.parse((app.db.prepare("SELECT reconciliation_json FROM imports WHERE id = ?").get(id) as {reconciliation_json: string}).reconciliation_json);
    const detail = (await app.inject({ method: "GET", url: `/api/imports/${id}` })).json();
    expect(detail.reconciliation).toEqual(stored);
    const funds = app.db.prepare("SELECT fund_code, name, fiscal_year, awarded_amount FROM funds ORDER BY fund_code").all() as Array<{fund_code: string; name: string; fiscal_year: number; awarded_amount: number}>;
    expect(new Set(funds.map((fund) => fund.fiscal_year)).size).toBeGreaterThan(1);
    expect(new Set(funds.map((fund) => fund.name)).size).toBeLessThan(funds.length);
    for (const fund of funds) {
      expect(detail.reconciliation.funds.find((row: {fund_code: string}) => row.fund_code === fund.fund_code)).toMatchObject({ fiscal_year: fund.fiscal_year, fund_name: fund.name, expected: { assets: fund.awarded_amount }, actual: { assets: fund.awarded_amount } });
    }
    app.db.prepare("UPDATE funds SET fiscal_year = 2099, awarded_amount = 1").run();
    expect((await app.inject({method: "GET", url: `/api/imports/${id}`})).json().reconciliation).toEqual(stored);
  });

  it("reports unsupported stored reconciliation without changing it or showing an empty history", async () => {
    const raw = JSON.stringify({ ok: true, funds: [{ fund_code: "old", fund_name: "旧予算" }], mismatches: [] });
    insertImportHistoryFixture(app.db, { reconciliationJson: raw });
    const detail = await app.inject({ method: "GET", url: "/api/imports/1" });
    expect(detail.statusCode).toBe(422);
    expect(detail.json()).toMatchObject({ code: "unsupported_reconciliation_format", message: expect.stringContaining("再取込") });
    const list = await app.inject({ method: "GET", url: "/api/imports" });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject([{ id: 1, reconciliation_ok: null }]);
    const alerts = await app.inject({method: "GET", url: "/api/header-alerts?year=2026"});
    expect(alerts.json().primary).toEqual(expect.arrayContaining([expect.objectContaining({label: "履歴読込不可"})]));
    expect(app.db.prepare("SELECT reconciliation_json FROM imports WHERE id = 1").get()).toEqual({ reconciliation_json: raw });
  });

  it("keeps financial data and history navigation available when stored reconciliation JSON is corrupt", async () => {
    const raw = "{broken reconciliation";
    insertImportHistoryFixture(app.db, { reconciliationJson: raw });

    const overview = await app.inject({ method: "GET", url: "/api/overview?year=2026" });
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toMatchObject({
      selectedFiscalYear: 2026,
      latestImport: { id: 1, reconciliation_ok: null },
    });
    expect(overview.json().funds.length).toBeGreaterThan(0);

    const history = await app.inject({ method: "GET", url: "/api/imports" });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toMatchObject([{ id: 1, reconciliation_ok: null }]);

    const alerts = await app.inject({ method: "GET", url: "/api/header-alerts?year=2026" });
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json().primary).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "履歴読込不可" }),
    ]));

    const detail = await app.inject({ method: "GET", url: "/api/imports/1" });
    expect(detail.statusCode).toBe(500);
    expect(detail.json()).toMatchObject({ code: "import_history_read_failed" });
    expect(app.db.prepare("SELECT reconciliation_json FROM imports WHERE id = 1").get())
      .toEqual({ reconciliation_json: raw });
  });

  it("returns 400 for an invalid import id", async () => {
    const response = await app.inject({ method: "GET", url: "/api/imports/not-a-number" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: "invalid_import_id",
      message: "インポートIDを確認してください。",
    });
  });

  it("returns 404 for a missing import run", async () => {
    const response = await app.inject({ method: "GET", url: "/api/imports/999" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      code: "import_not_found",
      message: "対象のインポート履歴が見つかりません。",
    });
  });
});

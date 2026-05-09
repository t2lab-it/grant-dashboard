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

  it("returns workbook import preview data when the browser omits the xlsx MIME type", async () => {
    const fixture = createSimpleWorkbookFixture();
    cleanups.push(fixture.cleanup);

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/workbook/preview",
      payload: readFileSync(fixture.workbookPath),
      headers: {
        "content-type": "application/octet-stream",
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
    expect(response.json()).toEqual({ message: "`.xlsx` ファイルを選択してください。" });
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

  it("returns demo import metadata after importing the repository demo workbook", async () => {
    const workbookPath = resolve("seeds/demo/demo-budget.xlsx");

    const response = await app.inject({
      method: "POST",
      url: "/api/imports/workbook",
      payload: readFileSync(workbookPath),
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "x-workbook-filename": basename(workbookPath),
      },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      source_filename: "demo-budget.xlsx",
      demoImport: { eligible: true },
    });
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

  it.each([
    {
      id: 3,
      sourceFilename: "broken-budget.xlsx",
      importedAt: "2026-04-18T15:00:00.000Z",
      mappingSummary: "{}",
      reconciliationJson: "{}",
    },
    {
      id: 4,
      sourceFilename: "modern-broken-budget.xlsx",
      importedAt: "2026-04-17T15:00:00.000Z",
      mappingSummary: JSON.stringify({
        mode: "replace",
        counts: {
          funds: 1,
          categories: 1,
          budget_lines: 1,
          planned_items: 1,
          actual_entries: 0,
          warnings: 0,
        },
        warning_count_by_code: {},
      }),
      reconciliationJson: "[]",
    },
  ])("rejects malformed import review payloads for list and detail routes", async (fixture) => {
    insertImportHistoryFixture(app.db, {
      id: fixture.id,
      sourceFilename: fixture.sourceFilename,
      importedAt: fixture.importedAt,
      warningCount: 0,
      mappingSummaryJson: fixture.mappingSummary,
      warningsJson: "[]",
      reconciliationJson: fixture.reconciliationJson,
    });

    const listResponse = await app.inject({ method: "GET", url: "/api/imports" });
    expect(listResponse.statusCode).toBe(500);

    const detailResponse = await app.inject({ method: "GET", url: `/api/imports/${fixture.id}` });
    expect(detailResponse.statusCode).toBe(500);
  });

  it("returns 400 for an invalid import id", async () => {
    const response = await app.inject({ method: "GET", url: "/api/imports/not-a-number" });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid import id" });
  });

  it("returns 404 for a missing import run", async () => {
    const response = await app.inject({ method: "GET", url: "/api/imports/999" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Import not found" });
  });
});

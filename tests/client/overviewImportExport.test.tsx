import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildOverviewResponse, fetchMock, renderAppRoute, resetOverviewTestState } from "./overviewTestUtils";

function formatExpectedLocalDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function expectTopLayerWorkbookDialog() {
  return async (actionName: "インポート" | "エクスポート", dialogName: string) => {
    const user = userEvent.setup();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/overview") && method === "GET") {
        return {
          ok: true,
          json: async () => buildOverviewResponse(),
        };
      }

      if (actionName === "エクスポート" && url === "/api/exports/workbook/preview" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            available: true,
            workbook_path: "/tmp/budget2026.xlsx",
            source_filename: "budget2026.xlsx",
            imported_at: "2026-04-20T15:00:00.000Z",
            changes: {
              funds: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              categories: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              budget_lines: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              planned_items: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              actual_entries: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
            },
          }),
        };
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });

    renderAppRoute("/");

    await screen.findByRole("heading", { name: "予算別の状況" });
    await screen.findByRole("heading", { name: "予算総額の分析" });

    await user.click(screen.getByRole("button", { name: actionName }));

    const dialog = await screen.findByRole("dialog", { name: dialogName });
    expect(dialog.closest("header")).toBeNull();
    expect(dialog.parentElement?.closest("nav")).toBeNull();
  };
}

describe("Overview import/export", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it.each([
    ["インポート" as const, "workbook をインポート"],
    ["エクスポート" as const, "workbook をエクスポート"],
  ])("renders the %s dialog outside the header with the default analysis panel", expectTopLayerWorkbookDialog());

  it("opens the workbook import dialog, previews counts and warnings, then imports the workbook", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/overview") && method === "GET") {
        return {
          ok: true,
          json: async () => buildOverviewResponse({ funds: [] }),
        };
      }

      if (url === "/api/imports/workbook/preview" && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            source_filename: "budget2026.xlsx",
            replace: true,
            counts: {
              funds: 1,
              categories: 1,
              budget_lines: 1,
              planned_items: 1,
              actual_entries: 1,
              warnings: 1,
            },
            warnings: [
              {
                code: "negative_planned_adjustment",
                sheet_name: "planned_items",
                row_number: 7,
                message: "negative planned adjustment is treated as a warning",
              },
            ],
          }),
        };
      }

      if (url === "/api/imports/workbook" && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            source_filename: "budget2026.xlsx",
            workbook_path: "/tmp/test-routes.db.uploads/2026-04-21-budget2026.xlsx",
            import_id: 7,
            mode: "replace",
            counts: {
              funds: 1,
              categories: 1,
              budget_lines: 1,
              planned_items: 1,
              actual_entries: 1,
              warnings: 1,
            },
            warning_count_by_code: {
              negative_planned_adjustment: 1,
            },
          }),
        };
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });

    renderAppRoute("/");

    await screen.findByText("まだインポート実行なし");
    await user.click(screen.getByRole("button", { name: "インポート" }));

    const dialog = await screen.findByRole("dialog", { name: "workbook をインポート" });
    const workbookFile = new File(["dummy workbook"], "budget2026.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    await user.upload(within(dialog).getByLabelText(".xlsx ファイル"), workbookFile);
    await user.click(within(dialog).getByRole("button", { name: "プレビュー" }));

    expect(await within(dialog).findByText("budget2026.xlsx")).toBeInTheDocument();
    expect(within(dialog).getByText("資金 1 / 費目 1 / 予算行 1 / 予定 1 / 実績 1")).toBeInTheDocument();
    expect(within(dialog).getByText("警告 1件")).toBeInTheDocument();
    expect(
      within(dialog).getByText("planned_items 7行目: negative planned adjustment is treated as a warning"),
    ).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "取り込む" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "workbook をインポート" })).not.toBeInTheDocument();
    });
    expect(screen.getByText("workbook を取り込みました: budget2026.xlsx")).toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/imports/workbook/preview",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-workbook-filename": "budget2026.xlsx",
        }),
        body: workbookFile,
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/imports/workbook",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "x-workbook-filename": "budget2026.xlsx",
        }),
        body: workbookFile,
      }),
    );
  });

  it("opens the workbook export dialog, shows the preview summary, and saves", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/overview") && method === "GET") {
        return {
          ok: true,
          json: async () => buildOverviewResponse(),
        };
      }

      if (url === "/api/exports/workbook/preview" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            available: true,
            workbook_path: "/tmp/budget2026.xlsx",
            source_filename: "budget2026.xlsx",
            imported_at: "2026-04-20T15:00:00.000Z",
            changes: {
              funds: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              categories: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              budget_lines: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              planned_items: {
                added: 1,
                updated: 1,
                removed: 0,
                rows: [
                  {
                    action: "updated",
                    key: "basic-research-equipment-20261001-001",
                    label: "計算サーバ購入",
                    fields: ["amount", "notes"],
                  },
                ],
                more_count: 0,
              },
              actual_entries: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
            },
          }),
        };
      }

      if (url === "/api/exports/workbook" && method === "POST") {
        return {
          ok: true,
          json: async () => ({
            available: true,
            workbook_path: "/tmp/budget2026.xlsx",
            exported_at: "2026-04-22T08:20:00.000Z",
            source_filename: "budget2026.xlsx",
            imported_at: "2026-04-20T15:00:00.000Z",
            changes: {
              funds: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              categories: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              budget_lines: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              planned_items: { added: 1, updated: 1, removed: 0, rows: [], more_count: 0 },
              actual_entries: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
            },
          }),
        };
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });

    renderAppRoute("/");

    await screen.findByRole("link", { name: /基盤研究費/i });
    await user.click(screen.getByRole("button", { name: "エクスポート" }));

    const dialog = await screen.findByRole("dialog", { name: "workbook をエクスポート" });
    expect(within(dialog).getByText("/tmp/budget2026.xlsx")).toBeInTheDocument();
    expect(within(dialog).getByText("計画項目")).toBeInTheDocument();
    expect(within(dialog).getByText("追加 1 / 更新 1 / 削除 0")).toBeInTheDocument();
    expect(within(dialog).getByText("更新 計算サーバ購入 (金額, メモ)")).toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "上書き保存" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "workbook をエクスポート" })).not.toBeInTheDocument();
    });
    const latestImportSection = screen.getByLabelText("直近インポート");
    const rows = latestImportSection.querySelectorAll(".overview-latest-import-row");
    expect(rows).toHaveLength(2);
    expect(within(rows[1] as HTMLElement).getByText("直近エクスポート")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText("/tmp/budget2026.xlsx")).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText(formatExpectedLocalDateTime("2026-04-22T08:20:00.000Z"))).toBeInTheDocument();
  });

  it("shows the preview reason and disables save when workbook export is unavailable", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url.startsWith("/api/overview") && method === "GET") {
        return {
          ok: true,
          json: async () => buildOverviewResponse({ funds: [] }),
        };
      }

      if (url === "/api/exports/workbook/preview" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            available: false,
            workbook_path: "/tmp/budget2026.xlsx",
            source_filename: "budget2026.xlsx",
            imported_at: "2026-04-20T15:00:00.000Z",
            reason: "元の workbook ファイルが見つかりません。",
            changes: {
              funds: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              categories: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              budget_lines: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              planned_items: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
              actual_entries: { added: 0, updated: 0, removed: 0, rows: [], more_count: 0 },
            },
          }),
        };
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });

    renderAppRoute("/");

    await screen.findByText("まだインポート実行なし");
    await user.click(screen.getByRole("button", { name: "エクスポート" }));

    const dialog = await screen.findByRole("dialog", { name: "workbook をエクスポート" });
    expect(within(dialog).getByText("元の workbook ファイルが見つかりません。")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "上書き保存" })).toBeDisabled();
  });
});

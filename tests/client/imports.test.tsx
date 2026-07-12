import { cleanup, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routes } from "../../src/app/routes";
import { fetchMock, renderWithAppRouter, resetClientTestState } from "./testUtils";

function renderAppRoute(initialEntry: string) {
  return renderWithAppRouter(routes, initialEntry).router;
}

function formatExpectedLocalDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

describe("ImportHistoryPage", () => {
  beforeEach(() => {
    resetClientTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders an empty state when no imports exist", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    renderAppRoute("/imports");

    expect(await screen.findByText("インポート履歴はまだありません。")).toBeInTheDocument();
  });

  it("renders import history summaries with warning and reconciliation status", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [
        {
          id: 7,
          source_filename: "budget2026.xlsx",
          imported_at: "2026-04-20T15:00:00.000Z",
          warning_count: 2,
          reconciliation_ok: false,
          mapping_summary: {
            mode: "replace",
            counts: {
              funds: 2,
              categories: 4,
              budget_lines: 4,
              planned_items: 8,
              actual_entries: 3,
              warnings: 2,
            },
            warning_count_by_code: {
              negative_planned_adjustment: 2,
            },
          },
        },
      ],
    });

    renderAppRoute("/imports");

    expect(await screen.findByRole("heading", { name: "インポート履歴" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "budget2026.xlsx" })).toHaveAttribute(
      "href",
      "/imports/7",
    );
    expect(screen.getByText(formatExpectedLocalDateTime("2026-04-20T15:00:00.000Z"))).toBeInTheDocument();
    expect(screen.getByText("警告: 2件")).toBeInTheDocument();
    expect(screen.getByText("照合不一致")).toBeInTheDocument();
    expect(screen.getByText("予算 2件 / 予定 8件 / 実績 3件")).toBeInTheDocument();
  });

  it("renders import detail warnings and reconciliation mismatches", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 7,
        source_filename: "budget2026.xlsx",
        imported_at: "2026-04-20T15:00:00.000Z",
        warning_count: 1,
        mapping_summary: {
          mode: "replace",
          counts: {
            funds: 2,
            categories: 4,
            budget_lines: 4,
            planned_items: 8,
            actual_entries: 3,
            warnings: 1,
          },
          warning_count_by_code: {
            negative_planned_adjustment: 1,
          },
        },
        warnings: [
          {
            code: "negative_planned_adjustment",
            sheet_name: "学内研究支援費",
            row_number: 7,
            message: "negative planned adjustment is treated as a warning",
          },
        ],
        reconciliation: {
          ok: false,
          overall: {
            expected: { assets: 10, planned: 5, actual: 0, free_balance: 5 },
            actual: { assets: 11, planned: 5, actual: 0, free_balance: 6 },
          },
          funds: [
            {
              fund_name: "基盤研究費",
              expected: { assets: 4, planned: 2, actual: 0, free_balance: 2 },
              actual: { assets: 5, planned: 2, actual: 0, free_balance: 3 },
            },
          ],
          mismatches: [
            {
              scope: "overall",
              metric: "assets",
              expected: 10,
              actual: 11,
              delta: 1,
            },
          ],
        },
      }),
    });

    renderAppRoute("/imports/7");

    expect(await screen.findByRole("heading", { name: "budget2026.xlsx" })).toBeInTheDocument();
    expect(screen.getByText(formatExpectedLocalDateTime("2026-04-20T15:00:00.000Z"))).toBeInTheDocument();
    expect(screen.getByText("予算 2件")).toBeInTheDocument();
    expect(screen.getByText("警告 1件")).toBeInTheDocument();
    expect(screen.getByText("全体照合")).toBeInTheDocument();
    expect(screen.getByText("取込値 10円 / 登録値 11円")).toBeInTheDocument();
    expect(screen.getByText("予算別照合")).toBeInTheDocument();
    const fundReconciliation = screen.getByText("基盤研究費").closest(".import-detail-row");
    expect(fundReconciliation).not.toBeNull();
    expect(within(fundReconciliation as HTMLElement).getByText("交付額: 取込値 4円 / 登録値 5円")).toBeInTheDocument();
    expect(within(fundReconciliation as HTMLElement).getByText("執行予定額: 取込値 2円 / 登録値 2円")).toBeInTheDocument();
    expect(within(fundReconciliation as HTMLElement).getByText("執行済額: 取込値 0円 / 登録値 0円")).toBeInTheDocument();
    expect(within(fundReconciliation as HTMLElement).getByText("残高: 取込値 2円 / 登録値 3円")).toBeInTheDocument();
    expect(screen.getByText("学内研究支援費")).toBeInTheDocument();
    expect(screen.getByText("7行目")).toBeInTheDocument();
    expect(
      screen.getByText("negative planned adjustment is treated as a warning"),
    ).toBeInTheDocument();
    expect(screen.getByText("全体 / 交付額")).toBeInTheDocument();
    expect(screen.getByText("差額 1円")).toBeInTheDocument();
  });

  it("stays stable when the detail route changes from a valid id to an invalid id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 7,
        source_filename: "budget2026.xlsx",
        imported_at: "2026-04-20T15:00:00.000Z",
        warning_count: 0,
        mapping_summary: {
          mode: "initial",
          counts: {
            funds: 2,
            categories: 4,
            budget_lines: 4,
            planned_items: 8,
            actual_entries: 3,
            warnings: 0,
          },
        },
        warnings: [],
        reconciliation: {
          ok: true,
          overall: {
            expected: { assets: 10, planned: 5, actual: 0, free_balance: 5 },
            actual: { assets: 10, planned: 5, actual: 0, free_balance: 5 },
          },
          funds: [],
          mismatches: [],
        },
      }),
    });

    const router = renderAppRoute("/imports/7");

    expect(await screen.findByRole("heading", { name: "budget2026.xlsx" })).toBeInTheDocument();
    expect(await screen.findByText("このインポートに警告はありません。")).toBeInTheDocument();
    expect(screen.getByText("このインポートに差異はありません。")).toBeInTheDocument();
    fetchMock.mockClear();

    await router.navigate("/imports/not-a-number");

    expect(await screen.findByText("インポートIDを確認してください。")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

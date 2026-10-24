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
              fiscal_year: 2026,
              fund_code: "fund-2026",
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
    expect(screen.getByText((text) => text.startsWith(formatExpectedLocalDateTime("2026-04-20T15:00:00.000Z")) && text.includes("置換取込"))).toBeInTheDocument();
    const counts = screen.getByRole("heading", { name: "取込件数" }).closest("section")!;
    expect(within(counts).getByText("予算").parentElement).toHaveTextContent("2件");
    const overall = screen.getByRole("table", { name: "全体照合" });
    expect(within(overall).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["項目", "取込値", "登録値", "差額"]);
    expect(within(overall).getByRole("rowheader", { name: "交付額" }).closest("tr")).toHaveTextContent("10円11円1円");
    const fundTable = screen.getByRole("table", { name: "2026年度の予算別照合" });
    expect(within(fundTable).getByText("基盤研究費")).toBeInTheDocument();
    expect(within(fundTable).getByRole("rowheader", { name: "交付額" }).closest("tr")).toHaveTextContent("4円5円1円");
    expect(within(fundTable).getByRole("rowheader", { name: "残高" }).closest("tr")).toHaveTextContent("2円3円1円");
    expect(screen.getByText(/学内研究支援費.*7行目/)).toBeInTheDocument();
    expect(screen.getByText("negative_planned_adjustment")).toBeInTheDocument();
    expect(screen.getByText("negative planned adjustment is treated as a warning")).toBeInTheDocument();
    expect(screen.getByText(/照合差異 1件/)).toBeInTheDocument();
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

it("shows an unsupported history's recovery instructions and lets it be retried without importing", async () => {
  resetClientTestState();
  fetchMock.mockResolvedValue({ ok: false, status: 422, json: async () => ({code: "unsupported_reconciliation_format", message: "対応外形式のため読込不可です。元のExcelを確認して再取込してください。再取込は現在の登録データを置換します。"}) });
  const view = renderWithAppRouter(routes, "/imports/7");
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("読込不可");
  expect(alert).toHaveTextContent("現在の登録データを置換");
  const { default: userEvent } = await import("@testing-library/user-event");
  await userEvent.click(within(alert).getByRole("button", {name: "再試行"}));
  expect(fetchMock.mock.calls.filter(([url]) => String(url) === "/api/imports/7").length).toBe(2);
  expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  view.unmount();
});

it("keeps an unknown warning's sheet, row, code and original message available", async () => {
  const { render } = await import("@testing-library/react");
  const { default: userEvent } = await import("@testing-library/user-event");
  const { ImportWarningList } = await import("../../src/features/imports/ImportWarningList");
  const view = render(<ImportWarningList warnings={[{code: "future_diagnostic", sheet_name: "actual_entries", row_number: 42, message: "未知の診断内容"}]} />);
  await userEvent.click(screen.getByText("診断の詳細"));
  const details = view.container.querySelector("details")!;
  expect(within(details).getByText("future_diagnostic")).toBeVisible();
  expect(within(details).getByText("未知の診断内容")).toBeVisible();
  expect(screen.getByText(/actual_entries.*42行目/)).toBeVisible();
  view.unmount();
});

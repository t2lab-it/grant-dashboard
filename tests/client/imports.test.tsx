import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routes } from "../../src/app/routes";
import { fetchMock, renderWithAppRouter, resetClientTestState } from "./testUtils";

function renderAppRoute(initialEntry: string) {
  return renderWithAppRouter(routes, initialEntry).router;
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

    expect(await screen.findByText("No import runs yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "インポート履歴" })).not.toBeInTheDocument();
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

    expect(await screen.findByRole("heading", { name: "Import History" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "budget2026.xlsx" })).toHaveAttribute(
      "href",
      "/imports/7",
    );
    expect(screen.getByText("Warnings: 2")).toBeInTheDocument();
    expect(screen.getByText("Reconciliation mismatch")).toBeInTheDocument();
    expect(screen.getByText("Funds 2 / Planned 8 / Actual 3")).toBeInTheDocument();
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
    expect(screen.getByText("Funds 2")).toBeInTheDocument();
    expect(screen.getByText("Warnings 1")).toBeInTheDocument();
    expect(screen.getByText("Overall Summary")).toBeInTheDocument();
    expect(screen.getByText("Expected assets 10 / Actual assets 11")).toBeInTheDocument();
    expect(screen.getByText("Fund Summary")).toBeInTheDocument();
    expect(screen.getByText("基盤研究費")).toBeInTheDocument();
    expect(screen.getByText("Expected free balance 2 / Actual free balance 3")).toBeInTheDocument();
    expect(screen.getByText("学内研究支援費")).toBeInTheDocument();
    expect(screen.getByText("row 7")).toBeInTheDocument();
    expect(
      screen.getByText("negative planned adjustment is treated as a warning"),
    ).toBeInTheDocument();
    expect(screen.getByText("overall / assets")).toBeInTheDocument();
    expect(screen.getByText("delta 1")).toBeInTheDocument();
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
    expect(await screen.findByText("No warnings recorded for this import.")).toBeInTheDocument();
    expect(screen.getByText("No mismatches recorded for this import.")).toBeInTheDocument();
    fetchMock.mockClear();

    await router.navigate("/imports/not-a-number");

    expect(await screen.findByText("Import id is invalid.")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

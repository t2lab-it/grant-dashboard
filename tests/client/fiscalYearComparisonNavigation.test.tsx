import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { listFiscalYearMonths } from "../../src/lib/calendar";
import {
  buildOverviewResponse,
  fetchMock,
  renderAppRoute,
  resetOverviewTestState,
} from "./overviewTestUtils";

function comparisonResponse() {
  return {
    currentFiscalYear: 2026,
    fiscalYears: [
      {
        fiscalYear: 2026,
        state: "current",
        totals: { assets: 1000000, committed: 200000, actual: 300000 },
        crossAggregateCategories: [
          { crossAggregateCategory: "equipment", plannedAmount: 200000, actualAmount: 300000 },
          { crossAggregateCategory: "travel", plannedAmount: 0, actualAmount: 0 },
          { crossAggregateCategory: "personnel", plannedAmount: 0, actualAmount: 0 },
          { crossAggregateCategory: "other", plannedAmount: 0, actualAmount: 0 },
          { crossAggregateCategory: "unset", plannedAmount: 0, actualAmount: 0 },
        ],
        monthlyStatus: listFiscalYearMonths(2026).map((month) => ({ month, committed: 0, actual: 0 })),
      },
    ],
  };
}

function mockShellApi() {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : input.url;
    if (url.startsWith("/api/overview")) {
      const year = new URL(url, "http://localhost").searchParams.get("year");
      return {
        ok: true,
        status: 200,
        json: async () => buildOverviewResponse({
          availableFiscalYears: [2025, 2026],
          selectedFiscalYear: year === "2025" ? 2025 : 2026,
          funds: [],
        }),
      };
    }
    if (url === "/api/fiscal-year-comparison") {
      return { ok: true, status: 200, json: async () => comparisonResponse() };
    }
    if (url.startsWith("/api/header-alerts")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ availableFiscalYears: [2025, 2026], selectedFiscalYear: 2026, primary: [], supporting: [] }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("fiscal year comparison navigation", () => {
  beforeEach(() => {
    resetOverviewTestState();
    mockShellApi();
  });

  afterEach(() => {
    cleanup();
  });

  test("links the selected annual overview to the comparison page", async () => {
    renderAppRoute("/?year=2026");

    const comparisonLink = await screen.findByRole("link", { name: "年度比較" });
    await waitFor(() => {
      expect(comparisonLink).toHaveAttribute(
        "href",
        "/fiscal-years?year=2026",
      );
    });
  });

  test("marks comparison current, hides HeaderAlerts, and keeps global navigation", async () => {
    renderAppRoute("/fiscal-years?year=2026");

    expect(await screen.findByRole("heading", { name: "年度横断サマリー" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "年度比較" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "検索" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "予定作成" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "実績作成" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "設定" })).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/fiscal-year-comparison", {});
    });
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith("/api/header-alerts"))).toBe(false);
  });

  test("opens the selected annual overview when the selector changes on comparison", async () => {
    const user = userEvent.setup();
    const { router } = renderAppRoute("/fiscal-years?year=2026");
    const selector = await screen.findByRole("combobox", { name: "年度" });

    await user.selectOptions(selector, "2025");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
      expect(router.state.location.search).toBe("?year=2025");
    });
  });

  test("opens an annual overview when a budget row is clicked", async () => {
    const user = userEvent.setup();
    const { router } = renderAppRoute("/fiscal-years?year=2026");

    await user.click((await screen.findAllByRole("link", {
      name: "2026年度の年度ページを開く",
    }))[0]);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
      expect(router.state.location.search).toBe("?year=2026");
    });
  });

  test("opens an annual overview from a focused donut with Enter", async () => {
    const user = userEvent.setup();
    const { router } = renderAppRoute("/fiscal-years?year=2026");
    const donutLink = (await screen.findAllByRole("link", {
      name: "2026年度の年度ページを開く",
    }))[1];

    donutLink.focus();
    expect(donutLink).toHaveFocus();
    await user.keyboard("{Enter}");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
      expect(router.state.location.search).toBe("?year=2026");
    });
  });
});

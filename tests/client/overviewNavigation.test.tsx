import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildOverviewFund, buildOverviewResponse, fetchMock, mockOverviewResponse, renderAppRoute, resetOverviewTestState } from "./overviewTestUtils";

describe("Overview navigation", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("keeps the selected metric across fiscal years and uses the newly scoped category data", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url) => {
      const path = String(url);
      if (path !== "/api/overview?year=2026" && path !== "/api/overview?year=2027") {
        throw new Error(`Unexpected request: ${path}`);
      }
      const next = path === "/api/overview?year=2027";
      return { ok: true, json: async () => buildOverviewResponse({
        availableFiscalYears: [2026, 2027], selectedFiscalYear: next ? 2027 : 2026,
        funds: [buildOverviewFund({ name: next ? "翌年" : "今年", actual_amount: next ? 20 : 10, committed_amount: 0,
          crossAggregateCategories: [{ crossAggregateCategory: next ? "travel" : "equipment", budgetAmount: null,
            actualAmount: next ? 20 : 10, plannedAmount: 0 }] })],
      }) };
    });
    const view = renderAppRoute("/?year=2026");
    await user.click(await screen.findByRole("button", { name: /^消化額 / }));
    expect(screen.getByRole("img", { name: "今年 の消化額の大費目別内訳グラフ" })).toHaveTextContent("10円");
    await user.selectOptions(screen.getByRole("combobox", { name: "年度" }), "2027");
    expect(await screen.findByRole("img", { name: "翌年 の消化額の大費目別内訳グラフ" })).toHaveTextContent("20円");
    const nextFund = within(screen.getByRole("link", { name: /翌年/ }));
    expect(nextFund.getByText("旅費系")).toBeInTheDocument();
    expect(nextFund.getByRole("listitem")).toHaveTextContent("20円");
    expect(nextFund.queryByText("物品系")).not.toBeInTheDocument();
    expect(nextFund.queryByText("10円")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^消化額 / })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("img", { name: /今年 の/ })).not.toBeInTheDocument();
    expect(view.router.state.location.search).toBe("?year=2027");
  });

  it("opens planned item creation from the global nav as a modal while keeping the overview page visible", async () => {
    const user = userEvent.setup();

    mockOverviewResponse({ funds: [] });

    const view = renderAppRoute("/");
    const appScope = within(view.container);

    expect(await screen.findByRole("heading", { name: "予算" })).toBeInTheDocument();
    await waitFor(() => {
      expect(appScope.getByRole("link", { name: "研究予算ダッシュボード" })).toHaveAttribute("href", "/?year=2026");
      expect(appScope.getByRole("link", { name: "実績を追加" })).toHaveAttribute("href", "/actual-entries/new?year=2026");
      expect(appScope.getByRole("link", { name: "設定" })).toHaveAttribute("href", "/settings?year=2026");
    });
    expect(within(appScope.getByRole("navigation", { name: "メインナビゲーション" })).getByRole("button", { name: "インポート" })).toBeInTheDocument();
    expect(appScope.getByRole("button", { name: "エクスポート" })).toBeInTheDocument();
    await user.click(appScope.getByRole("link", { name: "予定を追加" }));

    const dialog = await screen.findByRole("dialog", { name: "予定を追加" });
    expect(await within(dialog).findByRole("button", { name: "閉じる" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "予算" })).toBeInTheDocument();
  });
});

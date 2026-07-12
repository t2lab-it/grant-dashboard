import { cleanup, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildOverviewResponse,
  fetchMock,
  renderAppRoute,
  resetOverviewTestState,
} from "./overviewTestUtils";

const searchResponse = {
  availableFiscalYears: [2026],
  selectedFiscalYear: 2026,
  filters: {
    funds: [
      { id: 1, name: "基盤研究費" },
      { id: 2, name: "ACT-X" },
    ],
    categories: [
      { id: 1, fundId: 1, name: "物品費" },
      { id: 2, fundId: 1, name: "旅費" },
    ],
    auxiliaryLabels: [
      { id: 10, kind: "auxiliary", name: "学生支援", color: "#16a34a" },
      { id: 11, kind: "auxiliary", name: "装置更新", color: "#2563eb" },
    ],
  },
  counts: {
    all: 2,
    overdue: 1,
    unsettled: 1,
    unlinked: 1,
  },
  resultLimit: 200,
  totalResultCount: 2,
  results: [
    {
      id: 1,
      type: "planned",
      fundId: 1,
      fundName: "基盤研究費",
      categoryId: 1,
      categoryName: "物品費",
      date: "2026-04-01",
      month: "2026-04",
      description: "GPU サーバ購入",
      notes: "年度初め",
      amount: 200000,
      remainingAmount: 120000,
      statusLabel: "未精算 120,000円",
      detailHref: "/funds/1?year=2026&focus=planned-1",
      auxiliaryLabels: [{ id: 10, kind: "auxiliary", name: "学生支援", color: "#16a34a", inherited: true }],
    },
    {
      id: 2,
      type: "actual",
      fundId: 1,
      fundName: "基盤研究費",
      categoryId: 2,
      categoryName: "旅費",
      date: "2026-07-02",
      month: "2026-07",
      description: "学会参加費",
      notes: "未連携の実績",
      amount: 90000,
      remainingAmount: null,
      statusLabel: "未連携",
      detailHref: "/funds/1?year=2026&focus=actual-2",
      auxiliaryLabels: [],
    },
  ],
};

function mockAppShellAndSearch() {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : input.url;

    if (url.startsWith("/api/overview")) {
      return {
        ok: true,
        json: async () => buildOverviewResponse(),
      };
    }

    if (url.startsWith("/api/search")) {
      return {
        ok: true,
        json: async () => searchResponse,
      };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("SearchPage", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("fetches and renders mixed planned and actual search results", async () => {
    mockAppShellAndSearch();

    const view = renderAppRoute("/search?year=2026");
    const app = within(view.container);

    expect(await app.findByRole("heading", { name: "検索" })).toBeInTheDocument();
    expect(await app.findByText("GPU サーバ購入")).toBeInTheDocument();
    expect(app.getByText("学会参加費")).toBeInTheDocument();
    expect(app.getAllByText("予定").length).toBeGreaterThan(0);
    expect(app.getAllByText("実績").length).toBeGreaterThan(0);
    expect(app.getByRole("link", { name: /GPU サーバ購入/ })).toHaveAttribute(
      "href",
      "/funds/1?year=2026&focus=planned-1",
    );
    expect(app.getByRole("link", { name: "期限超過予定 1" })).toHaveAttribute(
      "href",
      "/search?year=2026&tab=overdue",
    );

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/search?year=2026", {});
    });
  });

  it("keeps filters in the URL and refetches with the selected values", async () => {
    const user = userEvent.setup();
    mockAppShellAndSearch();

    const view = renderAppRoute("/search?year=2026");
    const app = within(view.container);

    await app.findByRole("heading", { name: "検索" });
    await user.type(app.getByLabelText("キーワード"), "GPU");
    await user.selectOptions(app.getByLabelText("予算"), "1");
    await user.selectOptions(app.getByLabelText("費目"), "2");
    await user.selectOptions(app.getByLabelText("補助ラベル"), "10");
    await user.selectOptions(app.getByLabelText("種別"), "actual");
    await user.type(app.getByLabelText("開始月"), "2026-04");
    await user.type(app.getByLabelText("終了月"), "2026-09");

    await waitFor(() => {
      expect(view.router.state.location.search).toContain("keyword=GPU");
      expect(view.router.state.location.search).toContain("fundId=1");
      expect(view.router.state.location.search).toContain("categoryId=2");
      expect(view.router.state.location.search).toContain("auxiliaryLabelId=10");
      expect(view.router.state.location.search).toContain("entryType=actual");
      expect(view.router.state.location.search).toContain("monthFrom=2026-04");
      expect(view.router.state.location.search).toContain("monthTo=2026-09");
    });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/search?year=2026&keyword=GPU&fundId=1&categoryId=2&auxiliaryLabelId=10&entryType=actual&monthFrom=2026-04&monthTo=2026-09",
        {},
      );
    });
  });
});

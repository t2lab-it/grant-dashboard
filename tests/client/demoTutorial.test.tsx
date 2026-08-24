import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildOverviewResponse,
  fetchMock,
  renderAppRoute,
  resetOverviewTestState,
} from "./overviewTestUtils";

function buildFundDetailResponse() {
  return {
    fund: {
      id: 1,
      name: "デモ研究費A",
      fiscalYear: 2026,
      awarded_amount: 2400000,
      notes: "",
    },
    categories: [
      {
        id: 1,
        categoryName: "物品費",
        budgetAmount: 1200000,
        plannedAmount: 700000,
        actualAmount: 300000,
      },
    ],
    monthlyStatus: [],
    actualEntries: [
      {
        id: 1,
        actualDate: "2026-04-20",
        categoryName: "物品費",
        description: "GPUサーバ着手金",
        amount: 300000,
        notes: "",
      },
    ],
    plannedItems: [
      {
        id: 1,
        scheduledMonth: "2026-05",
        categoryName: "物品費",
        description: "GPUサーバ更新",
        amount: 700000,
        notes: "",
      },
    ],
    plannedItemHistory: [],
    crossAggregateCategories: [],
  };
}

function mockDemoOverviewAndFundDetail() {
  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";

    if (url.startsWith("/api/overview") && method === "GET") {
      return {
        ok: true,
        json: async () =>
          buildOverviewResponse({
            tutorial: { eligibleDemoData: true },
            funds: [
              {
                id: 1,
                name: "デモ研究費A",
                awarded_amount: 2400000,
                committed_amount: 700000,
                actual_amount: 300000,
                freeBalance: 1400000,
                projectTags: [],
              },
            ],
          }),
      };
    }

    if (url === "/api/funds/1" && method === "GET") {
      return {
        ok: true,
        json: async () => buildFundDetailResponse(),
      };
    }

    throw new Error(`Unhandled request: ${method} ${url}`);
  });
}

describe("Demo tutorial", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("prompts for eligible demo data again after a no dismissal in this browser", async () => {
    const user = userEvent.setup();
    mockDemoOverviewAndFundDetail();

    const view = renderAppRoute("/");

    const prompt = await screen.findByRole("dialog", { name: "チュートリアルを始めますか？" });
    await user.click(within(prompt).getByRole("button", { name: "今回は始めない" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "チュートリアルを始めますか？" })).not.toBeInTheDocument();
    });

    view.unmount();
    renderAppRoute("/");

    expect(await screen.findByRole("dialog", { name: "チュートリアルを始めますか？" })).toBeInTheDocument();
  });

  it("uses back, complete, and advanced actions on the final workbook preview step", async () => {
    const user = userEvent.setup();
    mockDemoOverviewAndFundDetail();

    renderAppRoute("/");

    const prompt = await screen.findByRole("dialog", { name: "チュートリアルを始めますか？" });
    await user.click(within(prompt).getByRole("button", { name: "チュートリアルを始める" }));

    for (let index = 0; index < 4; index += 1) {
      await user.click(screen.getByRole("button", { name: "次へ" }));
    }

    const tutorial = await screen.findByRole("dialog", { name: "チュートリアル" });
    expect(within(tutorial).getByText("workbook 差分を確認する")).toBeInTheDocument();
    expect(within(tutorial).getByRole("button", { name: "戻る" })).toBeInTheDocument();
    expect(within(tutorial).getByRole("button", { name: "完了" })).toBeInTheDocument();
    expect(within(tutorial).getByRole("button", { name: "発展" })).toBeInTheDocument();
  });

  it("continues from the advanced action into creation and budget edit guidance", async () => {
    const user = userEvent.setup();
    mockDemoOverviewAndFundDetail();

    const view = renderAppRoute("/");

    const prompt = await screen.findByRole("dialog", { name: "チュートリアルを始めますか？" });
    await user.click(within(prompt).getByRole("button", { name: "チュートリアルを始める" }));

    for (let index = 0; index < 4; index += 1) {
      await user.click(screen.getByRole("button", { name: "次へ" }));
    }

    await user.click(screen.getByRole("button", { name: "発展" }));

    await waitFor(() => {
      expect(view.router.state.location.pathname).toBe("/planned-items/new");
    });
    expect(view.router.state.location.search).toBe("?fundId=1&year=2026");
    const plannedTutorial = await screen.findByRole("dialog", { name: "チュートリアル" });
    expect(within(plannedTutorial).getByText("予定を作成する")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "予定作成" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("tour-target-planned-item-form")).toHaveAttribute(
        "data-tour-active",
        "true",
      );
    });

    await user.click(within(plannedTutorial).getByRole("button", { name: "次へ" }));

    await waitFor(() => {
      expect(view.router.state.location.pathname).toBe("/actual-entries/new");
    });
    expect(view.router.state.location.search).toBe("?fundId=1&year=2026");
    const actualTutorial = await screen.findByRole("dialog", { name: "チュートリアル" });
    expect(within(actualTutorial).getByText("実績を作成する")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "実績作成" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("tour-target-actual-entry-form")).toHaveAttribute(
        "data-tour-active",
        "true",
      );
    });

    await user.click(within(actualTutorial).getByRole("button", { name: "次へ" }));

    await waitFor(() => {
      expect(view.router.state.location.pathname).toBe("/funds/1");
    });
    const editTutorial = await screen.findByRole("dialog", { name: "チュートリアル" });
    expect(within(editTutorial).getByText("予算を編集する")).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "予算を編集" })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId("tour-target-fund-edit-form")).toHaveAttribute(
        "data-tour-active",
        "true",
      );
    });
  });
});

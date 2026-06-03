import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routes } from "../../src/app/routes";
import { fetchMock, renderWithAppRouter, resetClientTestState, stubMatchMedia } from "./testUtils";

stubMatchMedia();

function renderAppRoute(initialEntry: string) {
  return renderWithAppRouter(routes, initialEntry);
}

beforeEach(() => {
  resetClientTestState();
});

afterEach(() => {
  cleanup();
});

describe("NewFundForm", () => {
  async function fillRequiredFields() {
    fireEvent.change(await screen.findByLabelText("予算名"), { target: { value: "次年度予算" } });
    fireEvent.change(screen.getByLabelText("年度"), { target: { value: "2027" } });
    fireEvent.change(screen.getByLabelText("交付額"), { target: { value: "1800000" } });
    fireEvent.change(screen.getByLabelText("費目名"), { target: { value: "出張" } });
    fireEvent.change(screen.getByLabelText("予算額"), { target: { value: "700000" } });
  }

  it("lets the user add and remove category rows before saving", async () => {
    const user = userEvent.setup();

    renderAppRoute("/funds/new");

    expect(screen.queryByRole("link", { name: "新規予算" })).not.toBeInTheDocument();
    expect(await screen.findAllByLabelText("費目名")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "費目を追加" }));
    expect(screen.getAllByLabelText("費目名")).toHaveLength(2);
    await user.click(screen.getAllByRole("button", { name: "削除" })[1]);
    expect(screen.getAllByLabelText("費目名")).toHaveLength(1);
  });

  it("updates the cross-aggregate budget chart while editing category rows", async () => {
    const user = userEvent.setup();

    renderAppRoute("/funds/new");

    await fillRequiredFields();
    fireEvent.change(screen.getByLabelText("横断集計カテゴリ"), { target: { value: "travel" } });

    const chart = screen.getByRole("region", { name: "横断カテゴリ別の予算配分" });
    expect(screen.queryByRole("region", { name: "費目予算の合計確認" })).not.toBeInTheDocument();
    expect(chart).toHaveTextContent("旅費系");
    expect(chart).toHaveTextContent("700,000円");
    expect(chart).toHaveTextContent("38.9%");
    expect(chart).toHaveTextContent("差額");
    expect(chart).toHaveTextContent("1,100,000円");
    expect(chart).toHaveTextContent("61.1%");

    await user.click(screen.getByRole("button", { name: "費目を追加" }));
    fireEvent.change(screen.getAllByLabelText("費目名")[1], { target: { value: "物品" } });
    fireEvent.change(screen.getAllByLabelText("予算額")[1], { target: { value: "300000" } });
    fireEvent.change(screen.getAllByLabelText("横断集計カテゴリ")[1], { target: { value: "equipment" } });

    expect(chart).toHaveTextContent("物品系");
    expect(chart).toHaveTextContent("300,000円");
    expect(chart).toHaveTextContent("16.7%");
    expect(chart).toHaveTextContent("38.9%");
    expect(chart).toHaveTextContent("800,000円");
    expect(chart).toHaveTextContent("44.4%");

    await user.click(screen.getAllByRole("button", { name: "削除" })[1]);

    expect(chart).not.toHaveTextContent("物品系");
    expect(chart).toHaveTextContent("旅費系");
    expect(chart).toHaveTextContent("38.9%");
    expect(chart).toHaveTextContent("1,100,000円");
    expect(chart).toHaveTextContent("61.1%");
  });

  it("shows a close button and returns to overview when clicked", async () => {
    const user = userEvent.setup();

    const view = renderAppRoute("/funds/new");

    await user.click(await screen.findByRole("button", { name: "閉じる" }));

    await waitFor(() => {
      expect(view.router.state.location.pathname).toBe("/");
    });
  });

  it("submits the new fund payload and redirects to the created fund detail page", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/funds" && method === "POST") {
        return {
          ok: true,
          json: async () => ({ fundId: 9 }),
        };
      }

      if (url === "/api/classifications" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            projectTags: [{ id: 1, kind: "project", name: "CREST 量子", color: "#2563eb" }],
            auxiliaryLabels: [{ id: 2, kind: "auxiliary", name: "学生支援", color: "#16a34a" }],
          }),
        };
      }

      if (url === "/api/funds/9" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            fund: {
              id: 9,
              name: "次年度予算",
              awarded_amount: 1800000,
            },
            categories: [],
            monthlyStatus: [],
            actualEntries: [],
            plannedItems: [],
          }),
        };
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/new");

    await fillRequiredFields();
    fireEvent.change(screen.getByLabelText("交付額"), { target: { value: "900,000 * 2" } });
    fireEvent.change(screen.getByLabelText("予算額"), { target: { value: "350,000 * 2" } });
    fireEvent.change(screen.getByLabelText("横断集計カテゴリ"), { target: { value: "travel" } });
    await user.click(await screen.findByRole("checkbox", { name: "CREST 量子" }));
    await user.click(screen.getByRole("checkbox", { name: "学生支援" }));

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "次年度予算",
        fiscalYear: 2027,
        awardedAmount: 1800000,
        notes: "",
        projectTagIds: [1],
        auxiliaryLabelIds: [2],
        categories: [{ name: "出張", amount: 700000, crossAggregateCategory: "travel" }],
      }),
    });

    await waitFor(() => {
      expect(view.router.state.location.pathname).toBe("/funds/9");
    });
  });

  it("warns about unset cross aggregate categories without blocking save", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";

      if (url === "/api/funds" && method === "POST") {
        return {
          ok: true,
          json: async () => ({ fundId: 10 }),
        };
      }

      if (url === "/api/classifications" && method === "GET") {
        return {
          ok: true,
          json: async () => ({ projectTags: [], auxiliaryLabels: [] }),
        };
      }

      if (url === "/api/funds/10" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            fund: {
              id: 10,
              name: "次年度予算",
              awarded_amount: 1800000,
            },
            categories: [],
            crossAggregateCategories: [],
            monthlyStatus: [],
            actualEntries: [],
            plannedItems: [],
          }),
        };
      }

      throw new Error(`Unhandled request: ${method} ${url}`);
    });

    renderAppRoute("/funds/new");

    await fillRequiredFields();

    expect(screen.getByLabelText("横断集計カテゴリ")).toHaveValue("");
    expect(screen.getByText("横断集計カテゴリが未設定の費目があります。")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "次年度予算",
        fiscalYear: 2027,
        awardedAmount: 1800000,
        notes: "",
        projectTagIds: [],
        auxiliaryLabelIds: [],
        categories: [{ name: "出張", amount: 700000, crossAggregateCategory: "unset" }],
      }),
    });
  });

  it("shows a blocking error when the API rejects the payload", async () => {
    const user = userEvent.setup();

    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({
        message: "入力内容を確認してください。",
      }),
    });

    renderAppRoute("/funds/new");

    await fillRequiredFields();

    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("入力内容を確認してください。")).toBeInTheDocument();
  });

  it("blocks submit when the category total exceeds the awarded amount", async () => {
    const user = userEvent.setup();

    renderAppRoute("/funds/new");

    fireEvent.change(await screen.findByLabelText("予算名"), { target: { value: "次年度予算" } });
    fireEvent.change(screen.getByLabelText("年度"), { target: { value: "2027" } });
    fireEvent.change(screen.getByLabelText("交付額"), { target: { value: "1000000" } });
    fireEvent.change(screen.getByLabelText("費目名"), { target: { value: "出張" } });
    fireEvent.change(screen.getByLabelText("予算額"), { target: { value: "700000" } });

    await user.click(screen.getByRole("button", { name: "費目を追加" }));

    fireEvent.change(screen.getAllByLabelText("費目名")[1], { target: { value: "物品" } });
    fireEvent.change(screen.getAllByLabelText("予算額")[1], { target: { value: "400000" } });

    expect(screen.getByText("費目予算の合計が交付額を超えています。")).toBeInTheDocument();
    const chart = screen.getByRole("region", { name: "横断カテゴリ別の予算配分" });
    expect(chart.querySelector(".budget-category-over-budget-ring")).not.toBeNull();
    expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "保存" })).toHaveClass("budget-entry-submit-disabled");

    fetchMock.mockClear();
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("費目予算の合計が交付額を超えています。")).toBeInTheDocument();
  });
});

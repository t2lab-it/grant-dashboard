import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { formatTokyoDateKey } from "../../src/lib/calendar";
import { fetchMock, renderAppRoute, setupFundDetailTests } from "./fundDetailTestUtils";

describe("Fund detail interactions", () => {
  setupFundDetailTests();

  it("shows action buttons for planned items and opens a settlement modal that submits the linked actual entry", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    let currentFundDetail: {
      fund: { id: number; name: string; awarded_amount: number };
      categories: Array<{
        id: number;
        categoryName: string;
        budgetAmount: number | null;
        plannedAmount: number;
        actualAmount: number;
      }>;
      monthlyStatus: Array<{
        month: string;
        plannedAmount: number;
        actualAmount: number;
        totalAmount: number;
      }>;
      actualEntries: Array<{
        id: number;
        actualDate: string;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
      plannedItems: Array<{
        id: number;
        plannedDate: string;
        scheduledMonth: string;
        categoryId: number;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
    } = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [
        {
          id: 1,
          categoryName: "物品費",
          budgetAmount: 150000,
          plannedAmount: 280000,
          actualAmount: 0,
        },
      ],
      monthlyStatus: [],
      actualEntries: [],
      plannedItems: [
        {
          id: 10,
          plannedDate: "2026-07-10",
          scheduledMonth: "2026-07",
          categoryId: 1,
          categoryName: "物品費",
          description: "GPU サーバ保守更新",
          amount: 280000,
          notes: "未精算",
        },
      ],
    };

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => currentFundDetail,
        };
      }

      if (url === "/api/actual-entries" && method === "POST") {
        currentFundDetail = {
          ...currentFundDetail,
          actualEntries: [
            {
              id: 11,
              actualDate: "2026-07-31",
              categoryName: "物品費",
              description: "GPU サーバ保守更新",
              amount: 280000,
              notes: "未精算",
            },
          ],
          plannedItems: [],
        };

        return {
          ok: true,
          json: async () => ({ remainingPlannedAmount: 0 }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "計画項目一覧" });

    await user.click(within(plannedTable).getByRole("button", { name: "精算" }));

    const dialog = await screen.findByRole("dialog", { name: "計画項目を精算" });
    expect(within(dialog).getByLabelText("実績日")).toHaveValue(today);
    expect(within(dialog).getByLabelText("実績日カレンダー")).toHaveAttribute("type", "date");
    expect(within(dialog).getByLabelText("説明")).toHaveValue("GPU サーバ保守更新");
    expect(within(dialog).getByLabelText("金額")).toHaveValue("280000");
    expect(within(dialog).getByRole("button", { name: "閉じる" })).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: "キャンセル" })).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("実績日カレンダー"), {
      target: { value: "2026-07-31" },
    });
    expect(within(dialog).getByLabelText("実績日")).toHaveValue("2026/07/31");
    await user.click(within(dialog).getByRole("button", { name: "精算を登録" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 1,
        plannedItemId: 10,
        actualDate: "2026-07-31",
        description: "GPU サーバ保守更新",
        amount: 280000,
        notes: "未精算",
        auxiliaryLabelIds: [],
        keepRemainingPlanned: false,
      }),
    });
    expect(await fundPage.findByText("未精算の計画項目はまだありません。")).toBeInTheDocument();
    expect(fundPage.getByText("GPU サーバ保守更新")).toBeInTheDocument();
  });

  it("keeps the remaining planned amount when the settlement checkbox is enabled", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10);
    const currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [],
      monthlyStatus: [],
      actualEntries: [],
      plannedItems: [
        {
          id: 10,
          plannedDate: "2026-07-10",
          scheduledMonth: "2026-07",
          categoryId: 1,
          categoryName: "物品費",
          description: "GPU サーバ保守更新",
          amount: 280000,
          notes: "未精算",
        },
      ],
    };

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return { ok: true, json: async () => currentFundDetail };
      }

      if (url === "/api/actual-entries" && method === "POST") {
        return { ok: true, json: async () => ({ remainingPlannedAmount: 120000 }) };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "計画項目一覧" });

    await user.click(within(plannedTable).getByRole("button", { name: "精算" }));
    const dialog = await screen.findByRole("dialog", { name: "計画項目を精算" });
    await user.click(within(dialog).getByRole("checkbox", { name: "残額を予定として残す" }));
    await user.click(within(dialog).getByRole("button", { name: "精算を登録" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 1,
        plannedItemId: 10,
        actualDate: today,
        description: "GPU サーバ保守更新",
        amount: 280000,
        notes: "未精算",
        auxiliaryLabelIds: [],
        keepRemainingPlanned: true,
      }),
    });
  });

  it("duplicates planned items from the planned list with today as the planned date", async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10);
    let currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [
        {
          id: 1,
          categoryName: "物品費",
          budgetAmount: 150000,
          plannedAmount: 280000,
          actualAmount: 0,
        },
      ],
      monthlyStatus: [],
      actualEntries: [],
      plannedItems: [
        {
          id: 10,
          plannedDate: "2026-07-10",
          scheduledMonth: "2026-07",
          categoryId: 1,
          categoryName: "物品費",
          description: "GPU サーバ保守更新",
          amount: 280000,
          notes: "未精算",
          auxiliaryLabels: [{ id: 5, kind: "auxiliary", name: "要確認", color: "#16a34a" }],
        },
      ],
    };

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => currentFundDetail,
        };
      }

      if (url === "/api/classifications" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            projectTags: [],
            auxiliaryLabels: [{ id: 5, kind: "auxiliary", name: "要確認", color: "#16a34a" }],
          }),
        };
      }

      if (url === "/api/planned-items" && method === "POST") {
        return {
          ok: true,
          json: async () => ({ warnings: [] }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const plannedTable = await fundPage.findByRole("table", { name: "計画項目一覧" });

    await user.click(within(plannedTable).getByRole("button", { name: "複製" }));

    const dialog = await screen.findByRole("dialog", { name: "計画項目を複製" });
    await user.click(within(dialog).getByRole("button", { name: "複製を保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 1,
        plannedDate: today,
        scheduledMonth: "2026-07",
        description: "GPU サーバ保守更新",
        amount: 280000,
        notes: "未精算",
        auxiliaryLabelIds: [5],
      }),
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "計画項目を複製" })).not.toBeInTheDocument();
    });
  });

  it("scopes actual-entry duplicate destinations to the displayed historical fiscal year", async () => {
    const user = userEvent.setup();
    const today = formatTokyoDateKey(new Date());
    let currentFundDetail = {
      fund: { id: 1, name: "基盤研究費", fiscalYear: 2024, awarded_amount: 5080000 },
      categories: [
        {
          id: 1,
          categoryName: "物品費",
          budgetAmount: 150000,
          plannedAmount: 0,
          actualAmount: 300000,
        },
      ],
      monthlyStatus: [],
      actualEntries: [
        {
          id: 8,
          actualDate: "2026-06-20",
          categoryId: 1,
          categoryName: "物品費",
          description: "GPU サーバ保守",
          amount: 300000,
          notes: "保守契約の更新費用",
          auxiliaryLabels: [{ id: 5, kind: "auxiliary", name: "要確認", color: "#16a34a" }],
        },
      ],
      plannedItems: [],
    };

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => currentFundDetail,
        };
      }

      if (url === "/api/overview?year=2024" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            funds: [
              { id: 1, name: "基盤研究費" },
              { id: 2, name: "歴史年度共同研究費" },
            ],
          }),
        };
      }

      if (url === "/api/funds/2" && method === "GET") {
        return {
          ok: true,
          json: async () => ({ categories: [{ id: 2, categoryName: "旅費" }] }),
        };
      }

      if (url === "/api/classifications" && method === "GET") {
        return {
          ok: true,
          json: async () => ({
            projectTags: [],
            auxiliaryLabels: [{ id: 5, kind: "auxiliary", name: "要確認", color: "#16a34a" }],
          }),
        };
      }

      if (url === "/api/actual-entries" && method === "POST") {
        return {
          ok: true,
          json: async () => ({ remainingPlannedAmount: null }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const actualTable = await fundPage.findByRole("table", { name: "精算項目一覧" });

    await user.click(within(actualTable).getByRole("button", { name: "複製" }));

    const dialog = await screen.findByRole("dialog", { name: "精算項目を複製" });
    expect(within(dialog).getByLabelText("資金ID")).toHaveValue("1");
    expect(within(dialog).getByLabelText("費目ID")).toHaveValue("1");
    fireEvent.change(within(dialog).getByLabelText("資金ID"), {
      target: { value: "2" },
    });
    await screen.findByRole("option", { name: "旅費" });
    fireEvent.change(within(dialog).getByLabelText("費目ID"), {
      target: { value: "2" },
    });
    fireEvent.change(within(dialog).getByLabelText("金額"), {
      target: { value: "300000" },
    });
    await user.click(within(dialog).getByRole("button", { name: "複製を保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 2,
        categoryId: 2,
        actualDate: today,
        description: "GPU サーバ保守",
        amount: 300000,
        notes: "保守契約の更新費用",
        auxiliaryLabelIds: [5],
      }),
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "精算項目を複製" })).not.toBeInTheDocument();
    });
  });

  it("can cancel an actual entry from the edit modal", async () => {
    const user = userEvent.setup();
    let currentFundDetail: {
      fund: { id: number; name: string; awarded_amount: number };
      categories: Array<{
        id: number;
        categoryName: string;
        budgetAmount: number | null;
        plannedAmount: number;
        actualAmount: number;
      }>;
      monthlyStatus: Array<{
        month: string;
        plannedAmount: number;
        actualAmount: number;
        totalAmount: number;
      }>;
      actualEntries: Array<{
        id: number;
        actualDate: string;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
      plannedItems: Array<{
        id: number;
        plannedDate: string;
        scheduledMonth: string;
        categoryId: number;
        categoryName: string;
        description: string;
        amount: number;
        notes: string;
      }>;
    } = {
      fund: { id: 1, name: "基盤研究費", awarded_amount: 5080000 },
      categories: [],
      monthlyStatus: [],
      actualEntries: [
        {
          id: 8,
          actualDate: "2026-06-20",
          categoryName: "物品費",
          description: "GPU サーバ保守",
          amount: 300000,
          notes: "保守契約の更新費用",
        },
      ],
      plannedItems: [],
    };

    fetchMock.mockImplementation(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const method = init?.method ?? "GET";

      if (url === "/api/funds/1" && method === "GET") {
        return {
          ok: true,
          json: async () => currentFundDetail,
        };
      }

      if (url === "/api/actual-entries/8/cancel" && method === "POST") {
        currentFundDetail = {
          ...currentFundDetail,
          actualEntries: [],
        };

        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    });

    const view = renderAppRoute("/funds/1");
    const fundPage = within(view.container);
    const historyTable = await fundPage.findByRole("table", { name: "精算項目一覧" });

    await user.click(within(historyTable).getByRole("button", { name: "編集" }));

    const dialog = await screen.findByRole("dialog", { name: "精算項目を編集" });
    await user.click(within(dialog).getByRole("button", { name: "精算を取り消す" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries/8/cancel", {
      method: "POST",
    });
    expect(await fundPage.findByText("精算済み項目はまだありません。")).toBeInTheDocument();
  });
});

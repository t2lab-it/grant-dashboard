import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ActualEntryForm } from "../../src/features/actual-entries/ActualEntryForm";
import { PlannedItemForm } from "../../src/features/planned-items/PlannedItemForm";
import { AppSettingsProvider } from "../../src/features/settings/AppSettings";
import { renderWithMemoryRouter } from "./testUtils";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const classificationResponse = {
  projectTags: [{ id: 1, kind: "project", name: "CREST 量子", color: "#2563eb" }],
  auxiliaryLabels: [
    { id: 21, kind: "auxiliary", name: "学生支援", color: "#16a34a" },
    { id: 22, kind: "auxiliary", name: "装置更新", color: "#2563eb" },
  ],
};

function renderPlannedItemForm(initialEntry = "/planned-items/new") {
  return renderWithMemoryRouter(
    <AppSettingsProvider>
      <PlannedItemForm />
    </AppSettingsProvider>,
    { initialEntries: [initialEntry] },
  );
}

function renderActualEntryForm(initialEntry = "/actual-entries/new") {
  return renderWithMemoryRouter(
    <AppSettingsProvider>
      <ActualEntryForm />
    </AppSettingsProvider>,
    { initialEntries: [initialEntry] },
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("PlannedItemForm", () => {
  const allFundOptionsResponse = {
    funds: [
      { id: 1, name: "基盤研究費" },
      { id: 3, name: "ACT-X" },
    ],
  };
  const actxOnlyResponse = {
    funds: [{ id: 3, name: "ACT-X" }],
  };
  const actxFundDetailResponse = {
    fund: {
      id: 3,
      name: "ACT-X",
      awarded_amount: 5080000,
    },
    categories: [
      {
        id: 8,
        categoryName: "旅費",
        budgetAmount: 150000,
        plannedAmount: 0,
        actualAmount: 0,
      },
    ],
    monthlyStatus: [],
    actualEntries: [],
    plannedItems: [],
  };

  function mockPlannedItemFetches({
    overviewResponse = allFundOptionsResponse,
    plannedItemsResponse,
    bulkPlannedItemsResponse,
  }: {
    overviewResponse?: typeof allFundOptionsResponse;
    plannedItemsResponse?: { ok: boolean; json: () => Promise<unknown> } | (() => Promise<unknown>);
    bulkPlannedItemsResponse?: { ok: boolean; json: () => Promise<unknown> } | (() => Promise<unknown>);
  } = {}) {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;

      if (url === "/api/overview") {
        return {
          ok: true,
          json: async () => overviewResponse,
        };
      }

      if (url === "/api/classifications") {
        return {
          ok: true,
          json: async () => classificationResponse,
        };
      }

      if (url === "/api/funds/3") {
        return {
          ok: true,
          json: async () => actxFundDetailResponse,
        };
      }

      if (url === "/api/planned-items" && plannedItemsResponse) {
        return typeof plannedItemsResponse === "function"
          ? plannedItemsResponse()
          : plannedItemsResponse;
      }

      if (url === "/api/planned-items/bulk" && bulkPlannedItemsResponse) {
        return typeof bulkPlannedItemsResponse === "function"
          ? bulkPlannedItemsResponse()
          : bulkPlannedItemsResponse;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
  }

  async function selectActxCategory() {
    expect(await screen.findByRole("option", { name: "ACT-X" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("資金"), { target: { value: "3" } });
    expect(await screen.findByRole("option", { name: "旅費" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("費目"), { target: { value: "8" } });
  }

  function fillPlannedItemDetails() {
    fireEvent.change(screen.getByLabelText("立案日"), { target: { value: "2026/10/01" } });
    fireEvent.change(screen.getByLabelText("執行予定月"), { target: { value: "2026-10" } });
    fireEvent.change(screen.getByLabelText("説明"), { target: { value: "追加出張" } });
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText("メモ"), { target: { value: "学会対応" } });
  }

  it("renders named fund/category selects, keeps slash-formatted draft dates, and exposes a calendar picker", async () => {
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "/");
    const currentMonth = new Date().toISOString().slice(0, 7);

    mockPlannedItemFetches();

    renderPlannedItemForm();

    expect(await screen.findByRole("option", { name: "基盤研究費" })).toBeInTheDocument();
    expect(screen.getByLabelText("立案日")).toHaveValue(today);
    expect(screen.getByLabelText("執行予定月")).toHaveValue(currentMonth);
    expect(screen.getByLabelText("立案日カレンダー")).toHaveAttribute("type", "date");
    await selectActxCategory();
    fireEvent.change(screen.getByLabelText("立案日カレンダー"), {
      target: { value: "2026-05-01" },
    });
    expect(screen.getByLabelText("立案日")).toHaveValue("2026/05/01");
    expect(screen.getByLabelText("金額")).toHaveAttribute("data-direct-number-input", "true");
  });

  it("submits a planned item payload to the API and shows returned warnings", async () => {
    mockPlannedItemFetches({
      overviewResponse: actxOnlyResponse,
      plannedItemsResponse: {
        ok: true,
        json: async () => ({ warnings: ["Category budget exceeded for 旅費"] }),
      },
    });

    renderPlannedItemForm();

    await selectActxCategory();
    fireEvent.click(await screen.findByRole("checkbox", { name: "学生支援" }));
    fillPlannedItemDetails();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 3,
        categoryId: 8,
        plannedDate: "2026-10-01",
        scheduledMonth: "2026-10",
        description: "追加出張",
        amount: 50000,
        notes: "学会対応",
        auxiliaryLabelIds: [21],
      }),
    });
    expect(await screen.findByText("Category budget exceeded for 旅費")).toBeInTheDocument();
  });

  it("keeps typed values, disables submit while pending, and shows a blocking error from the API", async () => {
    let resolveFetch: ((value: { ok: boolean; json: () => Promise<unknown> }) => void) | undefined;
    mockPlannedItemFetches({
      overviewResponse: actxOnlyResponse,
      plannedItemsResponse: () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    });

    renderPlannedItemForm();

    await selectActxCategory();
    fillPlannedItemDetails();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(screen.getByRole("button", { name: "保存中..." })).toBeDisabled();

    resolveFetch?.({
      ok: false,
      json: async () => ({
        code: "category_fund_mismatch",
        message: "選択した費目が資金に紐づいていません。",
      }),
    });

    expect(await screen.findByText("選択した費目が資金に紐づいていません。")).toBeInTheDocument();
    expect(screen.getByLabelText("説明")).toHaveValue("追加出張");
    expect(screen.getByLabelText("金額")).toHaveValue(50000);
    expect(screen.getByLabelText("メモ")).toHaveValue("学会対応");
  });

  it("generates an inclusive monthly bulk preview, allows row edits, and submits the bulk payload", async () => {
    mockPlannedItemFetches({
      overviewResponse: actxOnlyResponse,
      bulkPlannedItemsResponse: {
        ok: true,
        json: async () => ({ createdCount: 3, warnings: ["Category budget exceeded for 旅費"] }),
      },
    });

    renderPlannedItemForm();

    await selectActxCategory();
    fireEvent.click(screen.getByRole("button", { name: "一括" }));
    fireEvent.click(await screen.findByRole("checkbox", { name: "学生支援" }));
    fireEvent.change(screen.getByLabelText("立案日"), { target: { value: "2026/10/01" } });
    fireEvent.change(screen.getByLabelText("開始月"), { target: { value: "2026-10" } });
    fireEvent.change(screen.getByLabelText("終了月"), { target: { value: "2026-12" } });
    fireEvent.change(screen.getByLabelText("基準説明"), { target: { value: "TA賃金" } });
    fireEvent.change(screen.getByLabelText("基準金額"), { target: { value: "50000" } });
    fireEvent.change(screen.getByLabelText("メモ"), { target: { value: "毎月支払い" } });

    fireEvent.click(screen.getByRole("button", { name: "プレビュー生成" }));

    expect(screen.getByLabelText("説明 2026-10")).toHaveValue("TA賃金 2026-10");
    expect(screen.getByLabelText("説明 2026-11")).toHaveValue("TA賃金 2026-11");
    expect(screen.getByLabelText("説明 2026-12")).toHaveValue("TA賃金 2026-12");

    fireEvent.change(screen.getByLabelText("説明 2026-11"), {
      target: { value: "TA賃金 2026-11 調整" },
    });
    fireEvent.change(screen.getByLabelText("金額 2026-11"), { target: { value: "55000" } });
    fireEvent.click(screen.getByRole("button", { name: "一括保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/planned-items/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 3,
        categoryId: 8,
        plannedDate: "2026-10-01",
        notes: "毎月支払い",
        auxiliaryLabelIds: [21],
        items: [
          {
            scheduledMonth: "2026-10",
            description: "TA賃金 2026-10",
            amount: 50000,
          },
          {
            scheduledMonth: "2026-11",
            description: "TA賃金 2026-11 調整",
            amount: 55000,
          },
          {
            scheduledMonth: "2026-12",
            description: "TA賃金 2026-12",
            amount: 50000,
          },
        ],
      }),
    });
    expect(await screen.findByText("Category budget exceeded for 旅費")).toBeInTheDocument();
  });

  it("rejects a bulk preview when the start month is after the end month", async () => {
    mockPlannedItemFetches({ overviewResponse: actxOnlyResponse });

    renderPlannedItemForm();

    await selectActxCategory();
    fireEvent.click(screen.getByRole("button", { name: "一括" }));
    fireEvent.change(screen.getByLabelText("開始月"), { target: { value: "2026-12" } });
    fireEvent.change(screen.getByLabelText("終了月"), { target: { value: "2026-10" } });
    fireEvent.change(screen.getByLabelText("基準説明"), { target: { value: "AIサブスク" } });
    fireEvent.change(screen.getByLabelText("基準金額"), { target: { value: "3000" } });

    fireEvent.click(screen.getByRole("button", { name: "プレビュー生成" }));

    expect(await screen.findByText("開始月は終了月以前にしてください。")).toBeInTheDocument();
    expect(screen.queryByLabelText("説明 2026-10")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      "/api/planned-items/bulk",
      expect.anything(),
    );
  });
});

describe("ActualEntryForm", () => {
  const actualEntryFundOptionsResponse = {
    funds: [
      { id: 2, name: "基盤研究費" },
      { id: 4, name: "ACT-X" },
    ],
  };
  const actualEntryFundDetailResponse = {
    fund: {
      id: 2,
      name: "基盤研究費",
      awarded_amount: 5080000,
    },
    categories: [
      {
        id: 5,
        categoryName: "物品費",
        budgetAmount: 150000,
        plannedAmount: 0,
        actualAmount: 0,
      },
      {
        id: 14,
        categoryName: "旅費",
        budgetAmount: 50000,
        plannedAmount: 0,
        actualAmount: 0,
      },
    ],
    monthlyStatus: [],
    actualEntries: [],
    plannedItems: [
      {
        id: 31,
        plannedDate: "2026-09-01",
        scheduledMonth: "2026-09",
        categoryId: 5,
        categoryName: "物品費",
        description: "試薬の追加購入",
        amount: 40000,
        notes: "",
      },
      {
        id: 32,
        plannedDate: "2026-09-03",
        scheduledMonth: "2026-09",
        categoryId: 14,
        categoryName: "旅費",
        description: "学会出張",
        amount: 80000,
        notes: "",
      },
    ],
  };
  const unlinkedActualEntryFundOptionsResponse = {
    funds: [{ id: 4, name: "ACT-X" }],
  };
  const unlinkedActualEntryFundDetailResponse = {
    fund: {
      id: 4,
      name: "ACT-X",
      awarded_amount: 1350000,
    },
    categories: [
      {
        id: 6,
        categoryName: "会議費",
        budgetAmount: 100000,
        plannedAmount: 0,
        actualAmount: 0,
      },
    ],
    monthlyStatus: [],
    actualEntries: [],
    plannedItems: [],
  };

  function mockActualEntryFetches({
    overviewResponse = actualEntryFundOptionsResponse,
    fundDetailResponse = actualEntryFundDetailResponse,
    actualEntriesResponse,
  }: {
    overviewResponse?: typeof actualEntryFundOptionsResponse;
    fundDetailResponse?: typeof actualEntryFundDetailResponse;
    actualEntriesResponse?: { ok: boolean; json: () => Promise<unknown> } | (() => Promise<unknown>);
  } = {}) {
    fetchMock.mockImplementation(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;

      if (url === "/api/overview") {
        return {
          ok: true,
          json: async () => overviewResponse,
        };
      }

      if (url === "/api/classifications") {
        return {
          ok: true,
          json: async () => classificationResponse,
        };
      }

      if (url === `/api/funds/${overviewResponse.funds[0]?.id ?? ""}` || url === "/api/funds/2") {
        return {
          ok: true,
          json: async () => fundDetailResponse,
        };
      }

      if (url === "/api/funds/4") {
        return {
          ok: true,
          json: async () => unlinkedActualEntryFundDetailResponse,
        };
      }

      if (url === "/api/actual-entries" && actualEntriesResponse) {
        return typeof actualEntriesResponse === "function" ? actualEntriesResponse() : actualEntriesResponse;
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });
  }

  async function selectActualEntryCategory({ fundId = "2", categoryId = "5" } = {}) {
    expect(await screen.findByRole("option", { name: fundId === "4" ? "ACT-X" : "基盤研究費" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("資金"), { target: { value: fundId } });
    expect(await screen.findByRole("option", { name: fundId === "4" ? "会議費" : "物品費" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("費目"), { target: { value: categoryId } });
  }

  function fillActualEntryDetails({ withPlannedItemId = true }: { withPlannedItemId?: boolean } = {}) {
    fireEvent.change(screen.getByLabelText("実績日"), { target: { value: "2026/09/12" } });
    fireEvent.change(screen.getByLabelText("説明"), { target: { value: "試薬購入" } });
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "30000" } });
    fireEvent.change(screen.getByLabelText("メモ"), { target: { value: "第2便" } });
    if (withPlannedItemId) {
      fireEvent.change(screen.getByLabelText("予定項目"), { target: { value: "31" } });
    }
  }

  it("renders named fund/category selects, keeps slash-formatted actual dates, and filters planned-item choices", async () => {
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "/");

    mockActualEntryFetches();

    renderActualEntryForm();

    expect(await screen.findByRole("option", { name: "基盤研究費" })).toBeInTheDocument();
    expect(screen.getByLabelText("資金")).toHaveDisplayValue("資金を選択してください");
    expect(screen.getByLabelText("費目")).toBeDisabled();
    expect(screen.getByLabelText("予定項目")).toBeDisabled();
    expect(screen.getByLabelText("実績日")).toHaveValue(today);
    expect(screen.getByLabelText("実績日カレンダー")).toHaveAttribute("type", "date");

    await selectActualEntryCategory();
    fireEvent.change(screen.getByLabelText("実績日カレンダー"), {
      target: { value: "2026-05-01" },
    });

    expect(screen.getByLabelText("実績日")).toHaveValue("2026/05/01");
    expect(screen.getByText("未入力でも実績を登録できます。")).toBeInTheDocument();
    expect(screen.getByLabelText("予定項目")).toHaveDisplayValue("未連携で登録");
    expect(screen.getByRole("option", { name: "試薬の追加購入" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "学会出張" })).not.toBeInTheDocument();

    const categoryField = screen.getByLabelText("費目").closest(".budget-entry-field");
    const plannedItemField = screen.getByLabelText("予定項目").closest(".budget-entry-field");

    expect(categoryField?.compareDocumentPosition(plannedItemField as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it("submits an actual entry payload and shows the remaining planned amount message", async () => {
    mockActualEntryFetches({
      actualEntriesResponse: {
        ok: true,
        json: async () => ({ remainingPlannedAmount: 120000 }),
      },
    });

    renderActualEntryForm();

    await selectActualEntryCategory();
    fireEvent.click(await screen.findByRole("checkbox", { name: "装置更新" }));
    fillActualEntryDetails();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 2,
        categoryId: 5,
        actualDate: "2026-09-12",
        description: "試薬購入",
        amount: 30000,
        notes: "第2便",
        plannedItemId: 31,
        auxiliaryLabelIds: [22],
      }),
    });
    expect(await screen.findByText("残り予定額: 120000")).toBeInTheDocument();
  });

  it("omits plannedItemId from the payload when the field is left blank", async () => {
    mockActualEntryFetches({
      overviewResponse: unlinkedActualEntryFundOptionsResponse,
      fundDetailResponse: unlinkedActualEntryFundDetailResponse,
      actualEntriesResponse: {
        ok: true,
        json: async () => ({ remainingPlannedAmount: "未連携" }),
      },
    });

    renderActualEntryForm();

    await selectActualEntryCategory({ fundId: "4", categoryId: "6" });
    fireEvent.change(screen.getByLabelText("実績日"), { target: { value: "2026/09/20" } });
    fireEvent.change(screen.getByLabelText("説明"), { target: { value: "会場費" } });
    fireEvent.change(screen.getByLabelText("金額"), { target: { value: "45000" } });
    fireEvent.change(screen.getByLabelText("メモ"), { target: { value: "当日精算" } });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(fetchMock).toHaveBeenCalledWith("/api/actual-entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 4,
        categoryId: 6,
        actualDate: "2026-09-20",
        description: "会場費",
        amount: 45000,
        notes: "当日精算",
        auxiliaryLabelIds: [],
      }),
    });
  });

  it("shows a blocking mismatch error returned by the API and preserves typed values", async () => {
    mockActualEntryFetches({
      actualEntriesResponse: {
        ok: false,
        json: async () => ({
          code: "planned_item_mismatch",
          message: "予定項目IDが選択した資金または費目と一致していません。",
        }),
      },
    });

    renderActualEntryForm();

    await selectActualEntryCategory();
    fillActualEntryDetails();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(
      await screen.findByText("予定項目IDが選択した資金または費目と一致していません。"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("説明")).toHaveValue("試薬購入");
    expect(screen.getByLabelText("予定項目")).toHaveValue("31");
  });

  it("treats negative remaining planned amount as a warning", async () => {
    mockActualEntryFetches({
      actualEntriesResponse: {
        ok: true,
        json: async () => ({ remainingPlannedAmount: -5000 }),
      },
    });

    renderActualEntryForm();

    await selectActualEntryCategory();
    fillActualEntryDetails({ withPlannedItemId: false });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(await screen.findByText("残り予定額がマイナスです: -5000")).toBeInTheDocument();
  });
});

import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PlannedItemForm } from "../../src/features/planned-items/PlannedItemForm";
import { AppSettingsProvider } from "../../src/features/settings/AppSettings";
import {
  buildOverviewFund,
  buildOverviewResponse,
  fetchMock,
  renderAppRoute,
  resetOverviewTestState,
} from "./overviewTestUtils";
import { renderWithMemoryRouter } from "./testUtils";

function buildFiscalOverview(year: number) {
  return buildOverviewResponse({
    availableFiscalYears: [2026, 2027],
    selectedFiscalYear: year,
    funds: [
      buildOverviewFund({
        id: year === 2026 ? 1 : 2,
        name: year === 2026 ? "現年度基金" : "翌年度基金",
      }),
    ],
  });
}

function buildFundDetail(fiscalYear: number) {
  return {
    fund: {
      id: 1,
      name: "翌年度基金",
      fiscalYear,
      awarded_amount: 2000000,
      notes: "",
    },
    categories: [
      {
        id: 10,
        categoryName: "物品費",
        budgetAmount: 2000000,
        plannedAmount: 0,
        actualAmount: 0,
      },
    ],
    monthlyStatus: [],
    actualEntries: [],
    plannedItems: [],
  };
}

function mockApi({ fundFiscalYear = 2027 } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/api/overview?year=2027") {
      return { ok: true, json: async () => buildFiscalOverview(2027) };
    }

    if (url === "/api/overview?year=2026") {
      return { ok: true, json: async () => buildFiscalOverview(2026) };
    }

    if (url === "/api/overview") {
      return { ok: true, json: async () => buildFiscalOverview(2026) };
    }

    if (url === "/api/funds/1") {
      return { ok: true, json: async () => buildFundDetail(fundFiscalYear) };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("global fiscal year selection", () => {
  beforeEach(() => {
    resetOverviewTestState();
    mockApi();
  });

  afterEach(() => {
    cleanup();
  });

  it("adds the resolved fiscal year to the URL when the URL has no year", async () => {
    const { router } = renderAppRoute("/");

    const selector = await screen.findByRole("combobox", { name: "年度" });
    expect(selector).toHaveValue("2026");

    await waitFor(() => {
      expect(router.state.location.search).toBe("?year=2026");
    });
  });

  it("returns detail pages to overview when the user switches fiscal year manually", async () => {
    const user = userEvent.setup();
    mockApi({ fundFiscalYear: 2026 });
    const { router } = renderAppRoute("/funds/1?year=2026");

    const selector = await screen.findByRole("combobox", { name: "年度" });
    await user.selectOptions(selector, "2027");

    await waitFor(() => {
      expect(router.state.location.pathname).toBe("/");
      expect(router.state.location.search).toBe("?year=2027");
    });
    expect(await screen.findAllByText("翌年度基金")).not.toHaveLength(0);
  });

  it("switches direct fund detail links to the fund fiscal year and shows a notice", async () => {
    const { router } = renderAppRoute("/funds/1?year=2026");

    expect(await screen.findAllByText("翌年度基金")).not.toHaveLength(0);

    await waitFor(() => {
      expect(router.state.location.search).toBe("?year=2027");
    });
    expect(screen.getByRole("status")).toHaveTextContent("この予算の年度に切り替えました");
  });

  it("uses the selected fiscal year for entry form fund candidates", async () => {
    renderWithMemoryRouter(
      <AppSettingsProvider>
        <PlannedItemForm />
      </AppSettingsProvider>,
      { initialEntries: ["/planned-items/new?year=2027"] },
    );

    const fundSelect = await screen.findByRole("combobox", { name: "資金" });

    expect(fetchMock).toHaveBeenCalledWith("/api/overview?year=2027", {});
    expect(await within(fundSelect).findByRole("option", { name: "翌年度基金" })).toBeInTheDocument();
    expect(within(fundSelect).queryByRole("option", { name: "現年度基金" })).toBeNull();
  });
});

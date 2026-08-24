import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import {
  fetchMock,
  readStoredAppSettings,
  renderSettingsRoute,
  setupSettingsTests,
} from "./settingsTestUtils";

describe("SettingsPage", () => {
  setupSettingsTests();
  it("persists the shared default fund and category, and clears the category when the fund changes", async () => {
    const user = userEvent.setup();

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "/api/overview") {
        return {
          ok: true,
          json: async () => ({
            funds: [
              { id: 2, name: "基盤研究費" },
              { id: 3, name: "ACT-X" },
            ],
          }),
        };
      }

      if (url === "/api/funds/2") {
        return {
          ok: true,
          json: async () => ({
            categories: [
              { id: 5, categoryName: "物品費" },
              { id: 14, categoryName: "旅費" },
            ],
            plannedItems: [],
          }),
        };
      }

      if (url === "/api/funds/3") {
        return {
          ok: true,
          json: async () => ({
            categories: [{ id: 8, categoryName: "会議費" }],
            plannedItems: [],
          }),
        };
      }

      throw new Error(`Unhandled request: ${url}`);
    });

    renderSettingsRoute();

    expect(await screen.findByRole("heading", { name: "設定" })).toBeInTheDocument();

    const defaultFundSelect = screen.getByLabelText("新規作成時の既定予算");
    const defaultCategorySelect = screen.getByLabelText("新規作成時の既定費目");
    expect(defaultCategorySelect).toBeDisabled();

    expect(await screen.findByRole("option", { name: "基盤研究費" })).toBeInTheDocument();
    await user.selectOptions(defaultFundSelect, "2");
    expect(await screen.findByRole("option", { name: "旅費" })).toBeInTheDocument();

    await user.selectOptions(defaultCategorySelect, "14");

    expect(readStoredAppSettings()).toMatchObject({
      defaultFundId: 2,
      defaultCategoryId: 14,
    });

    await user.selectOptions(defaultFundSelect, "3");

    expect(screen.getByLabelText("新規作成時の既定費目")).toHaveValue("");
    expect(readStoredAppSettings()).toMatchObject({
      defaultFundId: 3,
      defaultCategoryId: null,
    });
  });
});

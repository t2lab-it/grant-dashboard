import { cleanup, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { routes } from "../../src/app/routes";
import {
  renderWithAppRouter,
  resetClientTestState,
  setMatchMediaMatches,
  stubMatchMedia,
} from "./testUtils";

stubMatchMedia();

describe("app theme resolution", () => {
  function storedSettings(appThemeMode: "system" | "light" | "dark") {
    return JSON.stringify({
      appThemeMode,
      themePreset: "teal-yellow",
      customChartPresets: [],
      defaultRateMetric: "execution",
      defaultOverviewDisplayMode: "chart",
      notesDisplayMode: "hover",
      defaultFundId: null,
      defaultCategoryId: null,
      amountDisplayMode: "grouped-yen",
      fundDetailSectionOrder: ["categories", "timeline", "actualEntries", "plannedItems"],
      executionRateThresholds: {
        notice: 70,
        warning: 90,
        alert: 100,
      },
      balanceRateThresholds: {
        notice: 30,
        warning: 10,
        alert: 0,
      },
    });
  }

  beforeEach(() => {
    resetClientTestState();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    cleanup();
    document.documentElement.removeAttribute("data-theme");
  });

  it("keeps an explicit light selection when the system theme changes", async () => {
    window.localStorage.setItem(
      "budget-dashboard:settings",
      storedSettings("light"),
    );
    setMatchMediaMatches("(prefers-color-scheme: dark)", true);

    renderWithAppRouter(routes, "/");

    await screen.findByRole("heading", { name: "研究予算ダッシュボード" });
    expect(document.documentElement.dataset.theme).toBe("light");

    setMatchMediaMatches("(prefers-color-scheme: dark)", false);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("updates when the system theme changes in system mode", async () => {
    window.localStorage.setItem(
      "budget-dashboard:settings",
      storedSettings("system"),
    );
    setMatchMediaMatches("(prefers-color-scheme: dark)", false);

    renderWithAppRouter(routes, "/");

    await screen.findByRole("heading", { name: "研究予算ダッシュボード" });
    expect(document.documentElement.dataset.theme).toBe("light");

    setMatchMediaMatches("(prefers-color-scheme: dark)", true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

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
      JSON.stringify({ appThemeMode: "light" }),
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
      JSON.stringify({ appThemeMode: "system" }),
    );
    setMatchMediaMatches("(prefers-color-scheme: dark)", false);

    renderWithAppRouter(routes, "/");

    await screen.findByRole("heading", { name: "研究予算ダッシュボード" });
    expect(document.documentElement.dataset.theme).toBe("light");

    setMatchMediaMatches("(prefers-color-scheme: dark)", true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

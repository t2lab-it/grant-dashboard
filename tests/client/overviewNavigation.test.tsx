import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockOverviewResponse, renderAppRoute, resetOverviewTestState } from "./overviewTestUtils";

describe("Overview navigation", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
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

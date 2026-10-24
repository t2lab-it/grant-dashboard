import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mockOverviewResponse, renderAppRoute, resetOverviewTestState } from "./overviewTestUtils";

describe("first-run local onboarding", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows setup guidance on overview when there are no funds or prior imports", async () => {
    mockOverviewResponse({ funds: [], latestImport: null });

    renderAppRoute("/");

    expect(await screen.findByRole("heading", { name: "はじめに" })).toBeInTheDocument();
    expect(screen.getByText("npm run seed:demo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "テンプレートを取得" })).toHaveAttribute(
      "href",
      "/api/imports/workbook/template.xlsx",
    );
    const guide = screen.getByRole("region", { name: "はじめに" });
    expect(within(guide).getByRole("link", { name: "架空データのデモを開く" })).toHaveAttribute("href", "https://t2lab-it.github.io/grant-dashboard/");
    const user = userEvent.setup();
    await user.click(within(guide).getByRole("button", { name: "インポート" }));
    const firstDialog = screen.getByRole("dialog", { name: "workbook をインポート" });
    const firstId = firstDialog.getAttribute("aria-labelledby");
    await user.click(within(firstDialog).getByRole("button", { name: "キャンセル" }));
    await user.click(within(screen.getByRole("navigation", {name: "メインナビゲーション"})).getByRole("button", {name: "インポート"}));
    expect(screen.getByRole("dialog", {name: "workbook をインポート"}).getAttribute("aria-labelledby")).not.toBe(firstId);
    expect(screen.getByRole("link", { name: "Workbook 運用を読む" })).toHaveAttribute(
      "href",
      "https://github.com/t2lab-it/grant-dashboard/blob/main/docs/workbook.md",
    );
  });

});

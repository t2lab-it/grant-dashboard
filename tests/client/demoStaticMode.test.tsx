import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { routes } from "../../src/app/routes";
import {
  handleStaticDemoRequest,
  resetStaticDemoStore,
} from "../../src/demo/staticDemoApi";
import { renderWithAppRouter, resetClientTestState, stubMatchMedia } from "./testUtils";

describe("static demo mode UI", () => {
  beforeEach(() => {
    resetClientTestState();
    stubMatchMedia();
    resetStaticDemoStore();
    Reflect.set(globalThis, "__BUDGET_DASHBOARD_STATIC_DEMO__", true);
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(globalThis, "__BUDGET_DASHBOARD_STATIC_DEMO__");
  });

  test("shows a reset button and hides file import/export controls", async () => {
    renderWithAppRouter(routes, "/");

    expect(await screen.findByRole("button", { name: "デモを初期状態に戻す" })).toBeInTheDocument();
    expect(screen.getByText("静的デモでは実ファイル import/export と SQLite は使えません。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ローカル利用の手順を読む" })).toHaveAttribute(
      "href",
      "https://github.com/t2lab-it/grant-dashboard#readme",
    );
    expect(screen.queryByRole("button", { name: "インポート" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "エクスポート" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "収支簿出力" })).not.toBeInTheDocument();
  });

  test("reset button restores the seed state", async () => {
    await handleStaticDemoRequest("/api/planned-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fundId: 1,
        categoryId: 2,
        plannedDate: "2026-10-01",
        scheduledMonth: "2026-10",
        description: "追加出張",
        amount: 50000,
        notes: "静的デモで追加",
      }),
    });
    const user = userEvent.setup();
    renderWithAppRouter(routes, "/");

    expect(await screen.findAllByText("1,505,000円")).not.toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "デモを初期状態に戻す" }));

    await waitFor(() => {
      expect(screen.getAllByText("1,455,000円")).not.toHaveLength(0);
    });
  });
});

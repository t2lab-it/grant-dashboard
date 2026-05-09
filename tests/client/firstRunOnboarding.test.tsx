import { cleanup, screen } from "@testing-library/react";
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

    expect(await screen.findByRole("heading", { name: "初回ローカル利用の準備" })).toBeInTheDocument();
    expect(screen.getByText("npm run seed:demo")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "template.xlsx をダウンロード" })).toHaveAttribute(
      "href",
      "/api/imports/workbook/template.xlsx",
    );
    expect(screen.getByRole("button", { name: "インポート" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Workbook 運用を読む" })).toHaveAttribute(
      "href",
      "https://github.com/t2lab-it/grant-dashboard/blob/main/docs/workbook.md",
    );
  });

});

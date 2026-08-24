import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildOverviewResponse,
  fetchMock,
  renderAppRoute,
  resetOverviewTestState,
} from "./overviewTestUtils";

const alertResponse = {
  availableFiscalYears: [2026],
  selectedFiscalYear: 2026,
  primary: [
    {
      key: "budget_overrun",
      label: "予算超過",
      severity: "danger",
      count: 1,
      items: [
        {
          id: "1-1",
          title: "基盤研究費",
          href: "/funds/1?year=2026",
          details: [
            {
              id: "1-1",
              label: "物品費",
              labelTone: "budget_overrun",
              amount: -30000,
            },
          ],
        },
      ],
    },
    {
      key: "overdue",
      label: "期限超過",
      severity: "warning",
      count: 2,
      items: [
        {
          id: "fund-1",
          title: "基盤研究費",
          href: "/funds/1?year=2026",
          details: [
            {
              id: "planned-1",
              label: "2026-04",
              labelTone: "overdue",
              title: "GPU サーバ購入",
              amount: 70000,
            },
            {
              id: "planned-2",
              label: "2026-04",
              labelTone: "overdue",
              title: "解析委託",
              amount: 40000,
            },
          ],
        },
      ],
    },
    {
      key: "year_end_risk",
      label: "年度末注意",
      severity: "warning",
      count: 1,
      items: [
        {
          id: "fund-2",
          title: "ACT-X",
          href: "/funds/2?year=2026",
          yearEndRisks: [
            {
              kind: "negative_balance",
              label: "残高不足",
              amount: -30000,
              rate: -3.8,
            },
            {
              kind: "overdue_planned",
              label: "期限超過予定",
              amount: 10000,
            },
          ],
        },
      ],
    },
  ],
  supporting: [],
};

function mockAppShell(alerts = alertResponse) {
  fetchMock.mockImplementation(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.pathname + input.search : input.url;

    if (url.startsWith("/api/overview")) {
      return {
        ok: true,
        json: async () => buildOverviewResponse(),
      };
    }

    if (url.startsWith("/api/header-alerts")) {
      return {
        ok: true,
        json: async () => alerts,
      };
    }

    throw new Error(`Unexpected fetch: ${url}`);
  });
}

describe("header alerts", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows primary alert counts in a header bar and opens linked details", async () => {
    const user = userEvent.setup();
    mockAppShell();

    renderAppRoute("/?year=2026");

    const alertButton = await screen.findByRole("button", {
      name: "予算超過 1 / 期限超過 2 / 年度末注意 1",
    });
    expect(alertButton).toHaveAttribute("aria-expanded", "false");

    await user.click(alertButton);

    expect(alertButton).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("region", { name: "アラート詳細" });
    const fundLinks = within(panel).getAllByRole("link", { name: "基盤研究費" });
    expect(within(panel).getByRole("heading", { name: "予算超過 1" })).toBeInTheDocument();
    const budgetOverrunLink = fundLinks[0];
    expect(budgetOverrunLink).toHaveAttribute(
      "href",
      "/funds/1?year=2026",
    );
    expect(within(budgetOverrunLink).getByText("物品費")).toBeInTheDocument();
    expect(within(budgetOverrunLink).getByText("-30,000円")).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "年度末注意 1" })).toBeInTheDocument();
    const yearEndRiskLink = within(panel).getByRole("link", { name: /ACT-X/ });
    expect(yearEndRiskLink).toHaveAttribute("href", "/funds/2?year=2026");
    expect(within(yearEndRiskLink).getByText("残高不足")).toBeInTheDocument();
    expect(within(yearEndRiskLink).getByText("-30,000円")).toBeInTheDocument();
    expect(within(yearEndRiskLink).getByText("(-3.8%)")).toBeInTheDocument();
    expect(within(yearEndRiskLink).getByText("期限超過予定")).toBeInTheDocument();
    expect(within(yearEndRiskLink).getByText("10,000円")).toBeInTheDocument();
    expect(within(panel).getByRole("heading", { name: "期限超過 2" })).toBeInTheDocument();
    const overdueLink = fundLinks.at(1);
    expect(overdueLink).toBeDefined();
    expect(overdueLink).toHaveAttribute("href", "/funds/1?year=2026");
    expect(within(overdueLink as HTMLElement).getAllByText("2026-04")).toHaveLength(2);
    expect(within(overdueLink as HTMLElement).getByText("GPU サーバ購入")).toBeInTheDocument();
    expect(within(overdueLink as HTMLElement).getByText("70,000円")).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/header-alerts?year=2026", {});
    });
  });

});

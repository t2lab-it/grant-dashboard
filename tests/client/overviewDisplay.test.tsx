import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOverviewFund,
  fetchMock,
  mockOverviewResponse,
  renderAppRoute,
  renderOverviewPage,
  resetOverviewTestState,
} from "./overviewTestUtils";
import { storedAppSettings } from "./testUtils";

const actXOnlyOverview = {
  funds: [
    buildOverviewFund({
      id: 2,
      name: "ACT-X",
      awarded_amount: 5080000,
      committed_amount: 4685000,
      actual_amount: 47590,
      freeBalance: 347410,
    }),
  ],
};

function formatExpectedLocalDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

describe("Overview display", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders top-level totals and fund cards", async () => {
    mockOverviewResponse({
      latestImport: {
        id: 7,
        source_filename: "budget2026.xlsx",
        imported_at: "2026-04-20T15:00:00.000Z",
        warning_count: 2,
        reconciliation_ok: false,
      },
    });

    renderAppRoute("/");

    expect(await screen.findByRole("button", { name: /^予算総額 10,246,706円$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^執行予定額 7,087,000円$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^残高 3,159,706円$/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ACT-X/i })).toBeInTheDocument();
    expect(screen.getByText("直近インポート")).toBeInTheDocument();
    expect(screen.getByText("budget2026.xlsx")).toBeInTheDocument();
    expect(screen.getByText(formatExpectedLocalDateTime("2026-04-20T15:00:00.000Z"))).toBeInTheDocument();
    expect(screen.getByText("照合NG")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "警告 2件" })).toHaveAttribute("href", "/imports/7");

    const overBudgetCard = screen.getByRole("link", { name: /基盤研究費/i });
    expect(overBudgetCard).toHaveAttribute("href", "/funds/1?year=2026");

    const fundCard = screen.getByRole("link", { name: /ACT-X/i });
    expect(fundCard).toHaveAttribute("href", "/funds/2?year=2026");
  });

  it("shows project tags and filters fund cards by project tag", async () => {
    const user = userEvent.setup();
    const crestTag = { id: 1, kind: "project" as const, name: "CREST 量子", color: "#2563eb" };

    mockOverviewResponse({
      funds: [
        buildOverviewFund({
          id: 1,
          name: "CREST 関連",
          awarded_amount: 1000,
          committed_amount: 300,
          actual_amount: 100,
          freeBalance: 600,
          projectTags: [crestTag],
        }),
        buildOverviewFund({
          id: 2,
          name: "タグなし",
          awarded_amount: 2000,
          committed_amount: 400,
          actual_amount: 250,
          freeBalance: 1350,
          projectTags: [],
        }),
      ],
    });

    renderAppRoute("/");

    const taggedCard = await screen.findByRole("link", { name: /CREST 関連/i });
    expect(within(taggedCard).getByText("CREST 量子")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /タグなし/i })).toBeInTheDocument();
    const projectTagSelect = screen.getByRole("combobox", { name: "研究プロジェクトタグ" });
    expect(projectTagSelect).toHaveValue("all");
    expect(within(projectTagSelect).getByRole("option", { name: "すべて" })).toBeInTheDocument();
    expect(within(projectTagSelect).getByRole("option", { name: "CREST 量子" })).toBeInTheDocument();
    expect(within(projectTagSelect).getByRole("option", { name: "未設定" })).toBeInTheDocument();

    await user.selectOptions(projectTagSelect, "tag-1");

    expect(screen.getByRole("link", { name: /CREST 関連/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /タグなし/i })).not.toBeInTheDocument();

    await user.selectOptions(projectTagSelect, "unassigned");

    expect(screen.queryByRole("link", { name: /CREST 関連/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /タグなし/i })).toBeInTheDocument();

    await user.selectOptions(projectTagSelect, "all");

    expect(screen.getByRole("link", { name: /CREST 関連/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /タグなし/i })).toBeInTheDocument();
  });

  it("does not show the project tag filter when every fund is unassigned", async () => {
    mockOverviewResponse({
      funds: [
        buildOverviewFund({
          id: 1,
          name: "タグなしA",
          awarded_amount: 1000,
          committed_amount: 300,
          actual_amount: 100,
          freeBalance: 600,
          projectTags: [],
        }),
        buildOverviewFund({
          id: 2,
          name: "タグなしB",
          awarded_amount: 2000,
          committed_amount: 400,
          actual_amount: 250,
          freeBalance: 1350,
          projectTags: [],
        }),
      ],
    });

    renderAppRoute("/");

    expect(await screen.findByRole("link", { name: /タグなしA/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /タグなしB/i })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "研究プロジェクトタグ" })).not.toBeInTheDocument();
  });

  it("defaults to chart mode and toggles all fund cards to numeric mode", async () => {
    const user = userEvent.setup();

    mockOverviewResponse();

    renderAppRoute("/");

    await screen.findByRole("link", { name: /ACT-X/i });
    expect(screen.getByText("まだインポート実行なし")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /警告/ })).not.toBeInTheDocument();
    const sectionHeading = screen.getByRole("heading", { name: "予算別の状況" });
    expect(sectionHeading).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "基金別の状況" })).not.toBeInTheDocument();
    const sectionHeader = sectionHeading.closest(".overview-section-header");
    const headerControls = sectionHeader?.querySelector(".overview-section-controls");
    const ledgerExportLink = within(headerControls as HTMLElement).getByRole("link", { name: "収支簿出力" });
    expect(ledgerExportLink).toHaveAttribute(
      "href",
      "/api/exports/ledger.xlsx?year=2026",
    );
    const toggleScope = within(screen.getByRole("group", { name: "表示切り替え" }));
    const rateToggleScope = within(screen.getByRole("group", { name: "率表示" }));
    expect(await toggleScope.findByRole("button", { name: "円グラフ" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(toggleScope.getByRole("button", { name: "数値" })).toHaveAttribute("aria-pressed", "false");
    expect(rateToggleScope.getByRole("button", { name: "予算消化率" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(rateToggleScope.getByRole("button", { name: "残高率" })).toHaveAttribute("aria-pressed", "false");

    const fundCard = screen.getByRole("link", { name: /ACT-X/i });
    const fundCardScope = within(fundCard);

    const chart = fundCardScope.getByLabelText("ACT-X の予算内訳");
    expect(chart).toBeInTheDocument();
    expect(chart).toHaveAttribute("aria-describedby");
    expect(fundCardScope.queryByText("予算消化率 [%]")).not.toBeInTheDocument();
    expect(within(chart).getByText("93.2%")).toBeInTheDocument();

    const overBudgetCard = screen.getByRole("link", { name: /基盤研究費/i });
    const overBudgetScope = within(overBudgetCard);
    const overBudgetChart = overBudgetScope.getByLabelText("基盤研究費 の予算内訳");
    expect(within(overBudgetChart).getByText("超過")).toHaveClass("detail-rate-alert");
    expect(overBudgetChart.querySelector(".fund-card-over-budget-ring")).not.toBeNull();

    await user.click(rateToggleScope.getByRole("button", { name: "残高率" }));

    expect(rateToggleScope.getByRole("button", { name: "予算消化率" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(rateToggleScope.getByRole("button", { name: "残高率" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chart).getByText("6.8%")).toHaveClass("detail-rate-warning");

    await user.click(toggleScope.getByRole("button", { name: "数値" }));

    expect(toggleScope.getByRole("button", { name: "円グラフ" })).toHaveAttribute("aria-pressed", "false");
    expect(toggleScope.getByRole("button", { name: "数値" })).toHaveAttribute("aria-pressed", "true");
    expect(fundCardScope.queryByLabelText("ACT-X の予算内訳")).not.toBeInTheDocument();
    expect(fundCardScope.getByText("残高率 [%]")).toBeInTheDocument();
    expect(fundCardScope.getByText("6.8%")).toHaveClass("detail-rate-warning");

    expect(overBudgetScope.queryByLabelText("基盤研究費 の予算内訳")).not.toBeInTheDocument();
    expect(overBudgetScope.getByText("-10.0%")).toHaveClass("detail-rate-alert");
  });

  it("renders a zero-budget chart safely", async () => {
    mockOverviewResponse({
      totals: {
        assets: 0,
        committed: 0,
        actual: 0,
        freeBalance: 0,
      },
      funds: [
        buildOverviewFund({
          id: 9,
          name: "ゼロ予算",
          awarded_amount: 0,
          committed_amount: 0,
          actual_amount: 0,
          freeBalance: 0,
        }),
      ],
    });

    renderAppRoute("/");

    const zeroBudgetCard = await screen.findByRole("link", { name: /ゼロ予算/i });
    const zeroBudgetScope = within(zeroBudgetCard);

    const zeroBudgetChart = zeroBudgetScope.getByLabelText("ゼロ予算 の予算内訳");
    expect(zeroBudgetChart).toBeInTheDocument();
    expect(zeroBudgetChart).toHaveAttribute("aria-describedby");
    const zeroBudgetSummary = document.getElementById(zeroBudgetChart.getAttribute("aria-describedby") ?? "");
    expect(zeroBudgetSummary).not.toBeNull();
    expect(zeroBudgetSummary).toHaveTextContent("執行済 0円");
    expect(zeroBudgetSummary).toHaveTextContent("執行予定 0円");
    expect(zeroBudgetSummary).toHaveTextContent("残高 0円");
    expect(zeroBudgetCard.querySelector(".fund-card-donut-track")).not.toBeNull();
    const zeroBudgetMetrics = zeroBudgetCard.querySelector(".fund-card-chart-metrics");
    expect(zeroBudgetMetrics).not.toBeNull();
    const zeroBudgetMetricsScope = within(zeroBudgetMetrics as HTMLElement);
    expect(zeroBudgetMetricsScope.queryByText("交付額")).toBeNull();
    expect(zeroBudgetMetricsScope.getByText("消化額")).toBeInTheDocument();
    expect(zeroBudgetMetricsScope.getAllByText("0円")).toHaveLength(1);
  });

  it("uses the saved default rate metric and overview display mode when the URL does not override them", async () => {
    const user = userEvent.setup();

    window.localStorage.setItem(
      "budget-dashboard:settings",
      storedAppSettings({
        defaultRateMetric: "balance",
        defaultOverviewDisplayMode: "numeric",
      }),
    );

    mockOverviewResponse(actXOnlyOverview);

    const view = renderAppRoute("/");
    const page = within(view.container);

    await page.findByRole("link", { name: /ACT-X/i });
    const toggleScope = within(page.getByRole("group", { name: "表示切り替え" }));
    const rateToggleScope = within(page.getByRole("group", { name: "率表示" }));

    expect(toggleScope.getByRole("button", { name: "円グラフ" })).toHaveAttribute("aria-pressed", "false");
    expect(toggleScope.getByRole("button", { name: "数値" })).toHaveAttribute("aria-pressed", "true");
    expect(rateToggleScope.getByRole("button", { name: "予算消化率" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(rateToggleScope.getByRole("button", { name: "残高率" })).toHaveAttribute("aria-pressed", "true");
    expect(page.queryByLabelText("ACT-X の予算内訳")).not.toBeInTheDocument();
    expect(page.getByText("残高率 [%]")).toBeInTheDocument();

    await user.click(rateToggleScope.getByRole("button", { name: "予算消化率" }));

    expect(rateToggleScope.getByRole("button", { name: "予算消化率" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(rateToggleScope.getByRole("button", { name: "残高率" })).toHaveAttribute("aria-pressed", "false");
    expect(page.getByText("予算消化率 [%]")).toBeInTheDocument();
    expect(page.getByText("93.2%")).toBeInTheDocument();
  });

  it("renders an error message when the request fails", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    renderOverviewPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("概要を読み込めませんでした。");
  });

  it("keeps the summary context panel open by default and swaps the metric-specific content", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-15T09:00:00Z"));

    try {
      mockOverviewResponse({
        totals: {
          assets: 1000000,
          committed: 250000,
          actual: 150000,
          freeBalance: 600000,
        },
        monthlyStatus: [
          { month: "2026-04", committed: 50000, actual: 20000, balance: 930000 },
          { month: "2026-05", committed: 100000, actual: 60000, balance: 770000 },
          { month: "2026-06", committed: 100000, actual: 70000, balance: 600000 },
        ],
        linkedActualAmount: 100000,
        pendingPlannedCount: 4,
        crossAggregateCategories: [
          {
            crossAggregateCategory: "equipment",
            budgetAmount: 700000,
            plannedAmount: 180000,
            actualAmount: 90000,
          },
          {
            crossAggregateCategory: "travel",
            budgetAmount: 300000,
            plannedAmount: 70000,
            actualAmount: 60000,
          },
        ],
        funds: [
          buildOverviewFund({
            id: 1,
            name: "基盤研究費",
            awarded_amount: 600000,
            committed_amount: 180000,
            actual_amount: 120000,
            freeBalance: 300000,
          }),
          buildOverviewFund({
            id: 2,
            name: "ACT-X",
            awarded_amount: 400000,
            committed_amount: 70000,
            actual_amount: 30000,
            freeBalance: 300000,
          }),
        ],
      });

      renderOverviewPage();
      await vi.runAllTimersAsync();

      expect(document.querySelector(".overview-grid-with-context")).not.toBeNull();
      expect(screen.getByRole("button", { name: /^予算総額 1,000,000円$/ })).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      expect(screen.getByRole("heading", { name: "予算総額の分析" })).toBeInTheDocument();
      expect(screen.getByText("予算数")).toBeInTheDocument();
      expect(screen.getByText("2件")).toBeInTheDocument();
      expect(screen.getByText("計画化率")).toBeInTheDocument();
      expect(screen.getByText("40.0%")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /執行済額/ }));

      const panel = screen.getByLabelText("予算概要の分析");
      const panelScope = within(panel);
      expect(panelScope.getByRole("heading", { name: "執行済額の分析" })).toBeInTheDocument();
      expect(panelScope.getByLabelText("執行済額の大費目別内訳グラフ")).toBeInTheDocument();
      expect(panelScope.getByText("前月差")).toBeInTheDocument();
      expect(panelScope.getByText("+10,000円")).toBeInTheDocument();
      expect(panelScope.getByText("到達率")).toBeInTheDocument();
      expect(panelScope.getByText("15.0%")).toBeInTheDocument();
      const actualTrendChart = panelScope.getByLabelText("執行済額の月次推移グラフ");
      const actualTrendSummary = document.getElementById(actualTrendChart.getAttribute("aria-describedby") ?? "");
      expect(actualTrendSummary).not.toBeNull();
      expect(actualTrendSummary).toHaveTextContent("現在進捗 8.0%");

      fireEvent.click(screen.getByRole("button", { name: /^執行予定額 250,000円$/ }));

      expect(panelScope.getByRole("heading", { name: "執行予定額の分析" })).toBeInTheDocument();
      const committedTrendChart = panelScope.getByLabelText("執行予定額の月次推移グラフ");
      const committedTrendSummary = document.getElementById(committedTrendChart.getAttribute("aria-describedby") ?? "");
      expect(committedTrendSummary).not.toBeNull();
      expect(panelScope.getByText("予定残高")).toBeInTheDocument();
      expect(panelScope.getByText("計画済み支出の実行率")).toBeInTheDocument();
      expect(panelScope.getByText("28.6%")).toBeInTheDocument();
      expect(panelScope.getByText("未実行予定件数")).toBeInTheDocument();
      expect(panelScope.getByText("4件")).toBeInTheDocument();
      expect(committedTrendSummary).toHaveTextContent("現在進捗 20.0%");

      fireEvent.click(screen.getByRole("button", { name: /^残高 600,000円$/ }));

      expect(panelScope.getByRole("heading", { name: "残高の分析" })).toBeInTheDocument();
      expect(panelScope.getByText("未計画率")).toBeInTheDocument();
      expect(panelScope.getByText("60.0%")).toBeInTheDocument();
      expect(panelScope.queryByRole("heading", { name: "大費目別内訳" })).not.toBeInTheDocument();
      expect(panelScope.getByLabelText("残高の月次推移グラフ")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^残高 600,000円$/ }));

      expect(screen.getByLabelText("予算概要の分析")).toBeInTheDocument();
      expect(panelScope.getByRole("heading", { name: "残高の分析" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

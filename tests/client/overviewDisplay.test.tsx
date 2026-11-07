import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildOverviewFund,
  buildOverviewResponse,
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

function buildEmptyMonthlySummary(month = "2026-06") {
  return {
    fiscalYear: 2026,
    month,
    calculationBasis: "current_data",
    summary: {
      budgetAmount: 100000,
      actualCumulativeAmount: 0,
      actualAmount: 0,
      plannedAmount: 0,
      plannedRemainingAmount: 0,
      spendAndPlannedCumulativeAmount: 0,
      calculatedBalance: 100000,
    },
    funds: [],
    crossAggregateCategories: [],
  };
}

describe("Overview display", () => {
  beforeEach(() => {
    resetOverviewTestState();
  });

  afterEach(() => {
    cleanup();
  });

  it("switches each fund to its own categories, preserves numeric mode and returns to standard without fetching", async () => {
    const user = userEvent.setup();
    const rows = [
      { crossAggregateCategory: "equipment" as const, budgetAmount: 500000, plannedAmount: 0, actualAmount: 200000 },
      { crossAggregateCategory: "travel" as const, budgetAmount: 300000, plannedAmount: 300000, actualAmount: 0 },
    ];
    mockOverviewResponse({ totals: { assets: 1200000, actual: 300000, committed: 400000, freeBalance: 500000 },
      crossAggregateCategories: [...rows, { crossAggregateCategory: "other", budgetAmount: null, actualAmount: 100000, plannedAmount: 100000 }],
      funds: [buildOverviewFund({ name: "部分精算", awarded_amount: 1000000, actual_amount: 200000,
        committed_amount: 300000, freeBalance: 500000, crossAggregateCategories: [...rows].reverse() }),
        buildOverviewFund({ id: 2, name: "超過予算", awarded_amount: 200000, actual_amount: 100000,
          committed_amount: 100000, freeBalance: 0, crossAggregateCategories: [
            { crossAggregateCategory: "other", budgetAmount: null, actualAmount: 100000, plannedAmount: 100000 },
          ] }),
      ],
    });
    renderOverviewPage();
    const hero = within(await screen.findByRole("group", { name: "年度全体の指標" }));
    expect(hero.getAllByRole("button")).toHaveLength(4);
    for (const button of hero.getAllByRole("button")) expect(button).toHaveAttribute("aria-pressed", "false");
    expect(hero.getByText("残高 500,000円")).toBeInTheDocument();
    const first = within(screen.getByRole("link", { name: /部分精算/ }));
    const second = within(screen.getByRole("link", { name: /超過予算/ }));
    expect(first.getByRole("img", { name: "部分精算 の予算内訳" })).toBeInTheDocument();
    for (const [label, amount] of [["予算総額", "1,000,000円"], ["消化額", "500,000円"], ["執行済額", "200,000円"], ["執行予定額", "300,000円"]]) {
      await user.click(hero.getByRole("button", { name: new RegExp(`^${label} `) }));
      expect(first.getByRole("img", { name: `部分精算 の${label}の大費目別内訳グラフ` })).toHaveTextContent(amount);
      expect(first.getByRole("img")).toHaveAccessibleDescription(new RegExp(`${label} ${amount}`));
      expect(screen.getByRole("heading", { name: `${label}の内訳` })).toBeInTheDocument();
      if (label === "予算総額") {
        expect(first.getByText("(50.0%)")).toBeInTheDocument();
        expect(first.getByText("(30.0%)")).toBeInTheDocument();
        expect(first.getByText(/費目予算合計 800,000円.*交付額−費目予算.*200,000円/)).toBeInTheDocument();
        const arcs = first.getByRole("img").querySelectorAll("circle[stroke-dasharray]");
        const shares = Array.from(arcs).map((arc) => {
          const circumference = 2 * Math.PI * Number(arc.getAttribute("r"));
          return Number(arc.getAttribute("stroke-dasharray")?.split(" ")[0]) / circumference;
        });
        expect(shares[0]).toBeCloseTo(0.625);
        expect(shares[1]).toBeCloseTo(0.375);
        expect(shares.reduce((sum, share) => sum + share, 0)).toBeCloseTo(1);
        expect(first.getAllByRole("listitem").map((row) => within(row).getByText(/物品系|旅費系/).textContent))
          .toEqual(["物品系", "旅費系"]);
      }
    }
    await user.click(hero.getByRole("button", { name: /^消化額 / }));
    const panel = within(screen.getByRole("complementary", { name: "予算概要の分析" }));
    expect(panel.getByText("700,000円")).toBeInTheDocument();
    expect(panel.getByText("(71.4%)")).toBeInTheDocument();
    expect(panel.getByText("(42.9%)")).toBeInTheDocument();
    expect(first.getByText("(40.0%)")).toBeInTheDocument();
    expect(first.getByText("(60.0%)")).toBeInTheDocument();
    expect(second.getByText("その他")).toBeInTheDocument();
    expect(second.queryByText("旅費系")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "数値" }));
    expect(first.getByText("交付額")).toBeInTheDocument();
    await user.click(hero.getByRole("button", { name: /^執行済額 / }));
    expect(first.queryByRole("img")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "円グラフ" }));
    expect(first.getByRole("img", { name: /執行済額の大費目/ })).toBeInTheDocument();
    await user.click(hero.getByRole("button", { name: /^執行済額 / }));
    expect(first.getByRole("img", { name: "部分精算 の予算内訳" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "予算総額の内訳" })).toBeInTheDocument();
  });

  it("distinguishes missing, empty, unallocated and negative categories while preserving rates and warnings", async () => {
    const user = userEvent.setup();
    const missing = buildOverviewFund({ id: 1, name: "欠落" });
    delete (missing as Partial<typeof missing>).crossAggregateCategories;
    mockOverviewResponse({ funds: [missing,
      buildOverviewFund({ id: 2, name: "空", crossAggregateCategories: [] }),
      buildOverviewFund({ id: 3, name: "未配分", crossAggregateCategories: [
        { crossAggregateCategory: "equipment", budgetAmount: null, actualAmount: 20, plannedAmount: 30 },
      ] }),
      buildOverviewFund({ id: 4, name: "負値", awarded_amount: 0, actual_amount: -50, committed_amount: 0, freeBalance: 50, crossAggregateCategories: [
        { crossAggregateCategory: "travel", budgetAmount: 0, actualAmount: -50, plannedAmount: 0 },
      ] }),
    ] });
    renderOverviewPage();
    const hero = within(await screen.findByRole("group", { name: "年度全体の指標" }));
    await user.click(hero.getByRole("button", { name: /^予算総額 / }));
    expect(screen.getByText("大費目別内訳を表示できません。")).toBeInTheDocument();
    expect(screen.getByText("大費目データなし")).toBeInTheDocument();
    expect(screen.getByText("費目別予算が未設定")).toBeInTheDocument();
    await user.click(hero.getByRole("button", { name: /^執行済額 / }));
    const negative = within(screen.getByRole("link", { name: /負値/ }));
    expect(negative.getByText("正の金額がないため円弧を表示しません。")).toBeInTheDocument();
    expect(negative.getByText("(0.0%)")).toBeInTheDocument();
    expect(negative.getAllByText("-50円").length).toBeGreaterThan(0);
    for (const name of ["欠落", "空", "未配分"]) {
      expect(within(screen.getByRole("link", { name: new RegExp(`^${name} `) })).getByText("予算超過 100,000円"))
        .toBeInTheDocument();
    }
    const missingFund = within(screen.getByRole("link", { name: /欠落/ }));
    expect(missingFund.getByText("予算消化率 [%]")).toBeInTheDocument();
    expect(missingFund.getByText("110.0%")).toBeInTheDocument();
    await user.click(within(screen.getByRole("group", { name: "率表示" })).getByRole("button", { name: "残高率" }));
    expect(missingFund.getByText("残高率 [%]")).toBeInTheDocument();
    expect(missingFund.getByText("-10.0%")).toBeInTheDocument();
    expect(missingFund.queryByText("110.0%")).not.toBeInTheDocument();
  });

  it("uses zero percentages for a zero consumed total while keeping signed amounts", async () => {
    const user = userEvent.setup();
    mockOverviewResponse({ totals: { assets: 0, actual: 0, committed: 0, freeBalance: 0 },
      funds: [buildOverviewFund({ name: "支出", awarded_amount: 0, actual_amount: 50, committed_amount: 0, freeBalance: -50,
        crossAggregateCategories: [{ crossAggregateCategory: "equipment", budgetAmount: null, actualAmount: 50, plannedAmount: 0 }] }),
        buildOverviewFund({ id: 2, name: "返金", awarded_amount: 0, actual_amount: -50, committed_amount: 0, freeBalance: 50,
          crossAggregateCategories: [{ crossAggregateCategory: "travel", budgetAmount: null, actualAmount: -50, plannedAmount: 0 }] })],
      crossAggregateCategories: [
        { crossAggregateCategory: "equipment", budgetAmount: null, actualAmount: 50, plannedAmount: 0 },
        { crossAggregateCategory: "travel", budgetAmount: null, actualAmount: -50, plannedAmount: 0 },
      ],
    });
    renderOverviewPage();
    await user.click(await screen.findByRole("button", { name: /^消化額 / }));
    const panel = within(screen.getByRole("complementary", { name: "予算概要の分析" }));
    for (const name of ["支出", "返金", "物品系", "旅費系"]) {
      const row = panel.getByText(name).closest("li");
      expect(row).toHaveTextContent("(0.0%)");
      expect(row).toHaveTextContent(name === "返金" || name === "旅費系" ? "-50円" : "50円");
    }
    expect(panel.getByRole("img", { name: /大費目別/ })).toHaveAccessibleDescription(/物品系 50円 0.0%.*旅費系 -50円 0.0%/);
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
    expect(screen.getByRole("button", { name: /^消化額 7,087,000円/ })).toHaveTextContent("残高 3,159,706円");
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

    await user.click(screen.getByRole("button", { name: /^消化額 / }));
    const totalsBefore = screen.getByRole("group", { name: "年度全体の指標" }).textContent;
    const breakdownBefore = screen.getByRole("complementary", { name: "予算概要の分析" }).textContent;
    await user.selectOptions(projectTagSelect, "tag-1");
    expect(screen.getByRole("group", { name: "年度全体の指標" }).textContent).toBe(totalsBefore);
    expect(screen.getByRole("complementary", { name: "予算概要の分析" }).textContent).toBe(breakdownBefore);

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
    expect(screen.getByRole("heading", { name: "予算" })).toBeInTheDocument();
    const ledgerExportLink = screen.getByRole("link", { name: "収支簿出力" });
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
    expect(within(overBudgetChart).getByText("超過")).toBeInTheDocument();

    await user.click(rateToggleScope.getByRole("button", { name: "残高率" }));

    expect(rateToggleScope.getByRole("button", { name: "予算消化率" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(rateToggleScope.getByRole("button", { name: "残高率" })).toHaveAttribute("aria-pressed", "true");
    expect(within(chart).getByText("6.8%")).toBeInTheDocument();

    await user.click(toggleScope.getByRole("button", { name: "数値" }));

    expect(toggleScope.getByRole("button", { name: "円グラフ" })).toHaveAttribute("aria-pressed", "false");
    expect(toggleScope.getByRole("button", { name: "数値" })).toHaveAttribute("aria-pressed", "true");
    expect(fundCardScope.queryByLabelText("ACT-X の予算内訳")).not.toBeInTheDocument();
    expect(fundCardScope.getByText("残高率 [%]")).toBeInTheDocument();
    expect(fundCardScope.getByText("6.8%")).toBeInTheDocument();

    expect(overBudgetScope.queryByLabelText("基盤研究費 の予算内訳")).not.toBeInTheDocument();
    expect(overBudgetScope.getByText("-10.0%")).toBeInTheDocument();
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

  it("opens a lazy monthly summary from a month label while preserving overview query parameters", async () => {
    const user = userEvent.setup();
    const overview = buildOverviewResponse({
      totals: { assets: 1000000, committed: 250000, actual: 150000, freeBalance: 600000 },
      monthlyStatus: [
        { month: "2026-04", committed: 50000, actual: 20000, balance: 930000 },
        { month: "2026-05", committed: 100000, actual: 60000, balance: 770000 },
        { month: "2026-06", committed: 100000, actual: 70000, balance: 600000 },
      ],
    });
    const monthlySummary = {
      fiscalYear: 2026,
      month: "2026-06",
      calculationBasis: "current_data",
      summary: {
        budgetAmount: 1000000,
        actualCumulativeAmount: 150000,
        actualAmount: 70000,
        plannedAmount: 100000,
        plannedRemainingAmount: 100000,
        spendAndPlannedCumulativeAmount: 400000,
        calculatedBalance: 600000,
      },
      funds: [],
      crossAggregateCategories: [],
    };
    fetchMock.mockImplementation(async (input) => ({
      ok: true,
      status: 200,
      json: async () => String(input).startsWith("/api/overview/monthly-summary")
        ? monthlySummary
        : overview,
    }));

    const view = renderAppRoute("/?rate=balance&projectTag=tag-1");

    const monthLabel = await screen.findByRole("button", {
      name: "2026年6月の月ラベルから予算総額サマリを開く",
    });
    expect(
      fetchMock.mock.calls.some(([input]) => String(input).startsWith("/api/overview/monthly-summary")),
    ).toBe(false);

    await user.click(monthLabel);

    expect(await screen.findByRole("dialog", { name: "2026年6月の予算横断サマリ" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/overview/monthly-summary?year=2026&month=2026-06", {});
    const nextSearch = new URLSearchParams(view.router.state.location.search);
    expect(Object.fromEntries(nextSearch)).toEqual({
      rate: "balance",
      projectTag: "tag-1",
      year: "2026",
      month: "2026-06",
      summaryMetric: "assets",
    });
  });

  it.each([
    { metric: "actual", highlight: "累計執行済額", fundOrder: ["予算B", "予算A"], categoryOrder: ["物品系", "旅費系"], extra: null },
    { metric: "committed", highlight: "当月以降の未実行予定残高", fundOrder: ["予算A", "予算B"], categoryOrder: ["物品系", "旅費系"], extra: "140,000円" },
    { metric: "assets", highlight: "執行＋予定の累計", fundOrder: ["予算A", "予算B"], categoryOrder: ["物品系", "旅費系"], extra: "170,000円" },
    { metric: "consumed", highlight: "執行＋予定の累計", fundOrder: ["予算A", "予算B"], categoryOrder: ["物品系", "旅費系"], extra: "170,000円" },
    { metric: "balance", highlight: "月末の計算残高", fundOrder: ["予算B", "予算A"], categoryOrder: ["旅費系", "物品系"], extra: null },
  ])("opens $metric directly with the corresponding values, ordering and highlight", async ({ metric, highlight, fundOrder, categoryOrder, extra }) => {
    const overview = buildOverviewResponse({
      totals: { assets: 300000, committed: 80000, actual: 60000, freeBalance: 160000 },
      monthlyStatus: [
        { month: "2026-04", committed: 10000, actual: 10000, balance: 280000 },
        { month: "2026-05", committed: 20000, actual: 10000, balance: 250000 },
        { month: "2026-06", committed: 30000, actual: 40000, balance: 180000 },
      ],
    });
    const monthlySummary = {
      fiscalYear: 2026,
      month: "2026-06",
      calculationBasis: "current_data",
      summary: {
        budgetAmount: 300000,
        actualCumulativeAmount: 60000,
        actualAmount: 40000,
        plannedAmount: 30000,
        plannedRemainingAmount: 140000,
        spendAndPlannedCumulativeAmount: 170000,
        calculatedBalance: 130000,
      },
      funds: [
        {
          fundId: 1,
          fundName: "予算A",
          budgetAmount: 100000,
          actualCumulativeAmount: 20000,
          actualAmount: 10000,
          plannedAmount: 30000,
          plannedRemainingAmount: 90000,
          spendAndPlannedCumulativeAmount: 90000,
          calculatedBalance: 10000,
        },
        {
          fundId: 2,
          fundName: "予算B",
          budgetAmount: 200000,
          actualCumulativeAmount: 40000,
          actualAmount: 0,
          plannedAmount: 0,
          plannedRemainingAmount: 50000,
          spendAndPlannedCumulativeAmount: 80000,
          calculatedBalance: 120000,
        },
      ],
      crossAggregateCategories: [
        {
          crossAggregateCategory: "travel",
          budgetAmount: 120000,
          actualCumulativeAmount: 10000,
          actualAmount: 0,
          plannedAmount: 0,
          plannedRemainingAmount: 30000,
          spendAndPlannedCumulativeAmount: 20000,
          calculatedBalance: 100000,
        },
        {
          crossAggregateCategory: "equipment",
          budgetAmount: 180000,
          actualCumulativeAmount: 50000,
          actualAmount: 40000,
          plannedAmount: 30000,
          plannedRemainingAmount: 50000,
          spendAndPlannedCumulativeAmount: 120000,
          calculatedBalance: 60000,
        },
      ],
    };
    fetchMock.mockImplementation(async (input) => ({
      ok: true,
      status: 200,
      json: async () => String(input).startsWith("/api/overview/monthly-summary")
        ? monthlySummary
        : overview,
    }));

    const view = renderAppRoute(`/?year=2026&month=2026-06&summaryMetric=${metric}`);
    const dialog = within(await screen.findByRole("dialog", { name: "2026年6月の予算横断サマリ" }));
    const summary = within(await dialog.findByRole("region", { name: "月別概要" }));
    const cards = summary.getAllByRole("article");
    for (const [label, value] of [
      ["累計執行済額", "60,000円"], ["当月実績", "40,000円"],
      ["当月の未実行予定額", "30,000円"], ["月末の計算残高", "130,000円"],
    ]) {
      expect(cards.find((card) => within(card).queryByText(label))).toHaveTextContent(value);
    }
    if (extra !== null) {
      expect(cards.find((card) => within(card).queryByText(highlight))).toHaveTextContent(extra);
    }
    for (const label of ["当月以降の未実行予定残高", "執行＋予定の累計"]) {
      if (label !== highlight) expect(summary.queryByText(label)).not.toBeInTheDocument();
    }
    const table = dialog.getByRole("table", { name: "予算別一覧" });
    const categoryTable = dialog.getByRole("table", { name: "大費目別内訳" });
    for (const [element, order] of [[table, fundOrder], [categoryTable, categoryOrder]] as const) {
      const scope = within(element);
      expect(scope.getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(order);
      expect(scope.getByRole("columnheader", { name: highlight })).toHaveAttribute("data-highlighted", "true");
    }
    if (metric === "actual") {
      expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
        "予算名", "当月実績", "当月の未実行予定", "累計執行済額", "月末の計算残高",
      ]);
    }
    const fundB = within(within(table).getByRole("row", { name: /予算B/ }));
    expect(fundB.getAllByRole("cell")[0]).toHaveTextContent(/^0円$/);
    expect(dialog.getByText(/現在登録されている予定・実績を月別に配分した計算値/)).toBeInTheDocument();
    expect(dialog.getByRole("link", { name: "この月の明細を見る" })).toHaveAttribute(
      "href", "/search?year=2026&monthFrom=2026-06&monthTo=2026-06",
    );
    fireEvent.click(dialog.getByRole("button", { name: "月別サマリを閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(view.router.state.location.search).toBe("?year=2026");
  });

  it("switches months in place and closes through controls, Escape, and browser back", async () => {
    const user = userEvent.setup();
    const overview = buildOverviewResponse({
      monthlyStatus: [
        { month: "2026-04", committed: 0, actual: 0, balance: 100000 },
        { month: "2026-05", committed: 0, actual: 0, balance: 100000 },
        { month: "2026-06", committed: 0, actual: 0, balance: 100000 },
        { month: "2026-07", committed: 0, actual: 0, balance: 100000 },
      ],
    });
    fetchMock.mockImplementation(async (input) => {
      const path = String(input);
      const requestedMonth = new URL(path, "http://example.test").searchParams.get("month") ?? "2026-06";
      return {
        ok: true,
        status: 200,
        json: async () => path.startsWith("/api/overview/monthly-summary")
          ? {
              fiscalYear: 2026,
              month: requestedMonth,
              calculationBasis: "current_data",
              summary: {
                budgetAmount: 100000,
                actualCumulativeAmount: 0,
                actualAmount: 0,
                plannedAmount: 0,
                plannedRemainingAmount: 0,
                spendAndPlannedCumulativeAmount: 0,
                calculatedBalance: 100000,
              },
              funds: [],
              crossAggregateCategories: [],
            }
          : overview,
      };
    });
    const view = renderAppRoute("/?rate=balance");
    const monthLabel = await screen.findByRole("button", {
      name: "2026年6月の月ラベルから予算総額サマリを開く",
    });

    monthLabel.focus();
    await user.click(monthLabel);
    expect(await screen.findByRole("dialog", { name: "2026年6月の予算横断サマリ" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "翌月" }));
    expect(await screen.findByRole("dialog", { name: "2026年7月の予算横断サマリ" })).toBeInTheDocument();
    expect(new URLSearchParams(view.router.state.location.search).get("month")).toBe("2026-07");

    await user.click(screen.getByRole("button", { name: "前月" }));
    expect(await screen.findByRole("dialog", { name: "2026年6月の予算横断サマリ" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(view.router.state.location.search).toBe("?rate=balance&year=2026");
    expect(document.activeElement).toBe(monthLabel);

    await user.click(monthLabel);
    await screen.findByRole("dialog");
    await user.click(screen.getByRole("button", { name: "月別サマリを閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(document.activeElement).toBe(monthLabel);

    await user.click(monthLabel);
    await screen.findByRole("dialog");
    await view.router.navigate(-1);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(view.router.state.location.search).toBe("?rate=balance&year=2026");
  });

  it("shows a loading state inside the open dialog while the monthly request is pending", async () => {
    let resolveMonthlyRequest: ((value: {
      ok: boolean;
      status: number;
      json: () => Promise<ReturnType<typeof buildEmptyMonthlySummary>>;
    }) => void) | undefined;
    const monthlyRequest = new Promise<{
      ok: boolean;
      status: number;
      json: () => Promise<ReturnType<typeof buildEmptyMonthlySummary>>;
    }>((resolve) => {
      resolveMonthlyRequest = resolve;
    });
    const overview = buildOverviewResponse();
    fetchMock.mockImplementation(async (input) => {
      if (String(input).startsWith("/api/overview/monthly-summary")) {
        return monthlyRequest;
      }
      return {
        ok: true,
        status: 200,
        json: async () => overview,
      };
    });

    renderAppRoute("/?year=2026&month=2026-06&summaryMetric=balance");

    const dialog = await screen.findByRole("dialog", { name: "2026年6月の予算横断サマリ" });
    expect(within(dialog).getByRole("status")).toHaveTextContent("月別サマリを読み込み中");

    resolveMonthlyRequest?.({
      ok: true,
      status: 200,
      json: async () => buildEmptyMonthlySummary(),
    });
    expect(await within(dialog).findByText(/現在登録されている予定・実績/)).toBeInTheDocument();
  });

  it("keeps the dialog open and retries after a monthly summary request fails", async () => {
    const user = userEvent.setup();
    const overview = buildOverviewResponse();
    let monthlyAttempts = 0;
    fetchMock.mockImplementation(async (input) => {
      if (!String(input).startsWith("/api/overview/monthly-summary")) {
        return {
          ok: true,
          status: 200,
          json: async () => overview,
        };
      }

      monthlyAttempts += 1;
      if (monthlyAttempts === 1) {
        return {
          ok: false,
          status: 503,
          json: async () => ({ code: "monthly_summary_unavailable", message: "temporary" }),
        };
      }

      return {
        ok: true,
        status: 200,
        json: async () => buildEmptyMonthlySummary(),
      };
    });

    renderAppRoute("/?year=2026&month=2026-06&summaryMetric=committed");

    const dialog = await screen.findByRole("dialog", { name: "2026年6月の予算横断サマリ" });
    const dialogScope = within(dialog);
    expect(await dialogScope.findByRole("alert")).toHaveTextContent("月別サマリを読み込めませんでした");
    expect(dialog).toBeInTheDocument();

    await user.click(dialogScope.getByRole("button", { name: "再試行" }));

    expect(await dialogScope.findByText(/現在登録されている予定・実績/)).toBeInTheDocument();
    expect(monthlyAttempts).toBe(2);
    expect(dialog).toBeInTheDocument();
  });

  it("opens from a wide data-point target and supports keyboard activation for points and month labels", async () => {
    const user = userEvent.setup();
    const overview = buildOverviewResponse({
      monthlyStatus: [
        { month: "2026-04", committed: 10000, actual: 10000, balance: 80000 },
        { month: "2026-05", committed: 0, actual: 10000, balance: 70000 },
        { month: "2026-06", committed: 10000, actual: 0, balance: 60000 },
      ],
    });
    fetchMock.mockImplementation(async (input) => ({
      ok: true,
      status: 200,
      json: async () => String(input).startsWith("/api/overview/monthly-summary")
        ? buildEmptyMonthlySummary()
        : overview,
    }));
    const view = renderAppRoute("/?year=2026");

    const dataPoint = await screen.findByRole("button", {
      name: "2026年6月の予算総額データ点からサマリを開く",
    });
    expect(dataPoint.querySelector(".overview-context-trend-hit-target")).toHaveAttribute("r", "12");

    dataPoint.focus();
    await user.keyboard("{Enter}");

    let dialog = await screen.findByRole("dialog", { name: "2026年6月の予算横断サマリ" });
    expect(new URLSearchParams(view.router.state.location.search).get("summaryMetric")).toBe("assets");
    expect(
      within(within(dialog).getByRole("table", { name: "予算別一覧" })).getByRole("columnheader", {
        name: "執行＋予定の累計",
      }),
    ).toHaveAttribute("data-highlighted", "true");

    await user.click(within(dialog).getByRole("button", { name: "月別サマリを閉じる" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

    await user.click(screen.getByRole("button", { name: /^消化額 / }));
    const monthLabel = screen.getByRole("button", {
      name: "2026年6月の月ラベルから消化額サマリを開く",
    });
    monthLabel.focus();
    await user.keyboard(" ");

    dialog = await screen.findByRole("dialog", { name: "2026年6月の予算横断サマリ" });
    expect(dialog).toBeInTheDocument();
    expect(new URLSearchParams(view.router.state.location.search).get("summaryMetric")).toBe("consumed");
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

      expect(screen.getByRole("button", { name: /^予算総額 1,000,000円$/ })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      expect(screen.getByRole("heading", { name: "予算総額の内訳" })).toBeInTheDocument();
      expect(screen.getByText("予算数")).toBeInTheDocument();
      expect(screen.getByText("2件")).toBeInTheDocument();
      expect(screen.getByText("計画化率")).toBeInTheDocument();
      expect(screen.getByText("40.0%")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /^執行済額 / }));

      const panel = screen.getByLabelText("予算概要の分析");
      const panelScope = within(panel);
      expect(panelScope.getByRole("heading", { name: "執行済額の内訳" })).toBeInTheDocument();
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

      expect(panelScope.getByRole("heading", { name: "執行予定額の内訳" })).toBeInTheDocument();
      const committedTrendChart = panelScope.getByLabelText("執行予定額の月次推移グラフ");
      const committedTrendSummary = document.getElementById(committedTrendChart.getAttribute("aria-describedby") ?? "");
      expect(committedTrendSummary).not.toBeNull();
      expect(panelScope.getByText("予定残高")).toBeInTheDocument();
      expect(panelScope.getByText("計画済み支出の実行率")).toBeInTheDocument();
      expect(panelScope.getByText("28.6%")).toBeInTheDocument();
      expect(panelScope.getByText("未実行予定件数")).toBeInTheDocument();
      expect(panelScope.getByText("4件")).toBeInTheDocument();
      expect(committedTrendSummary).toHaveTextContent("現在進捗 20.0%");

      fireEvent.click(screen.getByRole("button", { name: /^消化額 400,000円/ }));
      expect(panelScope.getByRole("heading", { name: "消化額の内訳" })).toBeInTheDocument();
      expect(panelScope.getByText("予算数")).toBeInTheDocument();
      expect(panelScope.getByText("計画化率")).toBeInTheDocument();
      expect(panelScope.getByLabelText("消化額の月次推移グラフ")).toBeInTheDocument();
      expect(panelScope.getByLabelText("消化額の大費目別内訳グラフ")).toBeInTheDocument();
      expect(panelScope.getByText("(67.5%)")).toBeInTheDocument();
      expect(panelScope.queryByText(/交付額との差/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /^消化額 400,000円/ }));
      expect(panelScope.getByRole("heading", { name: "予算総額の内訳" })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });
});

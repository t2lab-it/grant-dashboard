import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type {
  FiscalYearComparisonResponse,
  FiscalYearComparisonYear,
  FiscalYearState,
} from "../../src/contracts/fiscalYearComparison";
import { FiscalYearComparisonPage } from "../../src/features/fiscal-years/FiscalYearComparisonPage";
import { APP_SETTINGS_STORAGE_KEY, AppSettingsProvider } from "../../src/features/settings/AppSettings";
import { listFiscalYearMonths } from "../../src/lib/calendar";
import { storedAppSettings } from "./testUtils";

const fetchMock = vi.fn();

function comparisonYear(
  fiscalYear: number,
  state: FiscalYearState,
): FiscalYearComparisonYear {
  return {
    fiscalYear,
    state,
    totals: {
      assets: fiscalYear === 2027 ? 2000000 : 1000000,
      committed: state === "past" ? 100000 : 300000,
      actual: state === "past" ? 800000 : 500000,
    },
    funds: fiscalYear === 2027
      ? [
          { id: 3, name: "基盤研究費", awardedAmount: 1200000, displayOrder: 1 },
          { id: 4, name: "翌年度研究費", awardedAmount: 800000, displayOrder: 2 },
        ]
      : [
          { id: 1, name: "基盤研究費", awardedAmount: 600000, displayOrder: 1 },
          { id: 2, name: "共同研究費", awardedAmount: 400000, displayOrder: 2 },
        ],
    crossAggregateCategories: [
      { crossAggregateCategory: "equipment", plannedAmount: 100000, actualAmount: 200000 },
      { crossAggregateCategory: "travel", plannedAmount: 50000, actualAmount: 100000 },
      { crossAggregateCategory: "personnel", plannedAmount: 0, actualAmount: 150000 },
      { crossAggregateCategory: "other", plannedAmount: 0, actualAmount: 50000 },
      { crossAggregateCategory: "unset", plannedAmount: 0, actualAmount: 0 },
    ],
    monthlyStatus: listFiscalYearMonths(fiscalYear).map((month, index) => ({
      month,
      committed: state === "past" || index !== 6 ? 0 : 300000,
      actual: index < 5 ? 100000 : 0,
    })),
  };
}

function okResponse(data: FiscalYearComparisonResponse) {
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/fiscal-years?year=2026"]}>
        <AppSettingsProvider>
          <FiscalYearComparisonPage />
        </AppSettingsProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function expectMatchingChartColor(barSegment: HTMLElement, donutSegment: SVGCircleElement) {
  const donutColor = donutSegment.getAttribute("stroke");
  expect(donutColor).toMatch(/^#[0-9a-f]{6}$/i);
  expect(barSegment).toHaveStyle({ backgroundColor: donutColor });
}

describe("FiscalYearComparisonPage", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  test("shows loading and error states without stale chart content", async () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    const loadingView = renderPage();
    expect(screen.getByText("年度比較を読み込み中...")).toBeInTheDocument();
    loadingView.unmount();

    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ code: "internal_error", message: "失敗" }),
    });
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent("年度比較を読み込めませんでした。");
    expect(screen.queryByRole("heading", { name: "年度別の予算総額" })).not.toBeInTheDocument();
  });

  test("shows the exact empty state when no fiscal years are registered", async () => {
    okResponse({ currentFiscalYear: 2026, fiscalYears: [] });
    renderPage();

    expect(
      await screen.findByText("比較できる年度がありません。年度別予算を登録またはインポートしてください。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2 })).not.toBeInTheDocument();
  });

  test("renders all four comparison sections even for one fiscal year", async () => {
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current")] });
    renderPage();

    expect(await screen.findByRole("heading", { name: "年度横断サマリー" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "年度別の予算総額" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "各年度の予算構成比" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "横断集計カテゴリの構成比" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "月別の執行ペース" })).toBeInTheDocument();
  });

  test("renders descending linked budget rows and donut regions with accessible values", async () => {
    okResponse({
      currentFiscalYear: 2026,
      fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2027, "future")],
    });
    renderPage();

    await screen.findByRole("heading", { name: "年度横断サマリー" });
    const links = screen.getAllByRole("link", { name: /年度の年度ページを開く/ });
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveAttribute("href", "/?year=2027");
    expect(links[1]).toHaveAttribute("href", "/?year=2026");
    expect(links[2]).toHaveAttribute("href", "/?year=2027");
    expect(links[3]).toHaveAttribute("href", "/?year=2026");
    expect(links[4]).toHaveAttribute("href", "/?year=2027");
    expect(links[5]).toHaveAttribute("href", "/?year=2026");

    const budgetChart = screen.getByRole("group", { name: /年度別の予算総額。共通軸/ });
    expect(within(budgetChart).getByText("2027年度")).toBeInTheDocument();
    expect(within(links[0]).getByText("2,000,000円")).toBeInTheDocument();
    expect(screen.getByText(/2027年度 物品系 300,000円/)).toBeInTheDocument();
    expect(screen.getAllByRole("img", { name: /年度の横断集計カテゴリ構成比グラフ/ })).toHaveLength(2);
  });

  test("shows awarded budget names, amounts, and percentages", async () => {
    okResponse({
      currentFiscalYear: 2026,
      fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2027, "future")],
    });
    renderPage();

    const heading = await screen.findByRole("heading", { name: "各年度の予算構成比" });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    const scope = within(section!);
    const currentCard = scope.getByRole("link", { name: "2026年度の年度ページを開く" });
    expect(within(currentCard).getByText("基盤研究費")).toBeInTheDocument();
    expect(within(currentCard).getByText("600,000円")).toBeInTheDocument();
    expect(within(currentCard).getByText("60.0%")).toBeInTheDocument();
  });
  test("uses the largest budget total as the shared-axis endpoint", async () => {
    const current = comparisonYear(2026, "current");
    const future = comparisonYear(2027, "future");
    current.totals.assets = 987654;
    future.totals.assets = 1234567;
    okResponse({ currentFiscalYear: 2026, fiscalYears: [current, future] });
    renderPage();

    const budgetChart = await screen.findByRole("group", { name: /年度別の予算総額。共通軸/ });
    expect(within(budgetChart).getByText("0円")).toBeInTheDocument();
    expect(within(budgetChart).getByText("500,000円")).toBeInTheDocument();
    expect(within(budgetChart).getByText("1,000,000円")).toBeInTheDocument();
    expect(budgetChart).toHaveAccessibleName("年度別の予算総額。共通軸の最大値は1,234,567円です。");
  });

  test("switches the budget-total breakdown between funds and cross-aggregate categories", async () => {
    const user = userEvent.setup();
    okResponse({
      currentFiscalYear: 2026,
      fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2027, "future")],
    });
    renderPage();

    const heading = await screen.findByRole("heading", { name: "年度別の予算総額" });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    const scope = within(section!);
    const toggle = scope.getByRole("group", { name: "年度別の予算総額の色分け" });
    const fundButton = within(toggle).getByRole("button", { name: "予算構成" });
    const categoryButton = within(toggle).getByRole("button", { name: "横断集計カテゴリ" });
    const monthButton = within(toggle).getByRole("button", { name: "月別執行額" });

    expect(fundButton).toHaveAttribute("aria-pressed", "true");
    expect(categoryButton).toHaveAttribute("aria-pressed", "false");
    expect(monthButton).toHaveAttribute("aria-pressed", "false");
    expect(scope.queryByText("執行済")).not.toBeInTheDocument();
    expect(scope.queryByText("執行予定")).not.toBeInTheDocument();
    expect(scope.queryByText("残高")).not.toBeInTheDocument();
    expect(scope.queryByText("見込み 80%")).not.toBeInTheDocument();
    expect(scope.queryByText("予定 40%")).not.toBeInTheDocument();

    const fundBarSegment = scope.getByRole("img", { name: "2026年度 基盤研究費 600,000円" });
    const fundDonut = screen.getByRole("img", { name: "2026年度の予算構成比グラフ" });
    const fundDonutSegment = fundDonut.querySelector<SVGCircleElement>("circle[stroke]");
    expect(fundDonutSegment).not.toBeNull();
    expectMatchingChartColor(fundBarSegment, fundDonutSegment!);

    await user.click(categoryButton);

    expect(fundButton).toHaveAttribute("aria-pressed", "false");
    expect(categoryButton).toHaveAttribute("aria-pressed", "true");
    expect(scope.getByText("物品系")).toBeInTheDocument();
    const categoryBarSegment = scope.getByRole("img", { name: "2026年度 物品系 300,000円" });
    const categoryDonut = screen.getByRole("img", { name: "2026年度の横断集計カテゴリ構成比グラフ" });
    const categoryDonutSegment = categoryDonut.querySelector<SVGCircleElement>("circle[stroke]");
    expect(categoryDonutSegment).not.toBeNull();
    expectMatchingChartColor(categoryBarSegment, categoryDonutSegment!);
  });

  test("renders monthly execution as an amount-weighted viridis heatmap", async () => {
    const user = userEvent.setup();
    const future = comparisonYear(2027, "future");
    future.monthlyStatus = future.monthlyStatus.map((row, index) => ({
      ...row,
      actual: (index + 1) * 1000,
      committed: 0,
    }));
    okResponse({ currentFiscalYear: 2026, fiscalYears: [future] });
    renderPage();

    const heading = await screen.findByRole("heading", { name: "年度別の予算総額" });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    const scope = within(section!);
    await user.click(scope.getByRole("button", { name: "月別執行額" }));

    expect(scope.getByRole("button", { name: "月別執行額" })).toHaveAttribute("aria-pressed", "true");
    const monthLabels = ["4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月", "3月"];
    const viridisColors = [
      "#440154", "#482173", "#433e85", "#38588c", "#2d708e", "#25858e",
      "#1e9b8a", "#2ab07f", "#51c56a", "#86d549", "#c2df23", "#fde725",
    ];

    const monthSegments = monthLabels.map((label, index) => (
      scope.getByRole("img", {
        name: `2027年度 ${label} ${((index + 1) * 1000).toLocaleString("ja-JP")}円`,
      })
    ));
    const heatmap = monthSegments[0].parentElement;
    expect(heatmap).not.toBeNull();
    monthSegments.forEach((segment) => expect(segment.parentElement).toBe(heatmap));

    expect(heatmap).toHaveStyle({ width: "3.9%" });
    const heatmapStyle = heatmap!.getAttribute("style");
    expect(heatmapStyle).toContain("linear-gradient(to right");
    viridisColors.forEach((color) => expect(heatmapStyle).toContain(color));
    expect(heatmapStyle).toContain("#482173 2.56%");
    expect(heatmapStyle).toContain("#fde725 100%");
    expect(parseFloat(monthSegments[0].style.width)).toBeCloseTo(1.282, 3);
    monthSegments.forEach((segment) => {
      expect(segment.style.backgroundColor).toBe("");
    });
  });

  test("summarizes the monthly palette with a colorbar labeled only at the fiscal-year endpoints", async () => {
    const user = userEvent.setup();
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2027, "future")] });
    renderPage();

    const heading = await screen.findByRole("heading", { name: "年度別の予算総額" });
    const section = heading.closest("section");
    expect(section).not.toBeNull();
    const scope = within(section!);
    await user.click(scope.getByRole("button", { name: "月別執行額" }));

    const legend = scope.getByRole("group", { name: "月別執行額の凡例" });
    expect(within(legend).getByText("4月")).toBeInTheDocument();
    expect(within(legend).getByText("3月")).toBeInTheDocument();
    ["5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月", "1月", "2月"].forEach((label) => {
      expect(within(legend).queryByText(label)).not.toBeInTheDocument();
    });
    const colorbar = within(legend).getByRole("img", { name: "4月から3月の月別執行額カラーバー" });
    expect(colorbar).toBeInTheDocument();
    expect(colorbar.getAttribute("style")).toContain("linear-gradient(to right");
    expect(colorbar.getAttribute("style")).toContain("#440154");
    expect(colorbar.getAttribute("style")).toContain("#fde725");
    await user.hover(within(colorbar).getByTitle("4月"));
    const april = scope.getByRole("img", { name: /2027年度 4月 / });
    const may = scope.getByRole("img", { name: /2027年度 5月 / });
    expect(april).toHaveStyle({ opacity: "1" });
    expect(may).toHaveStyle({ opacity: "0.85" });
    await user.unhover(within(colorbar).getByTitle("4月"));
    expect(may).toHaveStyle({ opacity: "1" });
  });

  test("highlights matching chart regions while hovering legends and restores them on leave", async () => {
    const user = userEvent.setup();
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2027, "future")] });
    renderPage();
    const budget = (await screen.findByRole("heading", { name: "年度別の予算総額" })).closest("section")!;
    await user.hover(within(budget).getByText("基盤研究費"));
    expect(within(budget).getByRole("img", { name: "2026年度 基盤研究費 600,000円" })).toHaveStyle({ opacity: "1" });
    expect(within(budget).getByRole("img", { name: "2027年度 基盤研究費 1,200,000円" })).toHaveStyle({ opacity: "1" });
    const otherFund = within(budget).getByRole("img", { name: "2026年度 共同研究費 400,000円" });
    expect(otherFund).toHaveStyle({ opacity: "0.2" });
    await user.unhover(within(budget).getByText("基盤研究費"));
    expect(otherFund).toHaveStyle({ opacity: "1" });

    const categories = screen.getByRole("heading", { name: "横断集計カテゴリの構成比" }).closest("section")!;
    await user.hover(within(categories).getByText("物品系"));
    const circles = within(categories).getByRole("img", { name: "2026年度の横断集計カテゴリ構成比グラフ" }).querySelectorAll("circle[stroke]");
    expect(circles[0]).toHaveAttribute("opacity", "1");
    expect(circles[0]).toHaveAttribute("stroke-width", "20");
    expect(circles[1]).toHaveAttribute("opacity", "0.2");
    await user.unhover(within(categories).getByText("物品系"));
    expect(circles[1]).toHaveAttribute("opacity", "1");

    const funds = screen.getByRole("heading", { name: "各年度の予算構成比" }).closest("section")!;
    await user.hover(within(funds).getAllByText("基盤研究費")[0]);
    const fundCircles = within(funds).getByRole("img", { name: "2027年度の予算構成比グラフ" }).querySelectorAll("circle[stroke]");
    expect(fundCircles[0]).toHaveAttribute("stroke-width", "20");
    expect(fundCircles[1]).toHaveAttribute("opacity", "0.2");

    const pace = screen.getByRole("heading", { name: "月別の執行ペース" }).closest("section")!;
    await user.hover(within(pace).getByText("2026年度"));
    const groups = pace.querySelectorAll("g[opacity]");
    expect([...groups].map((group) => group.getAttribute("opacity")).sort()).toEqual(["0.2", "1"]);
    await user.hover(within(pace).getByText("実績（実線）"));
    expect(pace.querySelector("path[stroke-dasharray]")).toHaveAttribute("opacity", "0.2");
    await user.unhover(within(pace).getByText("実績（実線）"));
    expect(pace.querySelector("path[stroke-dasharray]")).toHaveAttribute("opacity", "1");
  });

  test("highlights legends from chart segments and clears them on leave", async () => {
    const user = userEvent.setup();
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current")] });
    renderPage();
    const budget = (await screen.findByRole("heading", { name: "年度別の予算総額" })).closest("section")!;
    const bar = within(budget).getByRole("img", { name: "2026年度 基盤研究費 600,000円" });
    await user.hover(bar);
    expect(within(budget).getByText("基盤研究費")).toHaveAttribute("data-legend-active", "true");
    await user.unhover(bar);
    expect(within(budget).getByText("基盤研究費")).toHaveAttribute("data-legend-active", "false");
    await user.click(within(budget).getByRole("button", { name: "月別執行額" }));
    const month = within(budget).getAllByRole("img").find((element) => element.classList.contains("fiscal-year-budget-segment"))!;
    const monthLabel = month.getAttribute("aria-label")!.split(" ")[1];
    await user.hover(month);
    expect(within(budget).getByTitle(monthLabel)).toHaveAttribute("data-legend-active", "true");
    await user.unhover(month);
    expect(within(budget).getByTitle(monthLabel)).toHaveAttribute("data-legend-active", "false");

    for (const [heading, chartName, legendText] of [
      ["横断集計カテゴリの構成比", "2026年度の横断集計カテゴリ構成比グラフ", "物品系"],
      ["各年度の予算構成比", "2026年度の予算構成比グラフ", "基盤研究費"],
    ]) {
      const section = screen.getByRole("heading", { name: heading }).closest("section")!;
      const circle = within(section).getByRole("img", { name: chartName }).querySelector("circle[stroke]")!;
      const label = within(section).getByText(legendText).closest("[data-legend-active]")!;
      await user.hover(circle);
      expect(label).toHaveAttribute("data-legend-active", "true");
      await user.unhover(circle);
      expect(label).toHaveAttribute("data-legend-active", "false");
    }

    const pace = screen.getByRole("heading", { name: "月別の執行ペース" }).closest("section")!;
    for (const [selector, label] of [["path:not([stroke-dasharray])", "実績（実線）"], ["path[stroke-dasharray]", "見込み・予定（破線）"]]) {
      const path = pace.querySelector(selector)!;
      await user.hover(path);
      expect(within(pace).getByText("2026年度")).toHaveAttribute("data-legend-active", "true");
      expect(within(pace).getByText(label)).toHaveAttribute("data-legend-active", "true");
      await user.unhover(path);
      expect(within(pace).getByText("2026年度")).toHaveAttribute("data-legend-active", "false");
      expect(within(pace).getByText(label)).toHaveAttribute("data-legend-active", "false");
    }
  });

  test("links fund highlights between budget bars and fund donuts without affecting other breakdowns", async () => {
    const user = userEvent.setup();
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2027, "future")] });
    renderPage();
    const budget = (await screen.findByRole("heading", { name: "年度別の予算総額" })).closest("section")!;
    const funds = screen.getByRole("heading", { name: "各年度の予算構成比" }).closest("section")!;
    const bar = within(budget).getByRole("img", { name: "2026年度 基盤研究費 600,000円" });
    const barLegend = within(budget).getByText("基盤研究費");
    const donut = within(funds).getByRole("img", { name: "2027年度の予算構成比グラフ" });
    const circle = donut.querySelector("circle[stroke]")!;
    const fundLegend = within(funds).getAllByText("基盤研究費")[0].closest("li")!;
    for (const target of [bar, barLegend, circle, fundLegend]) {
      await user.hover(target);
      expect(barLegend).toHaveAttribute("data-legend-active", "true");
      for (const label of within(funds).getAllByText("基盤研究費")) {
        expect(label.closest("li")).toHaveAttribute("data-legend-active", "true");
      }
      expect(circle).toHaveAttribute("stroke-width", "20");
      expect(within(budget).getByRole("img", { name: "2026年度 共同研究費 400,000円" })).toHaveStyle({ opacity: "0.2" });
      await user.unhover(target);
      expect(barLegend).toHaveAttribute("data-legend-active", "false");
      expect(fundLegend).toHaveAttribute("data-legend-active", "false");
      expect(circle).toHaveAttribute("stroke-width", "16");
    }
    await user.click(within(budget).getByRole("button", { name: "横断集計カテゴリ" }));
    await user.hover(within(budget).getByText("物品系"));
    expect(funds.querySelector('[data-legend-active="true"]')).toBeNull();
    await user.hover(circle);
    expect(budget.querySelector('[data-legend-active="true"]')).toBeNull();
    expect(within(budget).getByRole("img", { name: "2026年度 物品系 300,000円" })).toHaveStyle({ opacity: "1" });
    await user.click(within(budget).getByRole("button", { name: "予算構成" }));
    expect(funds.querySelector('[data-legend-active="true"]')).toBeNull();
    expect(budget.querySelector('[data-legend-active="true"]')).toBeNull();
  });

  test("shares year highlighting across the whole page and clears it when leaving", async () => {
    const user = userEvent.setup();
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2027, "future")] });
    renderPage();
    await screen.findByRole("heading", { name: "年度横断サマリー" });
    const sections = ["年度別の予算総額", "各年度の予算構成比", "横断集計カテゴリの構成比"].map((name) => screen.getByRole("heading", { name }).closest("section")!);
    const pace = screen.getByRole("heading", { name: "月別の執行ペース" }).closest("section")!;
    const yearLegend = within(pace).getByText("2026年度");
    const targets = sections.map((section) => within(section).getByRole("link", { name: "2026年度の年度ページを開く" }));
    for (const target of [...targets, yearLegend]) {
      await user.hover(target);
      for (const section of sections) {
        expect(within(section).getByRole("link", { name: "2026年度の年度ページを開く" })).toHaveAttribute("data-year-muted", "false");
        expect(within(section).getByRole("link", { name: "2027年度の年度ページを開く" })).toHaveAttribute("data-year-muted", "true");
      }
      expect(yearLegend).toHaveAttribute("data-legend-active", "true");
      expect([...pace.querySelectorAll("g[opacity]")].map((g) => g.getAttribute("opacity")).sort()).toEqual(["0.2", "1"]);
      await user.unhover(target);
      expect(document.querySelector('[data-year-muted="true"]')).toBeNull();
      expect(yearLegend).toHaveAttribute("data-legend-active", "false");
    }
  });

  test("describes April-to-March actual and forecast pace", async () => {
    okResponse({
      currentFiscalYear: 2026,
      fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2025, "past")],
    });
    renderPage();

    const paceChart = await screen.findByRole("img", { name: /4月から3月までの累積執行率/ });
    expect(within(paceChart).getByText("4月")).toBeInTheDocument();
    expect(within(paceChart).getByText("3月")).toBeInTheDocument();
    expect(screen.getByText("実績（実線）")).toBeInTheDocument();
    expect(screen.getByText("見込み・予定（破線）")).toBeInTheDocument();
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/fiscal-year-comparison", {});
    });
  });

  test("uses the selected overview palette for fiscal-year category donuts", async () => {
    window.localStorage.setItem(
      APP_SETTINGS_STORAGE_KEY,
      storedAppSettings({
        themePreset: "custom:lab-standard",
        customChartPresets: [
          {
            id: "lab-standard",
            label: "研究室標準",
            palette: {
              actual: "#7c3aed",
              committed: "#f97316",
              balance: "#fff7ed",
              balanceBorder: "#c2410c",
            },
          },
        ],
      }),
    );
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current")] });
    const view = renderPage();

    await screen.findByRole("heading", { name: "年度横断サマリー" });

    expect(view.container.querySelector(".fiscal-year-category-donut circle[stroke='#7c3aed']")).toBeInTheDocument();
  });
  test("shows the donut center total in thousands of yen", async () => {
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current")] });
    renderPage();

    const chart = await screen.findByRole("img", { name: "2026年度の横断集計カテゴリ構成比グラフ" });
    expect(within(chart).getByText("650k円")).toBeInTheDocument();
  });
});

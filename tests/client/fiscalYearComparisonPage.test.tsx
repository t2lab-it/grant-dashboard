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

  test("uses an ordered twelve-color viridis scale for monthly execution amounts", async () => {
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

    monthLabels.forEach((label, index) => {
      expect(scope.getByText(label)).toBeInTheDocument();
      expect(scope.getByRole("img", {
        name: `2027年度 ${label} ${((index + 1) * 1000).toLocaleString("ja-JP")}円`,
      })).toHaveStyle({ backgroundColor: viridisColors[index] });
    });
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

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
    expect(screen.queryByText("予算総額、カテゴリ構成、執行時期を年度間で比較します。")).not.toBeInTheDocument();
    expect(screen.queryByText("終了年度は最終実績、進行年度と未来年度は消化見込み")).not.toBeInTheDocument();
    expect(screen.queryByText("4月から3月までの累積執行率を年度間で比較")).not.toBeInTheDocument();
  });

  test("renders descending linked budget rows and donut regions with accessible values", async () => {
    okResponse({
      currentFiscalYear: 2026,
      fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2027, "future")],
    });
    const view = renderPage();

    await screen.findByRole("heading", { name: "年度横断サマリー" });
    const links = screen.getAllByRole("link", { name: /年度の年度ページを開く/ });
    expect(links).toHaveLength(6);
    expect(links[0]).toHaveAttribute("href", "/?year=2027");
    expect(links[1]).toHaveAttribute("href", "/?year=2026");
    expect(links[2]).toHaveAttribute("href", "/?year=2027");
    expect(links[3]).toHaveAttribute("href", "/?year=2026");
    expect(links[4]).toHaveAttribute("href", "/?year=2027");
    expect(links[5]).toHaveAttribute("href", "/?year=2026");
    expect(screen.queryByText(/年度ページへ/)).not.toBeInTheDocument();

    const budgetChart = screen.getByRole("group", { name: /年度別の予算総額/ });
    expect(within(budgetChart).getByText("2027年度")).toBeInTheDocument();
    expect(within(links[0]).getByText("2,000,000円")).toBeInTheDocument();
    expect(screen.getByText(/2027年度 物品系 300,000円/)).toBeInTheDocument();
    expect(view.container.querySelectorAll(".fiscal-year-category-donut")).toHaveLength(2);
  });

  test("shows awarded budget legends and reuses exact-name colors across years", async () => {
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

    const currentChart = scope.getByRole("img", { name: "2026年度の予算構成比グラフ" });
    const futureChart = scope.getByRole("img", { name: "2027年度の予算構成比グラフ" });
    const currentShared = currentChart.querySelector("circle[data-fund-name='基盤研究費']");
    const futureShared = futureChart.querySelector("circle[data-fund-name='基盤研究費']");
    expect(currentShared).not.toBeNull();
    expect(futureShared).not.toBeNull();
    expect(currentShared).toHaveAttribute("stroke", futureShared?.getAttribute("stroke"));
  });

  test("uses the largest budget total as the shared-axis endpoint", async () => {
    const current = comparisonYear(2026, "current");
    const future = comparisonYear(2027, "future");
    current.totals.assets = 987654;
    future.totals.assets = 1234567;
    okResponse({ currentFiscalYear: 2026, fiscalYears: [current, future] });
    renderPage();

    const budgetChart = await screen.findByRole("group", { name: /年度別の予算総額/ });
    const axis = budgetChart.querySelector<HTMLElement>(".fiscal-year-budget-axis");
    expect(axis).not.toBeNull();
    expect(within(axis!).getByText("0円")).toBeInTheDocument();
    expect(within(axis!).getByText("500,000円")).toBeInTheDocument();
    expect(within(axis!).getByText("1,000,000円")).toBeInTheDocument();
    expect(within(axis!).getByText("1,234,567円")).toBeInTheDocument();
    expect(within(axis!).queryByText("1,500,000円")).not.toBeInTheDocument();
    expect(budgetChart).toHaveAccessibleName("年度別の予算総額。共通軸の最大値は1,234,567円です。");
  });

  test("describes April-to-March actual and forecast pace without linking chart lines", async () => {
    okResponse({
      currentFiscalYear: 2026,
      fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2025, "past")],
    });
    const view = renderPage();

    const paceChart = await screen.findByRole("img", { name: /4月から3月までの累積執行率/ });
    expect(within(paceChart).getByText("4月")).toBeInTheDocument();
    expect(within(paceChart).getByText("3月")).toBeInTheDocument();
    expect(screen.getByText("実績（実線）")).toBeInTheDocument();
    expect(screen.getByText("見込み・予定（破線）")).toBeInTheDocument();
    expect(view.container.querySelector("path[data-series='current-actual']")).toHaveAttribute(
      "stroke",
      "var(--fiscal-year-line-5)",
    );
    expect(view.container.querySelector("path[data-series='current-actual']")).toHaveAttribute(
      "stroke-width",
      "5",
    );
    expect(view.container.querySelector("path[data-series='past-actual']")).toHaveAttribute(
      "stroke",
      "var(--fiscal-year-line-0)",
    );
    expect(view.container.querySelector("path[data-series='past-actual']")).toHaveAttribute(
      "stroke-width",
      "3.5",
    );
    expect(view.container.querySelector("path[data-series='current-projection']")).toHaveAttribute(
      "stroke-dasharray",
    );
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

  test("omits fiscal-year category state labels", async () => {
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current"), comparisonYear(2025, "past")] });
    renderPage();

    await screen.findByRole("heading", { name: "年度横断サマリー" });

    expect(screen.queryByText("進行中・消化見込み")).not.toBeInTheDocument();
    expect(screen.queryByText("終了・最終実績")).not.toBeInTheDocument();
  });

  test("uses the overview donut geometry for fiscal-year category charts", async () => {
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current")] });
    const view = renderPage();

    await screen.findByRole("heading", { name: "年度横断サマリー" });

    const donut = view.container.querySelector(".fiscal-year-category-donut svg");
    expect(donut).toHaveAttribute("viewBox", "0 0 128 128");
    expect(donut?.querySelector("circle[r='45'][stroke-width='16']")).toBeInTheDocument();
  });

  test("shows the donut center total in thousands of yen", async () => {
    okResponse({ currentFiscalYear: 2026, fiscalYears: [comparisonYear(2026, "current")] });
    const view = renderPage();

    await screen.findByRole("heading", { name: "年度横断サマリー" });

    expect(view.container.querySelector(".fiscal-year-category-donut text")).toHaveTextContent("650k円");
    expect(view.container.querySelector(".fiscal-year-category-donut text")).toHaveClass("fiscal-year-category-total");
  });
});

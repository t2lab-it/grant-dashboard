import { useQuery } from "@tanstack/react-query";
import { PageStatusMessage } from "../../app/PageStatusMessage";
import type { FiscalYearComparisonResponse } from "../../contracts/fiscalYearComparison";
import { apiGet } from "../../lib/api";
import { formatTokyoMonthKey } from "../../lib/calendar";
import { queryKeys } from "../../lib/queryKeys";
import { getCrossAggregateChartColors, getOverviewChartPalette } from "../overview/overviewChart";
import { useAppSettings } from "../settings/AppSettings";
import { FiscalYearBudgetBars } from "./FiscalYearBudgetBars";
import { FiscalYearCategoryDonuts } from "./FiscalYearCategoryDonuts";
import { FiscalYearExecutionPaceChart } from "./FiscalYearExecutionPaceChart";
import { FiscalYearFundDonuts } from "./FiscalYearFundDonuts";
import { buildFiscalYearComparisonModel } from "./fiscalYearComparisonModel";

export function FiscalYearComparisonPage() {
  const { settings: { amountDisplayMode, customChartPresets, themePreset } } = useAppSettings();
  const { data, isError, isLoading } = useQuery({
    queryKey: queryKeys.fiscalYearComparison.all,
    queryFn: () => apiGet<FiscalYearComparisonResponse>("/api/fiscal-year-comparison"),
  });
  if (isLoading) return <PageStatusMessage kind="loading">年度比較を読み込み中...</PageStatusMessage>;
  if (isError || data === undefined) return <PageStatusMessage kind="error">年度比較を読み込めませんでした。</PageStatusMessage>;
  if (data.fiscalYears.length === 0) return <PageStatusMessage kind="empty">比較できる年度がありません。年度別予算を登録またはインポートしてください。</PageStatusMessage>;

  const model = buildFiscalYearComparisonModel(data, formatTokyoMonthKey(new Date()));
  const categoryColors = getCrossAggregateChartColors(getOverviewChartPalette(themePreset, customChartPresets));
  return (
    <div className="fiscal-year-comparison-page">
      <header className="fiscal-year-comparison-page-heading"><h1>年度横断サマリー</h1></header>
      <FiscalYearBudgetBars amountDisplayMode={amountDisplayMode} maxAssets={model.maxAssets} years={model.years} />
      <FiscalYearFundDonuts amountDisplayMode={amountDisplayMode} years={model.years} />
      <FiscalYearCategoryDonuts amountDisplayMode={amountDisplayMode} colors={categoryColors} years={model.years} />
      <FiscalYearExecutionPaceChart maxPaceRate={model.maxPaceRate} years={model.years} />
    </div>
  );
}

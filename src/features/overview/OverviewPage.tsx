import { WorkbookImportControl } from "../imports/WorkbookImportControl";
import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { PageStatusMessage } from "../../app/PageStatusMessage";
import {
  buildOverviewApiPath,
  getFiscalYearFromSearch,
  setFiscalYearInSearch,
  type FiscalYearOverviewFields,
} from "../../app/fiscalYear";
import { isStaticDemoMode } from "../../demo/staticDemoMode";
import { apiGet } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { getRateMetric, getRateMetricKey, getRateMetricLabel } from "../../lib/executionRate";
import { formatAmount, formatLocalDateTime } from "../../lib/format";
import { useAppSettings } from "../settings/AppSettings";
import { useWorkbookExportStatus } from "../exports/WorkbookExportStatus";
import type { ClassificationTag } from "../classifications/classificationTypes";
import type { YearEndRiskSummary } from "../../contracts/yearEndRisk";
import { isFiscalYearMonth, isMonthKey } from "../../contracts/monthlySummary";
import { OverviewFundChart } from "./OverviewFundChart";
import { MonthlySummaryDialog } from "./MonthlySummaryDialog";
import { OverviewSummaryPanel, type OverviewSummaryMetricKey } from "./OverviewSummaryPanel";
import {
  getOverviewChartPalette,
  type OverviewChartFund,
} from "./overviewChart";
import type { CrossAggregateCategory } from "../../contracts/crossAggregateCategory";
import { RateMetricToggle } from "../funds/RateMetricToggle";
import { setRateSearchParam } from "../funds/rateQueryParams";
import type { RateMetricKey } from "../../lib/executionRate";

type HeroCardStyle = CSSProperties & {
  "--hero-card-accent-start": string;
  "--hero-card-accent-end": string;
  "--hero-card-base": string;
  "--hero-card-border": string;
  "--hero-card-dark-top"?: string;
  "--hero-card-dark-bottom"?: string;
  "--hero-card-dark-glow"?: string;
  "--hero-card-dark-border"?: string;
  "--hero-card-dark-active-border"?: string;
};

function hexToRgba(hexColor: string, alpha: number) {
  const normalized = hexColor.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function createTintedHeroStyle(color: string): HeroCardStyle {
  return {
    "--hero-card-accent-start": "rgba(255, 255, 255, 0.96)",
    "--hero-card-accent-end": hexToRgba(color, 0.22),
    "--hero-card-base": hexToRgba(color, 0.12),
    "--hero-card-border": hexToRgba(color, 0.3),
    "--hero-card-dark-top": "rgba(26, 39, 58, 0.98)",
    "--hero-card-dark-bottom": "rgba(18, 28, 44, 0.98)",
    "--hero-card-dark-glow": hexToRgba(color, 0.26),
    "--hero-card-dark-border": hexToRgba(color, 0.34),
    "--hero-card-dark-active-border": hexToRgba(color, 0.52),
  };
}

export type OverviewResponse = FiscalYearOverviewFields & {
  totals: {
    assets: number;
    committed: number;
    actual: number;
    freeBalance: number;
  };
  monthlyStatus: Array<{
    month: string;
    committed: number;
    actual: number;
    balance: number;
  }>;
  linkedActualAmount: number;
  pendingPlannedCount: number;
  crossAggregateCategories: Array<{
    crossAggregateCategory: CrossAggregateCategory;
    budgetAmount: number | null;
    plannedAmount: number;
    actualAmount: number;
  }>;
  yearEndRisk: YearEndRiskSummary;
  latestImport: {
    id: number;
    source_filename: string;
    imported_at: string;
    warning_count: number;
    reconciliation_ok: boolean | null;
  } | null;
  tutorial: {
    eligibleDemoData: boolean;
  };
  funds: Array<{ id: number; projectTags: ClassificationTag[] } & OverviewChartFund>;
};

type ProjectTagFilterKey = "all" | "unassigned" | `tag-${number}`;

function getProjectTagFilterKey(tagId: number | null): ProjectTagFilterKey {
  return tagId === null ? "unassigned" : `tag-${tagId}`;
}

function isProjectTagFilterKey(value: string | null): value is ProjectTagFilterKey {
  return value === "all" || value === "unassigned" || /^tag-\d+$/.test(value ?? "");
}

function isOverviewSummaryMetric(value: string | null): value is OverviewSummaryMetricKey {
  return value === "assets" || value === "actual" || value === "committed" || value === "balance";
}

function projectTagFilterMatchesFund(
  filterKey: ProjectTagFilterKey,
  fund: { projectTags: ClassificationTag[] },
) {
  if (filterKey === "all") {
    return true;
  }

  if (filterKey === "unassigned") {
    return fund.projectTags.length === 0;
  }

  const tagId = Number(filterKey.replace("tag-", ""));
  return fund.projectTags.some((tag) => tag.id === tagId);
}

function getProjectTagFilterOptions(funds: Array<{ projectTags: ClassificationTag[] }>) {
  const tags = new Map<number, ClassificationTag>();
  let hasUnassigned = false;

  for (const fund of funds) {
    if (fund.projectTags.length === 0) {
      hasUnassigned = true;
      continue;
    }

    for (const tag of fund.projectTags) {
      tags.set(tag.id, tag);
    }
  }

  return {
    projectTags: Array.from(tags.values()).sort((a, b) => a.id - b.id),
    hasUnassigned,
  };
}

export function OverviewPage() {
  const { status } = useWorkbookExportStatus();
  const staticDemoMode = isStaticDemoMode();
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const requestedFiscalYear = getFiscalYearFromSearch(`?${searchParams.toString()}`);
  const [activeSummaryMetric, setActiveSummaryMetric] = useState<OverviewSummaryMetricKey>("assets");
  const {
    settings: {
      themePreset,
      customChartPresets,
      defaultRateMetric,
      defaultOverviewDisplayMode,
      amountDisplayMode,
      executionRateThresholds,
      balanceRateThresholds,
    },
  } = useAppSettings();
  const [displayMode, setDisplayMode] = useState<"chart" | "numeric">(defaultOverviewDisplayMode);
  const { data, isError, error, isFetching, refetch } = useQuery({
    queryKey: queryKeys.overview.detail(requestedFiscalYear),
    queryFn: () => apiGet<OverviewResponse>(buildOverviewApiPath(requestedFiscalYear)),
  });

  if (isError) {
    return <PageStatusMessage kind="error">概要を読み込めませんでした。<p>{error.message}</p><button type="button" disabled={isFetching} onClick={() => void refetch()}>再試行</button></PageStatusMessage>;
  }

  if (!data) {
    return <PageStatusMessage kind="loading">読み込み中...</PageStatusMessage>;
  }
  const selectedFiscalYear = data.selectedFiscalYear;

  const rateMetric = getRateMetricKey(searchParams.get("rate") ?? defaultRateMetric);
  const projectTagFilterOptions = getProjectTagFilterOptions(data.funds);
  const requestedProjectTagFilter = searchParams.get("projectTag");
  const projectTagFilter = isProjectTagFilterKey(requestedProjectTagFilter)
    ? requestedProjectTagFilter
    : "all";
  const validProjectTagFilterKeys = new Set<ProjectTagFilterKey>([
    "all",
    ...projectTagFilterOptions.projectTags.map((tag) => getProjectTagFilterKey(tag.id)),
    ...(projectTagFilterOptions.hasUnassigned ? ["unassigned" as const] : []),
  ]);
  const activeProjectTagFilter = validProjectTagFilterKeys.has(projectTagFilter)
    ? projectTagFilter
    : "all";
  const filteredFunds = data.funds.filter((fund) => projectTagFilterMatchesFund(activeProjectTagFilter, fund));
  const palette = getOverviewChartPalette(themePreset, customChartPresets);
  const monthlyStatus = data.monthlyStatus;
  const assetsHeroStyle: HeroCardStyle = {
    "--hero-card-accent-start": "rgba(255, 255, 255, 0.96)",
    "--hero-card-accent-end": "rgba(148, 163, 184, 0.16)",
    "--hero-card-base": "rgba(148, 163, 184, 0.08)",
    "--hero-card-border": "rgba(148, 163, 184, 0.24)",
    "--hero-card-dark-top": "rgba(27, 40, 58, 0.98)",
    "--hero-card-dark-bottom": "rgba(19, 30, 45, 0.98)",
    "--hero-card-dark-glow": "rgba(148, 163, 184, 0.18)",
    "--hero-card-dark-border": "rgba(148, 163, 184, 0.26)",
    "--hero-card-dark-active-border": "rgba(148, 163, 184, 0.42)",
  };
  const actualHeroStyle = createTintedHeroStyle(palette.actual);
  const committedHeroStyle = createTintedHeroStyle(palette.committed);
  const balanceHeroStyle: HeroCardStyle = {
    "--hero-card-accent-start": "rgba(255, 255, 255, 0.96)",
    "--hero-card-accent-end": palette.balance,
    "--hero-card-base": palette.balance,
    "--hero-card-border": palette.balanceBorder,
    "--hero-card-dark-top": "rgba(25, 38, 57, 0.98)",
    "--hero-card-dark-bottom": "rgba(18, 28, 43, 0.98)",
    "--hero-card-dark-glow": hexToRgba(palette.balance, 0.28),
    "--hero-card-dark-border": hexToRgba(palette.balanceBorder, 0.38),
    "--hero-card-dark-active-border": hexToRgba(palette.balanceBorder, 0.54),
  };

  function updateOverviewRateMetric(value: RateMetricKey) {
    const nextParams = new URLSearchParams(searchParams);
    setRateSearchParam(nextParams, value, defaultRateMetric);

    setSearchParams(nextParams, { replace: true });
  }

  function updateProjectTagFilter(value: ProjectTagFilterKey) {
    const nextParams = new URLSearchParams(searchParams);

    if (value === "all") {
      nextParams.delete("projectTag");
    } else {
      nextParams.set("projectTag", value);
    }

    setSearchParams(nextParams, { replace: true });
  }
  function openMonthlySummary(month: string) {
    if (selectedFiscalYear === null) {
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("year", String(selectedFiscalYear));
    nextParams.set("month", month);
    nextParams.set("summaryMetric", activeSummaryMetric);
    setSearchParams(nextParams, {
      state: { monthlySummaryBackgroundSearch: searchParams.toString() },
    });
  }

  function changeMonthlySummaryMonth(month: string) {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("month", month);
    setSearchParams(nextParams, {
      replace: true,
      state: location.state,
    });
  }

  function closeMonthlySummary() {
    const backgroundSearch =
      typeof location.state === "object"
      && location.state !== null
      && "monthlySummaryBackgroundSearch" in location.state
        ? location.state.monthlySummaryBackgroundSearch
        : undefined;

    if (typeof backgroundSearch === "string") {
      navigate(-1);
      return;
    }

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("month");
    nextParams.delete("summaryMetric");
    setSearchParams(nextParams, { replace: true });
  }

  const requestedSummaryMonth = searchParams.get("month");
  const requestedSummaryMetric = searchParams.get("summaryMetric");
  const visibleSummaryMonth = data.selectedFiscalYear !== null
    && requestedSummaryMonth !== null
    && isMonthKey(requestedSummaryMonth)
    && isFiscalYearMonth(data.selectedFiscalYear, requestedSummaryMonth)
    && isOverviewSummaryMetric(requestedSummaryMetric)
      ? requestedSummaryMonth
      : null;
  const heroCards: Array<{
    key: OverviewSummaryMetricKey;
    label: string;
    amount: number;
    style?: CSSProperties;
  }> = [
    { key: "assets", label: "予算総額", amount: data.totals.assets, style: assetsHeroStyle as CSSProperties },
    { key: "actual", label: "執行済額", amount: data.totals.actual, style: actualHeroStyle as CSSProperties },
    { key: "committed", label: "執行予定額", amount: data.totals.committed, style: committedHeroStyle as CSSProperties },
    { key: "balance", label: "残高", amount: data.totals.freeBalance, style: balanceHeroStyle as CSSProperties },
  ];
  const shouldShowFirstRunGuide = !staticDemoMode && (data.funds.length === 0 || data.latestImport === null);

  return (
    <section className="overview-grid overview-grid-with-context">
      {shouldShowFirstRunGuide ? (
        <section className="first-run-card" aria-labelledby="first-run-card-title">
          <div className="first-run-card-intro"><h2 id="first-run-card-title">はじめに</h2></div>
          <div className="first-run-actions">
            <section className="first-run-choice"><h3>デモで試す</h3><a className="detail-action-button" href="https://t2lab-it.github.io/grant-dashboard/">架空データのデモを開く</a></section>
            <section className="first-run-choice"><h3>自分のExcelを使う</h3><div className="first-run-choice-actions"><a className="detail-action-button" href="/api/imports/workbook/template.xlsx">テンプレートを取得</a><WorkbookImportControl /></div></section>
          </div>
          <details><summary>ローカルの利用手順</summary><p>Excelのfunds / categories / planned_items / actual_entriesシートへ入力し、インポートで件数と警告を確認します。</p><p>ローカルでデモを投入する <code>npm run seed:demo</code> は、現在のDBを架空データで置換します。</p><div className="first-run-doc-links"><a href="https://github.com/t2lab-it/grant-dashboard#readme">README を読む</a><a href="https://github.com/t2lab-it/grant-dashboard/blob/main/docs/workbook.md">Workbook 運用を読む</a></div></details>
        </section>
      ) : null}
      <div className="overview-hero-grid" role="group" aria-label="年度全体の指標" style={{ "--hero-card-min-width": `${Math.max(9, ...heroCards.map((card) => formatAmount(card.amount, amountDisplayMode).length * 0.65 + 3))}rem` } as CSSProperties}>
        {heroCards.map((card) => {
          const isActive = activeSummaryMetric === card.key;

          return (
            <button
              key={card.key}
              type="button"
              className="hero-card hero-card-button"
              style={card.style}
              data-tour-id={`overview-summary-card-${card.key}`}
              aria-controls="overview-summary-context"
              aria-expanded={isActive}
              aria-pressed={isActive}
              onClick={() => setActiveSummaryMetric(card.key)}
            >
              <p>{card.label}</p>
              <strong className="hero-card-amount">{formatAmount(card.amount, amountDisplayMode)}</strong>
            </button>
          );
        })}
      </div>
      {visibleSummaryMonth !== null && data.selectedFiscalYear !== null && isOverviewSummaryMetric(requestedSummaryMetric) ? (
        <MonthlySummaryDialog
          onMonthChange={changeMonthlySummaryMonth}
          amountDisplayMode={amountDisplayMode}
          fiscalYear={data.selectedFiscalYear}
          metric={requestedSummaryMetric}
          month={visibleSummaryMonth}
          onClose={closeMonthlySummary}
        />
      ) : null}
      <section className="overview-funds" aria-labelledby="overview-funds-heading">
      <header className="overview-section-header">
        <div className="overview-section-title-actions">
          <h2 id="overview-funds-heading">予算</h2>
          <Link className="detail-action-button" to={data.selectedFiscalYear === null ? "/funds/new" : `/funds/new${setFiscalYearInSearch("", data.selectedFiscalYear)}`}>＋ 予算を追加</Link>
        </div>
        <div className="overview-section-controls">
          <div className="overview-display-toggle" role="group" aria-label="表示切り替え">
            <button
              type="button"
              className="overview-display-toggle-button"
              aria-pressed={displayMode === "chart"}
              onClick={() => setDisplayMode("chart")}
            >
              円グラフ
            </button>
            <button
              type="button"
              className="overview-display-toggle-button"
              aria-pressed={displayMode === "numeric"}
              onClick={() => setDisplayMode("numeric")}
            >
              数値
            </button>
          </div>
          <RateMetricToggle rateMetric={rateMetric} onRateMetricChange={updateOverviewRateMetric} />
          {projectTagFilterOptions.projectTags.length > 0 ? (
            <label className="overview-project-tag-select-field">
              <span>研究プロジェクトタグ</span>
              <select
                className="overview-project-tag-select"
                value={activeProjectTagFilter}
                onChange={(event) => {
                  if (isProjectTagFilterKey(event.target.value)) {
                    updateProjectTagFilter(event.target.value);
                  }
                }}
              >
                <option value="all">すべて</option>
                {projectTagFilterOptions.projectTags.map((tag) => {
                  const filterKey = getProjectTagFilterKey(tag.id);

                  return (
                    <option key={filterKey} value={filterKey}>
                      {tag.name}
                    </option>
                  );
                })}
                {projectTagFilterOptions.hasUnassigned ? <option value="unassigned">未設定</option> : null}
              </select>
            </label>
          ) : null}
          {staticDemoMode ? null : (
            <a
              className="detail-action-button"
              href={requestedFiscalYear === undefined
                ? "/api/exports/ledger.xlsx"
                : `/api/exports/ledger.xlsx?year=${requestedFiscalYear}`}
            >
              収支簿出力
            </a>
          )}
        </div>
      </header>
      {displayMode === "chart" ? (
        <div className="overview-shared-legend" aria-label="予算の共通凡例">
          {([ ["執行済", palette.actual], ["執行予定", palette.committed], ["残高", palette.balance] ] as const).map(([label, color]) => (
            <span key={label}><i className="fund-card-legend-chip" style={{ backgroundColor: color }} aria-hidden="true" />{label}</span>
          ))}
        </div>
      ) : null}
      <div className={displayMode === "chart" ? "fund-grid overview-fund-grid-chart" : "fund-grid"}>
        {filteredFunds.map((fund) => {
          const rate = getRateMetric(
            rateMetric,
            fund.awarded_amount,
            fund.committed_amount,
            fund.actual_amount,
            fund.freeBalance,
            executionRateThresholds,
            balanceRateThresholds,
          );
          const fundDetailParams = new URLSearchParams();
          if (data.selectedFiscalYear !== null) {
            fundDetailParams.set("year", String(data.selectedFiscalYear));
          }
          if (rateMetric !== "execution") {
            fundDetailParams.set("rate", rateMetric);
          }
          const fundDetailQuery = fundDetailParams.toString();
          const fundDetailHref = fundDetailQuery ? `/funds/${fund.id}?${fundDetailQuery}` : `/funds/${fund.id}`;

          return (
            <Link
              key={fund.id}
              to={fundDetailHref}
              className="fund-card"
              data-tour-id={fund.id === filteredFunds[0]?.id ? "overview-fund-card" : undefined}
            >
              <h3>{fund.name}</h3>
              {fund.projectTags.length > 0 ? (
                <div className="overview-fund-project-tags" aria-label={`${fund.name} の研究プロジェクトタグ`}>
                  {fund.projectTags.map((tag) => (
                    <span key={tag.id} className="classification-result-label">
                      <span
                        className="classification-color-swatch"
                        aria-hidden="true"
                        style={{ backgroundColor: tag.color }}
                      />
                      <span>{tag.name}</span>
                    </span>
                  ))}
                </div>
              ) : null}
              {displayMode === "chart" ? (
                <OverviewFundChart
                  legendMode="shared-on-wide"
                  fund={fund}
                  palette={palette}
                  rateMetric={rateMetric}
                  amountDisplayMode={amountDisplayMode}
                  executionRateThresholds={executionRateThresholds}
                  balanceRateThresholds={balanceRateThresholds}
                />
              ) : (
                <div className="fund-card-summary">
                  <p className="fund-card-row">
                    <span>交付額</span>
                    <strong>{formatAmount(fund.awarded_amount, amountDisplayMode)}</strong>
                  </p>
                  <p className="fund-card-row">
                    <span>執行予定額</span>
                    <strong>{formatAmount(fund.committed_amount, amountDisplayMode)}</strong>
                  </p>
                  <p className="fund-card-row">
                    <span>執行済額</span>
                    <strong>{formatAmount(fund.actual_amount, amountDisplayMode)}</strong>
                  </p>
                  <p className="fund-card-row">
                    <span>残高</span>
                    <strong>{formatAmount(fund.freeBalance, amountDisplayMode)}</strong>
                  </p>
                  <p className="fund-card-row">
                    <span>{getRateMetricLabel(rateMetric)}</span>
                    <strong className={rate.className}>{rate.label}</strong>
                  </p>
                </div>
              )}
            </Link>
          );
        })}
      </div>
      </section>
      <OverviewSummaryPanel
        id="overview-summary-context"
        metric={activeSummaryMetric}
        totals={data.totals}
        funds={data.funds}
        monthlyStatus={monthlyStatus}
        onSelectMonth={openMonthlySummary}
        linkedActualAmount={data.linkedActualAmount}
        pendingPlannedCount={data.pendingPlannedCount}
        crossAggregateCategories={data.crossAggregateCategories}
        palette={palette}
        balanceRateThresholds={balanceRateThresholds}
        amountDisplayMode={amountDisplayMode}
      />
      <section className="overview-latest-import" aria-label="直近インポート">
        <div className="overview-latest-import-row">
          <span className="overview-latest-import-label">直近インポート</span>
          {data.latestImport ? (
            <>
              <span className="overview-latest-import-item">{data.latestImport.source_filename}</span>
              <span className="overview-latest-import-item">{formatLocalDateTime(data.latestImport.imported_at)}</span>
              <Link
                to={`/imports/${data.latestImport.id}`}
                className="overview-latest-import-link"
              >
                {`警告 ${data.latestImport.warning_count}件`}
              </Link>
              <span
                className={
                  data.latestImport.reconciliation_ok
                    ? "overview-latest-import-status ok"
                    : "overview-latest-import-status warn"
                }
              >
                {data.latestImport.reconciliation_ok === null ? "照合履歴は読込不可" : data.latestImport.reconciliation_ok ? "照合OK" : "照合NG"}
              </span>
            </>
          ) : (
            <span className="overview-latest-import-item">まだインポート実行なし</span>
          )}
        </div>
        {status ? (
          <div className="overview-latest-import-row">
            <span className="overview-latest-import-label" role="status">
              直近エクスポート
            </span>
            <span className="overview-latest-import-item">{status.workbookPath}</span>
            <span className="overview-latest-import-item">{formatLocalDateTime(status.exportedAt)}</span>
          </div>
        ) : null}
      </section>
    </section>
  );
}

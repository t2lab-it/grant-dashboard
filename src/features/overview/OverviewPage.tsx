import { useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
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
import { OverviewFundChart } from "./OverviewFundChart";
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

type OverviewResponse = FiscalYearOverviewFields & {
  totals: {
    assets: number;
    committed: number;
    actual: number;
    freeBalance: number;
  };
  monthlyStatus?: Array<{
    month: string;
    committed: number;
    actual: number;
    balance: number;
  }>;
  linkedActualAmount?: number;
  pendingPlannedCount?: number;
  crossAggregateCategories?: Array<{
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
    reconciliation_ok: boolean;
  } | null;
  funds: Array<{ id: number; projectTags?: ClassificationTag[] } & OverviewChartFund>;
};

type ProjectTagFilterKey = "all" | "unassigned" | `tag-${number}`;

function getProjectTagFilterKey(tagId: number | null): ProjectTagFilterKey {
  return tagId === null ? "unassigned" : `tag-${tagId}`;
}

function isProjectTagFilterKey(value: string | null): value is ProjectTagFilterKey {
  return value === "all" || value === "unassigned" || /^tag-\d+$/.test(value ?? "");
}

function projectTagFilterMatchesFund(
  filterKey: ProjectTagFilterKey,
  fund: { projectTags?: ClassificationTag[] },
) {
  if (filterKey === "all") {
    return true;
  }

  const projectTags = fund.projectTags ?? [];
  if (filterKey === "unassigned") {
    return projectTags.length === 0;
  }

  const tagId = Number(filterKey.replace("tag-", ""));
  return projectTags.some((tag) => tag.id === tagId);
}

function getProjectTagFilterOptions(funds: Array<{ projectTags?: ClassificationTag[] }>) {
  const tags = new Map<number, ClassificationTag>();
  let hasUnassigned = false;

  for (const fund of funds) {
    const projectTags = fund.projectTags ?? [];
    if (projectTags.length === 0) {
      hasUnassigned = true;
      continue;
    }

    for (const tag of projectTags) {
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
  const { data, isError } = useQuery({
    queryKey: queryKeys.overview.detail(requestedFiscalYear),
    queryFn: () => apiGet<OverviewResponse>(buildOverviewApiPath(requestedFiscalYear)),
  });

  if (isError) {
    return <PageStatusMessage kind="error">概要を読み込めませんでした。</PageStatusMessage>;
  }

  if (!data) {
    return <PageStatusMessage kind="loading">読み込み中...</PageStatusMessage>;
  }

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
  const monthlyStatus = data.monthlyStatus ?? [];
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
          <div className="first-run-card-intro">
            <p className="eyebrow">ローカル設定</p>
            <h2 id="first-run-card-title">初回ローカル利用の準備</h2>
            <p>
              デモ用 seed で画面を試すか、テンプレートから自分の workbook を作って内容確認・インポートします。
            </p>
          </div>
          <div className="first-run-actions">
            <div className="first-run-step">
              <span className="first-run-step-number">1</span>
              <div>
                <h3>架空データで試す</h3>
                <p>ターミナルで実行すると、公開用のデモデータをローカル DB に投入できます。</p>
                <code>npm run seed:demo</code>
              </div>
            </div>
            <div className="first-run-step">
              <span className="first-run-step-number">2</span>
              <div>
                <h3>自分の workbook を作る</h3>
                <p>空のテンプレートをダウンロードして、funds / categories / planned / actual シートを入力します。</p>
                <a className="detail-action-button" href="/api/imports/workbook/template.xlsx">
                  template.xlsx をダウンロード
                </a>
              </div>
            </div>
            <div className="first-run-step">
              <span className="first-run-step-number">3</span>
              <div>
                <h3>内容を確認してからインポート</h3>
                <p>ヘッダーの <strong>インポート</strong> で `.xlsx` を選び、件数と警告を確認して取り込みます。</p>
              </div>
            </div>
            <div className="first-run-step">
              <span className="first-run-step-number">4</span>
              <div>
                <h3>手順を確認する</h3>
                <p>CLI の dry-run / import / backup コマンドを使う詳しい流れを確認できます。</p>
                <div className="first-run-doc-links">
                  <a href="https://github.com/t2lab-it/grant-dashboard#readme">README を読む</a>
                  <a href="https://github.com/t2lab-it/grant-dashboard/blob/main/docs/workbook.md">Workbook 運用を読む</a>
                </div>
              </div>
            </div>
          </div>
        </section>
      ) : null}
      <div className="overview-hero-grid">
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
      <OverviewSummaryPanel
        id="overview-summary-context"
        metric={activeSummaryMetric}
        totals={data.totals}
        funds={data.funds}
        monthlyStatus={monthlyStatus}
        linkedActualAmount={data.linkedActualAmount ?? 0}
        pendingPlannedCount={data.pendingPlannedCount ?? 0}
        crossAggregateCategories={data.crossAggregateCategories ?? []}
        palette={palette}
        balanceRateThresholds={balanceRateThresholds}
        amountDisplayMode={amountDisplayMode}
      />
      <header className="overview-section-header">
        <div className="overview-section-title-actions">
          <h2>予算別の状況</h2>
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
              <h2>{fund.name}</h2>
              {(fund.projectTags ?? []).length > 0 ? (
                <div className="overview-fund-project-tags" aria-label={`${fund.name} の研究プロジェクトタグ`}>
                  {(fund.projectTags ?? []).map((tag) => (
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
        <Link
          to={data.selectedFiscalYear === null
            ? "/funds/new"
            : `/funds/new${setFiscalYearInSearch("", data.selectedFiscalYear)}`}
          className="fund-card fund-card-create"
        >
          <h2>新規予算の追加</h2>
          <div className="fund-card-create-chart" aria-hidden="true">
            <span className="fund-card-create-plus">+</span>
          </div>
          <p className="fund-card-create-copy">新しい予算を登録して一覧に追加</p>
        </Link>
      </div>
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
                {data.latestImport.reconciliation_ok ? "照合OK" : "照合NG"}
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

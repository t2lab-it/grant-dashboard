import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, NavLink, useLocation, useNavigate, useRoutes } from "react-router-dom";
import type { HeaderAlertCategory, HeaderAlertDetail, HeaderAlertsResponse } from "../contracts/headerAlerts";
import { isStaticDemoMode } from "../demo/staticDemoMode";
import { WorkbookExportControl } from "../features/exports/WorkbookExportControl";
import { WorkbookExportStatusProvider } from "../features/exports/WorkbookExportStatus";
import { WorkbookImportControl } from "../features/imports/WorkbookImportControl";
import {
  AppSettingsProvider,
  type AppThemeMode,
  useAppSettings,
} from "../features/settings/AppSettings";
import { DemoTutorial } from "../features/tutorial/DemoTutorial";
import { apiGet } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { formatRatePercentage } from "../lib/executionRate";
import { formatAmount } from "../lib/format";
import { ModalShell } from "./ModalShell";
import {
  buildOverviewApiPath,
  buildPathWithFiscalYear,
  getFiscalYearFromSearch,
  isListLikeFiscalYearPath,
  setFiscalYearInSearch,
  type FiscalYearOverviewFields,
} from "./fiscalYear";
import { getBackgroundLocation } from "./routeModal";
import { getCreateEntryModalTitle, shellRoutes } from "./shellRoutes";

export function AppShell() {
  return (
    <AppSettingsProvider>
      <AppShellInner />
    </AppSettingsProvider>
  );
}

function getSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light" as const;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveAppTheme(mode: AppThemeMode) {
  return mode === "system" ? getSystemTheme() : mode;
}

function buildHeaderAlertsApiPath(fiscalYear: number) {
  return `/api/header-alerts?year=${fiscalYear}`;
}

function getHeaderAlertSummary(categories: HeaderAlertCategory[]) {
  if (categories.length === 0) {
    return "問題なし";
  }

  return categories.map((category) => `${category.label} ${category.count}`).join(" / ");
}

function getHeaderAlertTone(categories: HeaderAlertCategory[]) {
  if (categories.some((category) => category.severity === "danger")) {
    return "danger";
  }

  if (categories.length > 0) {
    return "warning";
  }

  return "clear";
}

function getHeaderAlertDetails(item: HeaderAlertCategory["items"][number]): HeaderAlertDetail[] {
  if (item.details !== undefined) {
    return item.details;
  }

  return (
    item.yearEndRisks?.map((risk) => ({
      id: risk.kind,
      label: risk.label,
      labelTone: risk.kind,
      amount: risk.amount,
      ...(risk.rate === undefined ? {} : { rate: risk.rate }),
    })) ?? []
  );
}

function formatHeaderAlertDetailAmount(detail: HeaderAlertDetail) {
  return formatAmount(detail.amount, "grouped-yen");
}

function formatHeaderAlertDetailRate(detail: HeaderAlertDetail) {
  return detail.rate === undefined ? null : `(${formatRatePercentage(detail.rate)})`;
}

function HeaderAlertGroupedDetails({ details }: { details: HeaderAlertDetail[] }) {
  const hasTitle = details.some((detail) => detail.title !== undefined);

  return (
    <span
      className={`app-alert-grouped-details${hasTitle ? " app-alert-grouped-details-with-title" : ""}`}
    >
      {details.map((detail) => (
        <span key={detail.id} className="app-alert-grouped-detail">
          <span className={`app-alert-grouped-badge ${detail.labelTone ?? "default"}`}>{detail.label}</span>
          {hasTitle ? <span className="app-alert-grouped-title">{detail.title ?? ""}</span> : null}
          <span className="app-alert-grouped-value">{formatHeaderAlertDetailAmount(detail)}</span>
          <span className="app-alert-grouped-rate">{formatHeaderAlertDetailRate(detail)}</span>
        </span>
      ))}
    </span>
  );
}

function HeaderAlertCategorySection({ category }: { category: HeaderAlertCategory }) {
  return (
    <section className="app-alert-panel-section">
      <h3>{`${category.label} ${category.count}`}</h3>
      {category.description === undefined ? null : (
        <p className="app-alert-category-description">{category.description}</p>
      )}
      <ul className="app-alert-detail-list">
        {category.items.map((item) => {
          const details = getHeaderAlertDetails(item);

          return (
            <li key={item.id}>
              <Link to={item.href} aria-label={item.title}>
                <span className="app-alert-detail-main">
                  <strong>{item.title}</strong>
                  {item.description === undefined ? null : <span>{item.description}</span>}
                  {details.length === 0 ? null : <HeaderAlertGroupedDetails details={details} />}
                </span>
                {item.amount !== undefined ? (
                  <span className="app-alert-detail-amount">{formatAmount(item.amount, "grouped-yen")}</span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function HeaderAlerts({ selectedFiscalYear }: { selectedFiscalYear: number | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const stripRef = useRef<HTMLDivElement | null>(null);
  const { data } = useQuery({
    queryKey: ["header-alerts", selectedFiscalYear],
    queryFn: () => apiGet<HeaderAlertsResponse>(buildHeaderAlertsApiPath(selectedFiscalYear ?? 0)),
    enabled: selectedFiscalYear !== null,
  });
  const primary = data?.primary ?? [];
  const supporting = data?.supporting ?? [];
  const isLoaded = data !== undefined;
  const summary = isLoaded ? getHeaderAlertSummary(primary) : "確認中";
  const tone = isLoaded ? getHeaderAlertTone(primary) : "clear";
  const panelId = "app-header-alert-panel";

  useEffect(() => {
    setIsOpen(false);
  }, [selectedFiscalYear]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const strip = stripRef.current;
      if (strip === null || !(event.target instanceof Node) || strip.contains(event.target)) {
        return;
      }

      setIsOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [isOpen]);

  if (selectedFiscalYear === null) {
    return null;
  }

  return (
    <div className="app-alert-strip" ref={stripRef}>
      <button
        type="button"
        className={`app-alert-bar app-alert-bar-${tone}`}
        aria-controls={panelId}
        aria-expanded={isOpen}
        disabled={!isLoaded}
        onClick={() => setIsOpen((current) => !current)}
      >
        {summary}
      </button>
      {isOpen ? (
        <div id={panelId} className="app-alert-panel" role="region" aria-label="アラート詳細">
          {primary.length === 0 ? (
            <p className="app-alert-empty">現在の年度で確認が必要な主要アラートはありません。</p>
          ) : (
            primary.map((category) => (
              <HeaderAlertCategorySection key={category.key} category={category} />
            ))
          )}
          {supporting.length > 0 ? (
            <section className="app-alert-panel-supporting">
              <h3>補助項目</h3>
              {supporting.map((category) => (
                <HeaderAlertCategorySection key={category.key} category={category} />
              ))}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function AppShellInner() {
  const {
    settings: { appThemeMode },
  } = useAppSettings();
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const backgroundLocation = getBackgroundLocation(location.state);
  const createEntryModalTitle = getCreateEntryModalTitle(location.pathname);
  const isCreateEntryModal = createEntryModalTitle !== null && backgroundLocation !== null;
  const baseLocation = backgroundLocation ?? location;
  const pageContent = useRoutes(shellRoutes, isCreateEntryModal ? backgroundLocation : location);
  const modalContent = useRoutes(shellRoutes, location);
  const requestedFiscalYear = getFiscalYearFromSearch(location.search);
  const { data: overviewData } = useQuery({
    queryKey: queryKeys.overview.detail(requestedFiscalYear),
    queryFn: () =>
      apiGet<
        FiscalYearOverviewFields & {
        tutorial?: { eligibleDemoData: boolean };
        funds: Array<{ id: number }>;
      }>(buildOverviewApiPath(requestedFiscalYear)),
  });
  const isDemoTutorialEligible = overviewData?.tutorial?.eligibleDemoData === true;
  const firstDemoFundId = overviewData?.funds?.[0]?.id;
  const staticDemoMode = isStaticDemoMode();
  const selectedFiscalYear = overviewData?.selectedFiscalYear ?? null;
  const availableFiscalYears = overviewData?.availableFiscalYears ?? [];
  const currentFiscalYear = getFiscalYearFromSearch(location.search);
  const needsFiscalYearSync = selectedFiscalYear !== null && currentFiscalYear !== selectedFiscalYear;

  function pathWithCurrentFiscalYear(pathname: string) {
    return selectedFiscalYear === null ? pathname : buildPathWithFiscalYear(pathname, "", selectedFiscalYear);
  }

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.dataset.theme = resolveAppTheme(appThemeMode);
    }

    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    if (appThemeMode !== "system") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleThemeChange() {
      document.documentElement.dataset.theme = resolveAppTheme(appThemeMode);
    }

    mediaQuery.addEventListener("change", handleThemeChange);
    return () => {
      mediaQuery.removeEventListener("change", handleThemeChange);
    };
  }, [appThemeMode]);

  useEffect(() => {
    if (selectedFiscalYear === null) {
      return;
    }

    if (currentFiscalYear === selectedFiscalYear) {
      return;
    }

    navigate(
      `${location.pathname}${setFiscalYearInSearch(location.search, selectedFiscalYear)}${location.hash}`,
      { replace: true },
    );
  }, [currentFiscalYear, location.hash, location.pathname, location.search, navigate, selectedFiscalYear]);

  function closeCreateEntryModal() {
    if (backgroundLocation === null) {
      return;
    }

    navigate(`${backgroundLocation.pathname}${backgroundLocation.search}${backgroundLocation.hash}`, {
      replace: true,
    });
  }

  async function resetStaticDemo() {
    const { resetStaticDemoStore } = await import("../demo/staticDemoState");
    resetStaticDemoStore();
    await queryClient.invalidateQueries();
  }

  function handleFiscalYearChange(nextFiscalYear: number) {
    if (isListLikeFiscalYearPath(location.pathname)) {
      navigate(
        `${location.pathname}${setFiscalYearInSearch(location.search, nextFiscalYear)}${location.hash}`,
      );
      return;
    }

    navigate(`/${setFiscalYearInSearch("", nextFiscalYear)}`);
  }

  return (
    <WorkbookExportStatusProvider>
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-primary-row">
            <div className="app-header-title-group">
              <h1>
                <NavLink to={pathWithCurrentFiscalYear("/")}>研究予算ダッシュボード</NavLink>
              </h1>
              {selectedFiscalYear !== null ? (
                <select
                  aria-label="年度"
                  className="app-fiscal-year-select"
                  onChange={(event) => handleFiscalYearChange(Number(event.target.value))}
                  value={String(selectedFiscalYear)}
                >
                  {availableFiscalYears.map((fiscalYear) => (
                    <option key={fiscalYear} value={String(fiscalYear)}>
                      {`${fiscalYear}年度`}
                    </option>
                  ))}
                </select>
              ) : null}
            </div>
            <nav aria-label="メインナビゲーション">
              <NavLink to={pathWithCurrentFiscalYear("/search")}>検索</NavLink>
              <NavLink to={pathWithCurrentFiscalYear("/planned-items/new")} state={{ backgroundLocation: baseLocation }}>
                予定作成
              </NavLink>
              <NavLink to={pathWithCurrentFiscalYear("/actual-entries/new")} state={{ backgroundLocation: baseLocation }}>
                実績作成
              </NavLink>
              {staticDemoMode ? (
                <button
                  type="button"
                  className="app-header-action-button"
                  onClick={resetStaticDemo}
                >
                  デモを初期状態に戻す
                </button>
              ) : (
                <>
                  <WorkbookImportControl />
                  <WorkbookExportControl />
                </>
              )}
              <NavLink to={pathWithCurrentFiscalYear("/settings")}>設定</NavLink>
            </nav>
          </div>
          {staticDemoMode ? (
            <div className="static-demo-notice" role="note">
              <span>静的デモでは実ファイルのインポート・エクスポートと SQLite は使えません。</span>
              <a href="https://github.com/t2lab-it/grant-dashboard#readme">ローカル利用の手順を読む</a>
            </div>
          ) : null}
          <HeaderAlerts selectedFiscalYear={selectedFiscalYear} />
        </header>
        <main className="app-main">{needsFiscalYearSync ? <div>読み込み中...</div> : pageContent}</main>
        <DemoTutorial
          eligible={isDemoTutorialEligible}
          firstFundId={firstDemoFundId}
          selectedFiscalYear={selectedFiscalYear}
        />
        {isCreateEntryModal ? (
          <ModalShell
            ariaLabel={createEntryModalTitle}
            className="budget-route-modal"
            onRequestClose={closeCreateEntryModal}
          >
            {modalContent}
          </ModalShell>
        ) : null}
      </div>
    </WorkbookExportStatusProvider>
  );
}

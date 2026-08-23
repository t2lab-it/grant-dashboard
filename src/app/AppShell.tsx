import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { NavLink, useLocation, useNavigate, useRoutes } from "react-router-dom";
import { isStaticDemoMode } from "../demo/staticDemoMode";
import { WorkbookExportControl } from "../features/exports/WorkbookExportControl";
import { WorkbookExportStatusProvider } from "../features/exports/WorkbookExportStatus";
import { WorkbookImportControl } from "../features/imports/WorkbookImportControl";
import {
  AppSettingsProvider,
  useAppSettings,
} from "../features/settings/AppSettings";
import { DemoTutorial } from "../features/tutorial/DemoTutorial";
import { apiGet } from "../lib/api";
import { queryKeys } from "../lib/queryKeys";
import { HeaderAlerts } from "./HeaderAlerts";
import { ModalShell } from "./ModalShell";
import { useAppThemeSync } from "./useAppThemeSync";
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


function AppShellInner() {
  const {
    settings: { appThemeMode },
  } = useAppSettings();
  useAppThemeSync(appThemeMode);
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const backgroundLocation = getBackgroundLocation(location.state);
  const createEntryModalTitle = getCreateEntryModalTitle(location.pathname);
  const isCreateEntryModal = createEntryModalTitle !== null && backgroundLocation !== null;
  const baseLocation = backgroundLocation ?? location;
  const isFiscalYearComparisonPage = baseLocation.pathname === "/fiscal-years";
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
      <div className={`app-shell${isFiscalYearComparisonPage ? " app-shell-fiscal-year-comparison" : ""}`}>
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
                  {[...availableFiscalYears].sort((a, b) => b - a).map((fiscalYear) => (
                    <option key={fiscalYear} value={String(fiscalYear)}>
                      {`${fiscalYear}年度`}
                    </option>
                  ))}
                </select>
              ) : null}
              <NavLink className="app-fiscal-year-comparison-link" to={pathWithCurrentFiscalYear("/fiscal-years")}>
                年度比較
              </NavLink>
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
          {isFiscalYearComparisonPage ? null : <HeaderAlerts selectedFiscalYear={selectedFiscalYear} />}
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

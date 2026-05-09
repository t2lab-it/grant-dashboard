import { lazy, Suspense, type ReactElement } from "react";
import type { RouteObject } from "react-router-dom";
import { PageStatusMessage } from "./PageStatusMessage";
import { OverviewPage } from "../features/overview/OverviewPage";

const ActualEntryForm = lazy(() =>
  import("../features/actual-entries/ActualEntryForm").then((module) => ({
    default: module.ActualEntryForm,
  })),
);
const FundDetailPage = lazy(() =>
  import("../features/funds/FundDetailPage").then((module) => ({
    default: module.FundDetailPage,
  })),
);
const NewFundForm = lazy(() =>
  import("../features/funds/NewFundForm").then((module) => ({
    default: module.NewFundForm,
  })),
);
const ImportDetailPage = lazy(() =>
  import("../features/imports/ImportDetailPage").then((module) => ({
    default: module.ImportDetailPage,
  })),
);
const ImportHistoryPage = lazy(() =>
  import("../features/imports/ImportHistoryPage").then((module) => ({
    default: module.ImportHistoryPage,
  })),
);
const PlannedItemForm = lazy(() =>
  import("../features/planned-items/PlannedItemForm").then((module) => ({
    default: module.PlannedItemForm,
  })),
);
const SearchPage = lazy(() =>
  import("../features/search/SearchPage").then((module) => ({
    default: module.SearchPage,
  })),
);
const SettingsPage = lazy(() =>
  import("../features/settings/SettingsPage").then((module) => ({
    default: module.SettingsPage,
  })),
);

function RouteLoadingFallback() {
  return <PageStatusMessage kind="loading">読み込み中...</PageStatusMessage>;
}

function lazyRoute(element: ReactElement) {
  return <Suspense fallback={<RouteLoadingFallback />}>{element}</Suspense>;
}

export const shellRoutes: RouteObject[] = [
  { index: true, element: <OverviewPage /> },
  { path: "imports", element: lazyRoute(<ImportHistoryPage />) },
  { path: "imports/:importId", element: lazyRoute(<ImportDetailPage />) },
  { path: "search", element: lazyRoute(<SearchPage />) },
  { path: "funds/new", element: lazyRoute(<NewFundForm />) },
  { path: "funds/:fundId", element: lazyRoute(<FundDetailPage />) },
  { path: "planned-items/new", element: lazyRoute(<PlannedItemForm />) },
  { path: "actual-entries/new", element: lazyRoute(<ActualEntryForm />) },
  { path: "settings", element: lazyRoute(<SettingsPage />) },
];

export function getCreateEntryModalTitle(pathname: string) {
  switch (pathname) {
    case "/planned-items/new":
      return "予定作成";
    case "/actual-entries/new":
      return "実績作成";
    default:
      return null;
  }
}

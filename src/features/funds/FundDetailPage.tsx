import { Fragment, useEffect, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { getFiscalYearFromSearch, setFiscalYearInSearch } from "../../app/fiscalYear";
import { PageStatusMessage } from "../../app/PageStatusMessage";
import { isStaticDemoMode } from "../../demo/staticDemoMode";
import { apiFetch } from "../../lib/api";
import { getRateMetric, getRateMetricKey, getRateMetricLabel } from "../../lib/executionRate";
import { formatAmount } from "../../lib/format";
import { CROSS_AGGREGATE_CATEGORY_LABELS } from "../../contracts/crossAggregateCategory";
import { readApiErrorMessage } from "../forms/useEntryForm";
import { ActualEntryDialog } from "./ActualEntryDialog";
import { useAppSettings } from "../settings/AppSettings";
import { type FundDetailSectionKey } from "../settings/fundDetailSectionOrder";
import { DuplicatePlannedItemDialog } from "./DuplicatePlannedItemDialog";
import { EditFundDialog } from "./EditFundDialog";
import { EditPlannedItemDialog } from "./EditPlannedItemDialog";
import { FundActualEntriesSection } from "./FundActualEntriesSection";
import { FundDetailChart } from "./FundDetailChart";
import { FundListFilters } from "./FundListFilters";
import { FundPlannedItemHistorySection } from "./FundPlannedItemHistorySection";
import { FundPlannedItemsSection } from "./FundPlannedItemsSection";
import { FundSortButtons } from "./FundSortButtons";
import { RateMetricToggle } from "./RateMetricToggle";
import {
  ACTUAL_ENTRY_SORT_FIELDS,
  MONTHLY_STATUS_SORT_FIELDS,
  PLANNED_ITEM_SORT_FIELDS,
  sortActualEntries,
  sortMonthlyStatus,
  sortPlannedItems,
  type FundDetailSortState,
  type ActualEntrySortKey,
  type MonthlyStatusSortKey,
  type PlannedItemSortKey,
} from "./fundDetailSort";
import type { ActualEntry, PlannedItem, PlannedItemHistory } from "./fundDetailTypes";
import { setRateSearchParam } from "./rateQueryParams";

const LIST_DETAIL_SECTION_KEYS = new Set<FundDetailSectionKey>(["actualEntries", "plannedItems"]);

function isListDetailSectionKey(sectionKey: FundDetailSectionKey) {
  return LIST_DETAIL_SECTION_KEYS.has(sectionKey);
}
import { useFundDetailData } from "./useFundDetailData";
import { useFundDetailNotes } from "./useFundDetailNotes";
import type { RateMetricKey } from "../../lib/executionRate";

function formatBudgetAmount(amount: number | null, amountDisplayMode: "grouped-yen" | "plain-yen" | "thousand-yen") {
  return amount === null ? "未設定" : formatAmount(amount, amountDisplayMode);
}

function parseFocusedEntry(value: string | null) {
  const match = value?.match(/^(planned|actual)-(\d+)$/);
  if (match === undefined || match === null) {
    return { type: null, id: null };
  }

  const id = Number(match[2]);
  if (!Number.isInteger(id) || id <= 0) {
    return { type: null, id: null };
  }

  return { type: match[1] as "planned" | "actual", id };
}

export function FundDetailPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const staticDemoMode = isStaticDemoMode();
  const { fundId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    settings: {
      themePreset,
      customChartPresets,
      defaultRateMetric,
      notesDisplayMode,
      amountDisplayMode,
      fundDetailSectionOrder,
      executionRateThresholds,
      balanceRateThresholds,
    },
  } = useAppSettings();
  const [settlingItem, setSettlingItem] = useState<PlannedItem | null>(null);
  const [duplicatingPlannedItem, setDuplicatingPlannedItem] = useState<PlannedItem | null>(null);
  const [duplicatingActualEntry, setDuplicatingActualEntry] = useState<ActualEntry | null>(null);
  const [editingActualEntry, setEditingActualEntry] = useState<ActualEntry | null>(null);
  const [editingItem, setEditingItem] = useState<PlannedItem | null>(null);
  const [isEditingFund, setIsEditingFund] = useState(false);
  const [isCrossAggregateExpanded, setIsCrossAggregateExpanded] = useState(false);
  const [deletingPlannedHistoryItemId, setDeletingPlannedHistoryItemId] = useState<number | null>(null);
  const [restoringPlannedHistoryItemId, setRestoringPlannedHistoryItemId] = useState<number | null>(null);
  const [plannedHistoryDeleteError, setPlannedHistoryDeleteError] = useState("");
  const [plannedHistoryRestoreError, setPlannedHistoryRestoreError] = useState("");
  const [fiscalYearNotice, setFiscalYearNotice] = useState("");
  const [listSearchText, setListSearchText] = useState("");
  const [selectedListCategory, setSelectedListCategory] = useState("");
  const [monthlySort, setMonthlySort] = useState<FundDetailSortState<MonthlyStatusSortKey>>({
    key: "month",
    direction: "asc",
  });
  const [actualEntrySort, setActualEntrySort] = useState<FundDetailSortState<ActualEntrySortKey>>({
    key: "actualDate",
    direction: "asc",
  });
  const [plannedItemSort, setPlannedItemSort] = useState<FundDetailSortState<PlannedItemSortKey>>({
    key: "scheduledMonth",
    direction: "asc",
  });
  const parsedFundId = fundId === undefined ? Number.NaN : Number(fundId);
  const hasValidFundId = Number.isInteger(parsedFundId) && parsedFundId > 0;
  const rateMetric = getRateMetricKey(searchParams.get("rate") ?? defaultRateMetric);
  const focusedEntry = parseFocusedEntry(searchParams.get("focus"));
  const focusedPlannedItemId = focusedEntry.type === "planned" ? focusedEntry.id : null;
  const focusedActualEntryId = focusedEntry.type === "actual" ? focusedEntry.id : null;
  const prefersHoverNotes =
    typeof window !== "undefined" &&
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const { actualNotes, plannedNotes } = useFundDetailNotes(notesDisplayMode, prefersHoverNotes);
  const {
    data,
    isError,
    refreshFundDetail,
    refreshFundDetailAndOverview,
  } = useFundDetailData(parsedFundId);

  useEffect(() => {
    if (!data?.fund || typeof data.fund.fiscalYear !== "number") {
      return;
    }

    const currentFiscalYear = getFiscalYearFromSearch(location.search);
    if (currentFiscalYear === data.fund.fiscalYear) {
      return;
    }

    navigate(
      `${location.pathname}${setFiscalYearInSearch(location.search, data.fund.fiscalYear)}${location.hash}`,
      { replace: true },
    );
    setFiscalYearNotice("この予算の年度に切り替えました。");
  }, [data?.fund, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    function handleOpenFundEdit() {
      setIsEditingFund(true);
    }

    window.addEventListener("budget-dashboard:open-fund-edit", handleOpenFundEdit);
    return () => {
      window.removeEventListener("budget-dashboard:open-fund-edit", handleOpenFundEdit);
    };
  }, []);

  useEffect(() => {
    if (focusedEntry.type === null || focusedEntry.id === null || data?.fund === undefined) {
      return;
    }

    const element = document.getElementById(`${focusedEntry.type === "planned" ? "planned-item" : "actual-entry"}-${focusedEntry.id}`);
    if (element === null || typeof element.scrollIntoView !== "function") {
      return;
    }

    element.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [data?.fund, focusedEntry.id, focusedEntry.type]);

  if (!hasValidFundId) {
    return <div>Fund id is invalid.</div>;
  }

  if (isError) {
    return <PageStatusMessage kind="error">予算詳細を読み込めませんでした。</PageStatusMessage>;
  }

  if (!data?.fund) {
    return <PageStatusMessage kind="loading">読み込み中...</PageStatusMessage>;
  }

  const plannedAmount = data.categories.reduce((sum, row) => sum + row.plannedAmount, 0);
  const actualAmount = data.categories.reduce((sum, row) => sum + row.actualAmount, 0);
  const crossAggregateCategories = data.crossAggregateCategories ?? [];
  const freeBalance = data.fund.awarded_amount - plannedAmount - actualAmount;
  const normalizedListSearchText = listSearchText.trim().toLocaleLowerCase();
  const listCategoryOptions = Array.from(new Set(data.categories.map((category) => category.categoryName)));
  const matchesListSearch = (categoryName: string, description: string) =>
    normalizedListSearchText.length === 0 ||
    `${categoryName} ${description}`.toLocaleLowerCase().includes(normalizedListSearchText);
  const matchesListCategory = (categoryName: string) =>
    selectedListCategory.length === 0 || categoryName === selectedListCategory;
  const filteredActualEntries = data.actualEntries.filter(
    (entry) => matchesListCategory(entry.categoryName) && matchesListSearch(entry.categoryName, entry.description),
  );
  const filteredPlannedItems = data.plannedItems.filter(
    (item) => matchesListCategory(item.categoryName) && matchesListSearch(item.categoryName, item.description),
  );
  const filteredPlannedItemHistory = (data.plannedItemHistory ?? []).filter(
    (item) => matchesListCategory(item.categoryName) && matchesListSearch(item.categoryName, item.description),
  );
  const sortedMonthlyStatus = sortMonthlyStatus(data.monthlyStatus, monthlySort);
  const sortedActualEntries = sortActualEntries(filteredActualEntries, actualEntrySort);
  const sortedPlannedItems = sortPlannedItems(filteredPlannedItems, plannedItemSort);
  const sortedPlannedItemHistory = [...filteredPlannedItemHistory].sort((left, right) => {
    const monthComparison = right.scheduledMonth.localeCompare(left.scheduledMonth);
    if (monthComparison !== 0) {
      return monthComparison;
    }

    return right.id - left.id;
  });
  const fundFiscalYear = typeof data.fund.fiscalYear === "number" ? data.fund.fiscalYear : null;
  const ledgerExportHref = fundFiscalYear === null
    ? `/api/exports/ledger.xlsx?fundId=${parsedFundId}`
    : `/api/exports/ledger.xlsx?year=${fundFiscalYear}&fundId=${parsedFundId}`;
  const fundDetailSections: Record<FundDetailSectionKey, ReactNode> = {
    categories: (
      <section className="detail-panel" aria-labelledby="fund-categories-heading">
        <div className="detail-panel-header">
          <div className="detail-panel-title-actions">
            <h3 id="fund-categories-heading">費目別の状況</h3>
            <button
              type="button"
              className="detail-action-button detail-action-button-edit"
              onClick={() => setIsEditingFund(true)}
            >
              予算を編集
            </button>
          </div>
          <div className="detail-panel-actions">
            <RateMetricToggle rateMetric={rateMetric} onRateMetricChange={updateDetailRateMetric} />
            {staticDemoMode ? null : (
              <a
                className="detail-action-button"
                href={ledgerExportHref}
              >
                収支簿出力
              </a>
            )}
          </div>
        </div>
        <div className="detail-categories-layout">
          <div className="detail-category-tables">
            <div className="detail-table" role="table" aria-label="Fund categories">
              <div className="detail-table-head" role="row">
                <span>費目</span>
                <span className="detail-table-money-heading">予算</span>
                <span className="detail-table-money-heading">執行予定額</span>
                <span className="detail-table-money-heading">執行済額</span>
                <span className="detail-table-rate-heading">{getRateMetricLabel(rateMetric).replace(" [%]", "")}</span>
              </div>
              {data.categories.map((row) => {
                const rate = getRateMetric(
                  rateMetric,
                  row.budgetAmount,
                  row.plannedAmount,
                  row.actualAmount,
                  (row.budgetAmount ?? 0) - row.plannedAmount - row.actualAmount,
                  executionRateThresholds,
                  balanceRateThresholds,
                );

                return (
                  <div key={row.id} className="detail-table-row" role="row">
                    <strong>{row.categoryName}</strong>
                    <span className="detail-table-money-cell">{formatBudgetAmount(row.budgetAmount, amountDisplayMode)}</span>
                    <span className="detail-table-money-cell">{formatAmount(row.plannedAmount, amountDisplayMode)}</span>
                    <span className="detail-table-money-cell">{formatAmount(row.actualAmount, amountDisplayMode)}</span>
                    <span className={`detail-table-rate-cell ${rate.className}`}>{rate.label}</span>
                  </div>
                );
              })}
              <div className="detail-table-row detail-table-total-row" role="row">
                <strong>合計</strong>
                <span className="detail-table-money-cell" />
                <span className="detail-table-money-cell">{formatAmount(plannedAmount, amountDisplayMode)}</span>
                <span className="detail-table-money-cell">{formatAmount(actualAmount, amountDisplayMode)}</span>
                <span className="detail-table-rate-cell" />
              </div>
            </div>
            {crossAggregateCategories.length > 0 ? (
              <div className="detail-cross-aggregate-disclosure">
                <button
                  className="detail-cross-aggregate-toggle"
                  type="button"
                  aria-expanded={isCrossAggregateExpanded}
                  onClick={() => setIsCrossAggregateExpanded((current) => !current)}
                >
                  横断集計カテゴリ別の状況
                </button>
                {isCrossAggregateExpanded ? (
                  <div
                    className="detail-table detail-cross-aggregate-table"
                    role="table"
                    aria-label="Cross aggregate categories"
                  >
                    <div className="detail-table-head" role="row">
                      <span>横断集計カテゴリ</span>
                      <span className="detail-table-money-heading">予算</span>
                      <span className="detail-table-money-heading">執行予定額</span>
                      <span className="detail-table-money-heading">執行済額</span>
                      <span className="detail-table-money-heading">残高</span>
                    </div>
                    {crossAggregateCategories.map((row) => {
                      const balance = (row.budgetAmount ?? 0) - row.plannedAmount - row.actualAmount;

                      return (
                        <div key={row.crossAggregateCategory} className="detail-table-row" role="row">
                          <strong>{CROSS_AGGREGATE_CATEGORY_LABELS[row.crossAggregateCategory]}</strong>
                          <span className="detail-table-money-cell">{formatBudgetAmount(row.budgetAmount, amountDisplayMode)}</span>
                          <span className="detail-table-money-cell">{formatAmount(row.plannedAmount, amountDisplayMode)}</span>
                          <span className="detail-table-money-cell">{formatAmount(row.actualAmount, amountDisplayMode)}</span>
                          <span className="detail-table-money-cell">{formatAmount(balance, amountDisplayMode)}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
          <FundDetailChart
            fundName={data.fund.name}
            awardedAmount={data.fund.awarded_amount}
            categories={data.categories}
            preset={themePreset}
            customChartPresets={customChartPresets}
            rateMetric={rateMetric}
            amountDisplayMode={amountDisplayMode}
            executionRateThresholds={executionRateThresholds}
            balanceRateThresholds={balanceRateThresholds}
          />
        </div>
      </section>
    ),
    timeline: (
      <section className="detail-panel" aria-labelledby="fund-timeline-heading">
        <div className="detail-panel-header">
          <div>
            <h3 id="fund-timeline-heading">月別の状況</h3>
          </div>
        </div>
        <div className="timeline-list">
          <div className="timeline-head timeline-sort-head" role="row">
            <FundSortButtons
              fields={MONTHLY_STATUS_SORT_FIELDS}
              sortState={monthlySort}
              onSortChange={setMonthlySort}
            />
          </div>
          {sortedMonthlyStatus.map((item) => (
            <div key={item.month} className="timeline-row">
              <strong>{item.month}</strong>
              <span className="detail-table-money-cell">{formatAmount(item.plannedAmount, amountDisplayMode)}</span>
              <span className="detail-table-money-cell">{formatAmount(item.actualAmount, amountDisplayMode)}</span>
              <span className="detail-table-money-cell">{formatAmount(item.totalAmount, amountDisplayMode)}</span>
            </div>
          ))}
        </div>
      </section>
    ),
    actualEntries: (
      <FundActualEntriesSection
        amountDisplayMode={amountDisplayMode}
        createHref={
          fundFiscalYear === null
            ? `/actual-entries/new?fundId=${data.fund.id}`
            : `/actual-entries/new${setFiscalYearInSearch(`?fundId=${data.fund.id}`, fundFiscalYear)}`
        }
        createState={{ backgroundLocation: location }}
        focusedEntryId={focusedActualEntryId}
        notes={actualNotes}
        onDuplicateEntry={setDuplicatingActualEntry}
        onEditEntry={setEditingActualEntry}
        sortControls={
          <FundSortButtons
            fields={ACTUAL_ENTRY_SORT_FIELDS}
            sortState={actualEntrySort}
            onSortChange={setActualEntrySort}
          />
        }
        entries={sortedActualEntries}
        totalEntryCount={data.actualEntries.length}
      />
    ),
    plannedItems: (
      <>
        <FundPlannedItemsSection
          amountDisplayMode={amountDisplayMode}
          createHref={
            fundFiscalYear === null
              ? `/planned-items/new?fundId=${data.fund.id}`
              : `/planned-items/new${setFiscalYearInSearch(`?fundId=${data.fund.id}`, fundFiscalYear)}`
          }
          createState={{ backgroundLocation: location }}
          focusedItemId={focusedPlannedItemId}
          sortControls={
            <FundSortButtons
              fields={PLANNED_ITEM_SORT_FIELDS}
              sortState={plannedItemSort}
              onSortChange={setPlannedItemSort}
            />
          }
          items={sortedPlannedItems}
          notes={plannedNotes}
          onDuplicateItem={setDuplicatingPlannedItem}
          onEditItem={setEditingItem}
          onSettleItem={setSettlingItem}
          totalItemCount={data.plannedItems.length}
        />
        <FundPlannedItemHistorySection
          amountDisplayMode={amountDisplayMode}
          deleteError={plannedHistoryDeleteError}
          deletingItemId={deletingPlannedHistoryItemId}
          focusedItemId={focusedPlannedItemId}
          items={sortedPlannedItemHistory}
          notes={plannedNotes}
          onDeleteCancelledItem={deleteCancelledPlannedItem}
          onRestoreCancelledItem={restoreCancelledPlannedItem}
          restoreError={plannedHistoryRestoreError}
          restoringItemId={restoringPlannedHistoryItemId}
          totalItemCount={data.plannedItemHistory?.length ?? 0}
        />
      </>
    ),
  };

  function updateDetailRateMetric(value: RateMetricKey) {
    const nextParams = new URLSearchParams(searchParams);
    setRateSearchParam(nextParams, value, defaultRateMetric);

    setSearchParams(nextParams, { replace: true });
  }

  async function deleteCancelledPlannedItem(item: PlannedItemHistory) {
    setDeletingPlannedHistoryItemId(item.id);
    setPlannedHistoryDeleteError("");
    setPlannedHistoryRestoreError("");

    try {
      const response = await apiFetch(`/api/planned-items/${item.id}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        setPlannedHistoryDeleteError(readApiErrorMessage(payload, "計画項目を削除できませんでした。"));
        return;
      }

      await refreshFundDetail();
    } catch {
      setPlannedHistoryDeleteError("計画項目を削除できませんでした。");
    } finally {
      setDeletingPlannedHistoryItemId(null);
    }
  }

  async function restoreCancelledPlannedItem(item: PlannedItemHistory) {
    setRestoringPlannedHistoryItemId(item.id);
    setPlannedHistoryDeleteError("");
    setPlannedHistoryRestoreError("");

    try {
      const response = await apiFetch(`/api/planned-items/${item.id}/restore`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        setPlannedHistoryRestoreError(readApiErrorMessage(payload, "計画項目を計画に戻せませんでした。"));
        return;
      }

      await refreshFundDetail();
    } catch {
      setPlannedHistoryRestoreError("計画項目を計画に戻せませんでした。");
    } finally {
      setRestoringPlannedHistoryItemId(null);
    }
  }

  return (
    <>
      <section className="detail-grid">
        <header className="detail-hero">
          <div className="detail-panel-title-actions">
            <h2>{data.fund.name}</h2>
          </div>
          <section className="detail-summary" aria-label="Fund summary">
            <p className="detail-balance">
              <span>残高</span>
              <strong>{formatAmount(freeBalance, amountDisplayMode)}</strong>
            </p>
            <div className="detail-summary-metrics">
              <p className="detail-summary-metric">
                <span>交付額</span>
                <strong>{formatAmount(data.fund.awarded_amount, amountDisplayMode)}</strong>
              </p>
              <p className="detail-summary-metric">
                <span>執行予定額</span>
                <strong>{formatAmount(plannedAmount, amountDisplayMode)}</strong>
              </p>
              <p className="detail-summary-metric">
                <span>執行済額</span>
                <strong>{formatAmount(actualAmount, amountDisplayMode)}</strong>
              </p>
            </div>
          </section>
          {fiscalYearNotice ? (
            <p className="detail-fiscal-year-notice" role="status">
              {fiscalYearNotice}
            </p>
          ) : null}
        </header>
        {fundDetailSectionOrder.map((sectionKey, index) => {
          const shouldRenderListFilters =
            isListDetailSectionKey(sectionKey) &&
            !fundDetailSectionOrder.slice(0, index).some(isListDetailSectionKey);

          return (
            <Fragment key={sectionKey}>
              {shouldRenderListFilters ? (
                <div className="detail-list-filter-bar">
                  <FundListFilters
                    ariaLabel="一覧全体の絞り込み"
                    categoryOptions={listCategoryOptions}
                    searchText={listSearchText}
                    selectedCategory={selectedListCategory}
                    onSearchTextChange={setListSearchText}
                    onSelectedCategoryChange={setSelectedListCategory}
                  />
                </div>
              ) : null}
              <div>{fundDetailSections[sectionKey]}</div>
            </Fragment>
          );
        })}
      </section>

      {settlingItem ? (
        <ActualEntryDialog
          key={settlingItem.id}
          mode="create"
          fundId={parsedFundId}
          item={settlingItem}
          onClose={() => setSettlingItem(null)}
          onSaved={refreshFundDetail}
        />
      ) : null}
      {duplicatingActualEntry ? (
        <ActualEntryDialog
          key={`duplicate-${duplicatingActualEntry.id}`}
          mode="duplicate"
          currentFundId={parsedFundId}
          entry={duplicatingActualEntry}
          onClose={() => setDuplicatingActualEntry(null)}
          onSaved={refreshFundDetail}
        />
      ) : null}
      {editingActualEntry ? (
        <ActualEntryDialog
          key={editingActualEntry.id}
          mode="edit"
          currentCategoryId={
            data.categories.find((category) => category.categoryName === editingActualEntry.categoryName)?.id ??
            null
          }
          currentFundId={parsedFundId}
          entry={editingActualEntry}
          onClose={() => setEditingActualEntry(null)}
          onSaved={refreshFundDetail}
        />
      ) : null}
      {duplicatingPlannedItem ? (
        <DuplicatePlannedItemDialog
          key={duplicatingPlannedItem.id}
          fundId={parsedFundId}
          item={duplicatingPlannedItem}
          onClose={() => setDuplicatingPlannedItem(null)}
          onSaved={refreshFundDetail}
        />
      ) : null}
      {editingItem ? (
        <EditPlannedItemDialog
          key={editingItem.id}
          fundId={parsedFundId}
          item={editingItem}
          onClose={() => setEditingItem(null)}
          onSaved={refreshFundDetail}
        />
      ) : null}
      {isEditingFund ? (
        <EditFundDialog
          fundId={parsedFundId}
          initialValues={{
            name: data.fund.name,
            fiscalYear: data.fund.fiscalYear,
            awardedAmount: data.fund.awarded_amount,
            notes: data.fund.notes,
            categories: data.categories.map((category) => ({
              id: category.id,
              name: category.categoryName,
              amount: category.budgetAmount,
              crossAggregateCategory: category.crossAggregateCategory,
            })),
          }}
          onClose={() => setIsEditingFund(false)}
          onSaved={refreshFundDetailAndOverview}
        />
      ) : null}
    </>
  );
}

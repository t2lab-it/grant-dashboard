import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { buildOverviewApiPath, getFiscalYearFromSearch } from "../../app/fiscalYear";
import { getBackgroundLocation } from "../../app/routeModal";
import { ClassificationCheckboxGroup } from "../classifications/ClassificationCheckboxGroup";
import type { ClassificationResponse } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";
import type {
  CreateBulkPlannedItemsRequest,
  CreateBulkPlannedItemsResponse,
  CreatePlannedItemRequest,
  CreatePlannedItemResponse,
  FundEntryOptionsResponse,
  OverviewFundOptionsResponse,
} from "../../contracts/entries";
import { apiGet, apiPostJson } from "../../lib/api";
import { formatTokyoDateKey } from "../../lib/calendar";
import { FormFeedback } from "../forms/FormFeedback";
import { DateField, formatDateForDisplay, normalizeDateForApi } from "../forms/DateField";
import { FundCategorySelectFields } from "../forms/FundCategorySelectFields";
import { parsePositiveAmountExpression } from "../forms/amountExpression";
import { readApiErrorMessage, useEntryForm } from "../forms/useEntryForm";
import { useAppSettings } from "../settings/AppSettings";

function getScheduledMonthFromDisplayDate(value: string) {
  const normalizedValue = normalizeDateForApi(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalizedValue) ? normalizedValue.slice(0, 7) : "";
}

function parsePositiveFundId(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

type PlannedItemFormMode = "single" | "bulk";

type BulkPreviewRow = {
  scheduledMonth: string;
  description: string;
  amount: string;
};

function parseYearMonth(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})$/);
  if (match === null) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) {
    return null;
  }

  return year * 12 + month - 1;
}

function formatYearMonth(monthIndex: number) {
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return `${year}-${month.toString().padStart(2, "0")}`;
}

export function PlannedItemForm() {
  const today = formatDateForDisplay(formatTokyoDateKey(new Date()));
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const requestedFiscalYear = getFiscalYearFromSearch(`?${searchParams.toString()}`);
  const lockedFundId = parsePositiveFundId(searchParams.get("fundId"));
  const backgroundLocation = getBackgroundLocation(location.state);
  const isModalPresentation = backgroundLocation !== null;
  const closeModalPath =
    backgroundLocation === null
      ? null
      : `${backgroundLocation.pathname}${backgroundLocation.search}${backgroundLocation.hash}`;
  const {
    settings: { defaultFundId, defaultCategoryId },
  } = useAppSettings();
  const [mode, setMode] = useState<PlannedItemFormMode>("single");
  const { blockingMessage, infoMessage, isSubmitting, setValue, submit, values, warnings } =
    useEntryForm({
      amount: "",
      categoryId: "",
      description: "",
      fundId: lockedFundId === null ? "" : String(lockedFundId),
      notes: "",
      plannedDate: today,
      scheduledMonth: getScheduledMonthFromDisplayDate(today),
    });
  const [selectedAuxiliaryLabelIds, setSelectedAuxiliaryLabelIds] = useState<number[]>([]);
  const [bulkStartMonth, setBulkStartMonth] = useState(getScheduledMonthFromDisplayDate(today));
  const [bulkEndMonth, setBulkEndMonth] = useState(getScheduledMonthFromDisplayDate(today));
  const [bulkBaseDescription, setBulkBaseDescription] = useState("");
  const [bulkBaseAmount, setBulkBaseAmount] = useState("");
  const [bulkPreviewRows, setBulkPreviewRows] = useState<BulkPreviewRow[]>([]);
  const [bulkPreviewError, setBulkPreviewError] = useState("");
  const hasAppliedDefaultFund = useRef(false);
  const hasAppliedDefaultCategory = useRef(false);
  const selectedFundId = values.fundId.trim();
  const parsedFundId = selectedFundId.length > 0 ? Number(selectedFundId) : Number.NaN;
  const hasSelectedFund = Number.isInteger(parsedFundId) && parsedFundId > 0;
  const { data: overviewData } = useQuery({
    queryKey: ["overview", requestedFiscalYear ?? "auto"],
    queryFn: () => apiGet<OverviewFundOptionsResponse>(buildOverviewApiPath(requestedFiscalYear)),
    enabled: lockedFundId === null,
  });
  const { data: fundDetailData } = useQuery({
    queryKey: ["fund-category-options", parsedFundId],
    queryFn: () => apiGet<FundEntryOptionsResponse>(`/api/funds/${parsedFundId}`),
    enabled: hasSelectedFund,
  });
  const { data: rawClassificationData } = useQuery({
    queryKey: ["classifications"],
    queryFn: () => apiGet<ClassificationResponse>("/api/classifications"),
  });
  const classificationData = normalizeClassifications(rawClassificationData);
  const lockedFundName = fundDetailData?.fund?.name ?? "読み込み中...";

  useEffect(() => {
    if (lockedFundId !== null && values.fundId !== String(lockedFundId)) {
      setValue("fundId", String(lockedFundId));
    }
  }, [lockedFundId, setValue, values.fundId]);

  useEffect(() => {
    if (lockedFundId !== null || hasAppliedDefaultFund.current || !overviewData) {
      return;
    }

    hasAppliedDefaultFund.current = true;

    if (
      values.fundId.length === 0 &&
      defaultFundId !== null &&
      overviewData.funds.some((fund) => fund.id === defaultFundId)
    ) {
      setValue("fundId", String(defaultFundId));
    }
  }, [defaultFundId, overviewData, setValue, values.fundId]);

  useEffect(() => {
    if (hasAppliedDefaultCategory.current || !fundDetailData || parsedFundId !== defaultFundId) {
      return;
    }

    hasAppliedDefaultCategory.current = true;

    if (
      values.categoryId.length === 0 &&
      defaultCategoryId !== null &&
      fundDetailData.categories.some((category) => category.id === defaultCategoryId)
    ) {
      setValue("categoryId", String(defaultCategoryId));
    }
  }, [defaultCategoryId, defaultFundId, fundDetailData, parsedFundId, setValue, values.categoryId]);

  function handleModeChange(nextMode: PlannedItemFormMode) {
    setMode(nextMode);
    setBulkPreviewError("");
  }

  function handleGenerateBulkPreview() {
    const startIndex = parseYearMonth(bulkStartMonth);
    const endIndex = parseYearMonth(bulkEndMonth);
    const baseDescription = bulkBaseDescription.trim();
    let amount = 0;
    try {
      amount = parsePositiveAmountExpression(bulkBaseAmount, "基準金額");
    } catch (error) {
      setBulkPreviewError(error instanceof Error ? error.message : "基準金額は有効な数式で入力してください。");
      setBulkPreviewRows([]);
      return;
    }

    if (startIndex === null || endIndex === null) {
      setBulkPreviewError("開始月と終了月は YYYY-MM 形式で入力してください。");
      setBulkPreviewRows([]);
      return;
    }

    if (startIndex > endIndex) {
      setBulkPreviewError("開始月は終了月以前にしてください。");
      setBulkPreviewRows([]);
      return;
    }

    if (baseDescription.length === 0) {
      setBulkPreviewError("基準説明を入力してください。");
      setBulkPreviewRows([]);
      return;
    }

    setBulkPreviewError("");
    setBulkPreviewRows(
      Array.from({ length: endIndex - startIndex + 1 }, (_, index) => {
        const scheduledMonth = formatYearMonth(startIndex + index);
        return {
          scheduledMonth,
          description: `${baseDescription} ${scheduledMonth}`,
          amount: bulkBaseAmount,
        };
      }),
    );
  }

  function updateBulkPreviewRow(
    scheduledMonth: string,
    field: "description" | "amount",
    value: string,
  ) {
    setBulkPreviewRows((currentRows) =>
      currentRows.map((row) =>
        row.scheduledMonth === scheduledMonth ? { ...row, [field]: value } : row,
      ),
    );
  }

  async function submitSinglePlannedItem() {
    await submit(async () => {
      let amount: number;
      try {
        amount = parsePositiveAmountExpression(values.amount, "金額");
      } catch (error) {
        return {
          blockingMessage: error instanceof Error ? error.message : "金額を確認してください。",
        };
      }
      const result = await apiPostJson<CreatePlannedItemRequest, CreatePlannedItemResponse>(
        "/api/planned-items",
        {
          fundId: Number(values.fundId),
          categoryId: Number(values.categoryId),
          plannedDate: normalizeDateForApi(values.plannedDate),
          scheduledMonth: values.scheduledMonth,
          description: values.description,
          amount,
          notes: values.notes,
          auxiliaryLabelIds: selectedAuxiliaryLabelIds,
        },
      );

      if (!result.ok) {
        return {
          blockingMessage: readApiErrorMessage(result.data, "予定項目を保存できませんでした。"),
        };
      }

      const warnings = result.data.warnings ?? [];
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
      await queryClient.invalidateQueries({ queryKey: ["fund", Number(values.fundId)] });

      return {
        infoMessage: warnings.length > 0 ? "予定項目を保存しました。警告を確認してください。" : "予定項目を保存しました。",
        warnings,
      };
    }, "予定項目を保存できませんでした。");
  }

  async function submitBulkPlannedItems() {
    setBulkPreviewError("");

    if (bulkPreviewRows.length === 0) {
      setBulkPreviewError("プレビューを生成してください。");
      return;
    }

    await submit(async () => {
      let items: CreateBulkPlannedItemsRequest["items"];
      try {
        items = bulkPreviewRows.map((row) => ({
          scheduledMonth: row.scheduledMonth,
          description: row.description,
          amount: parsePositiveAmountExpression(row.amount, "金額 " + row.scheduledMonth),
        }));
      } catch (error) {
        return {
          blockingMessage: error instanceof Error ? error.message : "金額を確認してください。",
        };
      }

      const result = await apiPostJson<CreateBulkPlannedItemsRequest, CreateBulkPlannedItemsResponse>(
        "/api/planned-items/bulk",
        {
          fundId: Number(values.fundId),
          categoryId: Number(values.categoryId),
          plannedDate: normalizeDateForApi(values.plannedDate),
          notes: values.notes,
          auxiliaryLabelIds: selectedAuxiliaryLabelIds,
          items,
        },
      );

      if (!result.ok) {
        return {
          blockingMessage: readApiErrorMessage(result.data, "予定項目を保存できませんでした。"),
        };
      }

      const warnings = result.data.warnings ?? [];
      await queryClient.invalidateQueries({ queryKey: ["overview"] });
      await queryClient.invalidateQueries({ queryKey: ["fund", Number(values.fundId)] });

      return {
        infoMessage:
          warnings.length > 0
            ? `${result.data.createdCount}件の予定項目を保存しました。警告を確認してください。`
            : `${result.data.createdCount}件の予定項目を保存しました。`,
        warnings,
      };
    }, "予定項目を保存できませんでした。");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "bulk") {
      await submitBulkPlannedItems();
      return;
    }

    await submitSinglePlannedItem();
  }

  function handleClose() {
    if (closeModalPath === null) {
      return;
    }

    navigate(closeModalPath, { replace: true });
  }

  return (
    <section
      className="budget-form-panel"
      data-testid="tour-target-planned-item-form"
      data-tour-id="planned-item-form"
    >
      <div className="budget-form-panel-header">
        <div>
          <h2>予定作成</h2>
        </div>
      </div>

      <form className="budget-entry-form" onSubmit={handleSubmit}>
        <div className="overview-display-toggle planned-item-mode-toggle" role="group" aria-label="作成モード">
          <button
            type="button"
            className="overview-display-toggle-button"
            aria-pressed={mode === "single"}
            onClick={() => handleModeChange("single")}
          >
            単発
          </button>
          <button
            type="button"
            className="overview-display-toggle-button"
            aria-pressed={mode === "bulk"}
            onClick={() => handleModeChange("bulk")}
          >
            一括
          </button>
        </div>
        <FundCategorySelectFields
          categories={fundDetailData?.categories ?? []}
          categoryId={values.categoryId}
          fundId={values.fundId}
          funds={overviewData?.funds ?? []}
          hasSelectedFund={hasSelectedFund}
          isFundLocked={lockedFundId !== null}
          lockedFundName={lockedFundName}
          onCategoryChange={(value) => setValue("categoryId", value)}
          onFundChange={(value) => {
            setValue("fundId", value);
            setValue("categoryId", "");
          }}
        />
        <DateField
          buttonAriaLabel="立案日カレンダーを開く"
          calendarAriaLabel="立案日カレンダー"
          label="立案日"
          name="plannedDate"
          onChange={(value) => setValue("plannedDate", value)}
          textAriaLabel="立案日"
          value={values.plannedDate}
        />
        {mode === "single" ? (
          <>
            <label className="budget-entry-field">
              <span>執行予定月</span>
              <input
                aria-label="執行予定月"
                name="scheduledMonth"
                onChange={(event) => setValue("scheduledMonth", event.target.value)}
                placeholder="2026-10"
                value={values.scheduledMonth}
              />
            </label>
            <label className="budget-entry-field">
              <span>説明</span>
              <input
                aria-label="説明"
                name="description"
                onChange={(event) => setValue("description", event.target.value)}
                value={values.description}
              />
            </label>
            <label className="budget-entry-field">
              <span>金額</span>
              <input
                aria-label="金額"
                data-direct-number-input="true"
                name="amount"
                onChange={(event) => setValue("amount", event.target.value)}
                type="text"
                inputMode="decimal"
                value={values.amount}
              />
            </label>
          </>
        ) : (
          <div className="planned-item-bulk-panel">
            <div className="planned-item-bulk-grid">
              <label className="budget-entry-field">
                <span>開始月</span>
                <input
                  aria-label="開始月"
                  name="bulkStartMonth"
                  onChange={(event) => setBulkStartMonth(event.target.value)}
                  placeholder="2026-10"
                  value={bulkStartMonth}
                />
              </label>
              <label className="budget-entry-field">
                <span>終了月</span>
                <input
                  aria-label="終了月"
                  name="bulkEndMonth"
                  onChange={(event) => setBulkEndMonth(event.target.value)}
                  placeholder="2027-03"
                  value={bulkEndMonth}
                />
              </label>
              <label className="budget-entry-field">
                <span>基準説明</span>
                <input
                  aria-label="基準説明"
                  name="bulkBaseDescription"
                  onChange={(event) => setBulkBaseDescription(event.target.value)}
                  value={bulkBaseDescription}
                />
              </label>
              <label className="budget-entry-field">
                <span>基準金額</span>
                <input
                  aria-label="基準金額"
                  data-direct-number-input="true"
                  name="bulkBaseAmount"
                  onChange={(event) => setBulkBaseAmount(event.target.value)}
                  type="text"
                  inputMode="decimal"
                  value={bulkBaseAmount}
                />
              </label>
            </div>
            <div className="budget-form-actions planned-item-preview-actions">
              <button
                type="button"
                className="budget-modal-secondary"
                disabled={isSubmitting}
                onClick={handleGenerateBulkPreview}
              >
                プレビュー生成
              </button>
            </div>
            {bulkPreviewRows.length > 0 ? (
              <div className="planned-item-preview-table" aria-label="一括作成プレビュー">
                <div className="planned-item-preview-head" aria-hidden="true">
                  <span>執行予定月</span>
                  <span>説明</span>
                  <span>金額</span>
                </div>
                {bulkPreviewRows.map((row) => (
                  <div className="planned-item-preview-row" key={row.scheduledMonth}>
                    <span className="planned-item-preview-month">{row.scheduledMonth}</span>
                    <input
                      aria-label={`説明 ${row.scheduledMonth}`}
                      value={row.description}
                      onChange={(event) =>
                        updateBulkPreviewRow(row.scheduledMonth, "description", event.target.value)
                      }
                    />
                    <input
                      aria-label={`金額 ${row.scheduledMonth}`}
                      data-direct-number-input="true"
                      type="text"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(event) =>
                        updateBulkPreviewRow(row.scheduledMonth, "amount", event.target.value)
                      }
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <label className="budget-entry-field">
          <span>メモ</span>
          <textarea
            aria-label="メモ"
            name="notes"
            onChange={(event) => setValue("notes", event.target.value)}
            rows={4}
            value={values.notes}
          />
        </label>
        <ClassificationCheckboxGroup
          title="補助ラベル"
          options={classificationData.auxiliaryLabels}
          selectedIds={selectedAuxiliaryLabelIds}
          onChange={setSelectedAuxiliaryLabelIds}
        />
        <div className="budget-form-actions">
          {isModalPresentation ? (
            <button
              type="button"
              className="budget-modal-secondary"
              disabled={isSubmitting}
              onClick={handleClose}
            >
              閉じる
            </button>
          ) : null}
          <button className="budget-entry-submit" disabled={isSubmitting} type="submit">
            {isSubmitting ? "保存中..." : mode === "bulk" ? "一括保存" : "保存"}
          </button>
        </div>
      </form>

      <FormFeedback
        blockingMessage={blockingMessage || bulkPreviewError}
        infoMessage={infoMessage}
        warnings={warnings}
      />
    </section>
  );
}

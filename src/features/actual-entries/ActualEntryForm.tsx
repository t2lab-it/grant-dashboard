import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { buildOverviewApiPath, getFiscalYearFromSearch } from "../../app/fiscalYear";
import { getBackgroundLocation } from "../../app/routeModal";
import { ClassificationCheckboxGroup } from "../classifications/ClassificationCheckboxGroup";
import type { ClassificationResponse } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";
import type {
  CreateActualEntryRequest,
  CreateActualEntryResponse,
  FundEntryOptionsResponse,
  OverviewFundOptionsResponse,
} from "../../contracts/entries";
import { apiGet, apiPostJson } from "../../lib/api";
import { formatTokyoDateKey } from "../../lib/calendar";
import { DateField, formatDateForDisplay, normalizeDateForApi } from "../forms/DateField";
import { FormFeedback } from "../forms/FormFeedback";
import { FundCategorySelectFields } from "../forms/FundCategorySelectFields";
import { parsePositiveAmountExpression } from "../forms/amountExpression";
import { useEntryForm } from "../forms/useEntryForm";
import { invalidateFinancialSummaryQueries } from "../../lib/invalidateFinancialSummaryQueries";
import { queryKeys } from "../../lib/queryKeys";
import { useAppSettings } from "../settings/AppSettings";

function parsePositiveFundId(value: string | null) {
  if (value === null) {
    return null;
  }

  const parsedValue = Number(value);
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

export function ActualEntryForm() {
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
  const { blockingMessage, infoMessage, isSubmitting, setValue, submit, values, warnings } =
    useEntryForm({
      actualDate: today,
      amount: "",
      categoryId: "",
      description: "",
      fundId: lockedFundId === null ? "" : String(lockedFundId),
      notes: "",
      plannedItemId: "",
    });
  const [selectedAuxiliaryLabelIds, setSelectedAuxiliaryLabelIds] = useState<number[]>([]);
  const hasAppliedDefaultFund = useRef(false);
  const hasAppliedDefaultCategory = useRef(false);
  const selectedFundId = values.fundId.trim();
  const selectedCategoryId = values.categoryId.trim();
  const parsedFundId = selectedFundId.length > 0 ? Number(selectedFundId) : Number.NaN;
  const hasSelectedFund = Number.isInteger(parsedFundId) && parsedFundId > 0;
  const hasSelectedCategory = selectedCategoryId.length > 0;
  const { data: overviewData } = useQuery({
    queryKey: queryKeys.overview.detail(requestedFiscalYear),
    queryFn: () => apiGet<OverviewFundOptionsResponse>(buildOverviewApiPath(requestedFiscalYear)),
    enabled: lockedFundId === null,
  });
  const { data: fundDetailData } = useQuery({
    queryKey: queryKeys.fund.categoryOptions(parsedFundId),
    queryFn: () => apiGet<FundEntryOptionsResponse>(`/api/funds/${parsedFundId}`),
    enabled: hasSelectedFund,
  });
  const { data: rawClassificationData } = useQuery({
    queryKey: queryKeys.classifications.all,
    queryFn: () => apiGet<ClassificationResponse>("/api/classifications"),
  });
  const classificationData = normalizeClassifications(rawClassificationData);
  const lockedFundName = fundDetailData?.fund?.name ?? "読み込み中...";
  const plannedItemOptions = useMemo(
    () => fundDetailData?.plannedItems.filter((item) => String(item.categoryId) === selectedCategoryId) ?? [],
    [fundDetailData?.plannedItems, selectedCategoryId],
  );

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
  }, [defaultFundId, lockedFundId, overviewData, setValue, values.fundId]);

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

  useEffect(() => {
    if (!hasSelectedCategory && values.plannedItemId.length > 0) {
      setValue("plannedItemId", "");
      return;
    }

    if (
      values.plannedItemId.length > 0 &&
      !plannedItemOptions.some((item) => String(item.id) === values.plannedItemId)
    ) {
      setValue("plannedItemId", "");
    }
  }, [hasSelectedCategory, plannedItemOptions, setValue, values.plannedItemId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const plannedItemId = values.plannedItemId.trim();

    await submit(async () => {
      let amount: number;
      try {
        amount = parsePositiveAmountExpression(values.amount, "金額");
      } catch (error) {
        return {
          blockingMessage: error instanceof Error ? error.message : "金額を確認してください。",
        };
      }

      const result = await apiPostJson<CreateActualEntryRequest, CreateActualEntryResponse>(
        "/api/actual-entries",
        {
          fundId: Number(values.fundId),
          categoryId: Number(values.categoryId),
          actualDate: normalizeDateForApi(values.actualDate),
          description: values.description,
          amount,
          notes: values.notes,
          ...(plannedItemId ? { plannedItemId: Number(plannedItemId) } : {}),
          auxiliaryLabelIds: selectedAuxiliaryLabelIds,
        },
      );

      if (!result.ok) {
        return {
          blockingMessage: result.error.message,
        };
      }

      const { remainingPlannedAmount } = result.data;
      await invalidateFinancialSummaryQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.fund.detail(Number(values.fundId)) });

      if (
        typeof remainingPlannedAmount === "number" &&
        remainingPlannedAmount < 0
      ) {
        return {
          infoMessage: "実績を保存しました。警告を確認してください。",
          warnings: [`残り予定額がマイナスです: ${remainingPlannedAmount}`],
        };
      }

      return {
        infoMessage: `残り予定額: ${remainingPlannedAmount ?? "未連携"}`,
      };
    }, "実績を保存できませんでした。");
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
      data-testid="tour-target-actual-entry-form"
      data-tour-id="actual-entry-form"
    >
      <div className="budget-form-panel-header">
        <div>
          <h2>実績作成</h2>
        </div>
      </div>

      <form className="budget-entry-form" onSubmit={handleSubmit}>
        <FundCategorySelectFields
          categories={fundDetailData?.categories ?? []}
          categoryId={values.categoryId}
          fundId={values.fundId}
          funds={overviewData?.funds ?? []}
          hasSelectedFund={hasSelectedFund}
          isFundLocked={lockedFundId !== null}
          lockedFundName={lockedFundName}
          onCategoryChange={(value) => {
            setValue("categoryId", value);
            setValue("plannedItemId", "");
          }}
          onFundChange={(value) => {
            setValue("fundId", value);
            setValue("categoryId", "");
            setValue("plannedItemId", "");
          }}
        />
        <label className="budget-entry-field">
          <span>予定項目</span>
          <select
            aria-label="予定項目"
            disabled={!hasSelectedCategory}
            name="plannedItemId"
            onChange={(event) => setValue("plannedItemId", event.target.value)}
            value={values.plannedItemId}
          >
            <option value="">未連携で登録</option>
            {plannedItemOptions.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.description}
              </option>
            ))}
          </select>
          <small>未入力でも実績を登録できます。</small>
        </label>
        <DateField
          buttonAriaLabel="実績日カレンダーを開く"
          calendarAriaLabel="実績日カレンダー"
          label="実績日"
          name="actualDate"
          onChange={(value) => setValue("actualDate", value)}
          textAriaLabel="実績日"
          value={values.actualDate}
        />
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
            {isSubmitting ? "保存中..." : "保存"}
          </button>
        </div>
      </form>

      <FormFeedback
        blockingMessage={blockingMessage}
        infoMessage={infoMessage}
        warnings={warnings}
      />
    </section>
  );
}

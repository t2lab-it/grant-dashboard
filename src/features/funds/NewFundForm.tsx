import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { getFiscalYearFromSearch, setFiscalYearInSearch } from "../../app/fiscalYear";
import { FormFeedback } from "../forms/FormFeedback";
import { apiGet, apiMutateJson } from "../../lib/api";
import { invalidateFinancialSummaryQueries } from "../../lib/invalidateFinancialSummaryQueries";
import { queryKeys } from "../../lib/queryKeys";
import type { ClassificationResponse } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";
import { parseNonnegativeAmountExpression, parsePositiveAmountExpression } from "../forms/amountExpression";
import { useEntryForm } from "../forms/useEntryForm";
import { buildFundBudgetSummary } from "./FundBudgetSummary";
import { createFundCategoryDraft, nextFundCategoryDraftId, type FundCategoryDraft } from "./FundFormFields";
import { FundFormFields } from "./FundFormFields";
import type { CreateFundRequest } from "../../contracts/requestSchemas";

export function NewFundForm() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestedFiscalYear = getFiscalYearFromSearch(`?${searchParams.toString()}`);
  const { blockingMessage, infoMessage, isSubmitting, setValue, submit, values, warnings } =
    useEntryForm({
      name: "",
      fiscalYear: requestedFiscalYear === undefined ? "" : String(requestedFiscalYear),
      awardedAmount: "",
      notes: "",
    });
  const [categories, setCategories] = useState<FundCategoryDraft[]>([createFundCategoryDraft(1)]);
  const [selectedProjectTagIds, setSelectedProjectTagIds] = useState<number[]>([]);
  const [selectedAuxiliaryLabelIds, setSelectedAuxiliaryLabelIds] = useState<number[]>([]);
  const { data: rawClassificationData } = useQuery({
    queryKey: queryKeys.classifications.all,
    queryFn: () => apiGet<ClassificationResponse>("/api/classifications"),
  });
  const classificationData = normalizeClassifications(rawClassificationData);
  const { awardedAmount, categoryTotal } = buildFundBudgetSummary(
    categories.map((category) => category.amount),
    values.awardedAmount,
  );
  const isAwardedAmountEntered = values.awardedAmount.trim().length > 0;
  const categoryBudgetError =
    isAwardedAmountEntered && categoryTotal > awardedAmount
      ? "費目予算の合計が交付額を超えています。"
      : "";

  function updateCategory(
    id: number,
    field: "name" | "amount" | "crossAggregateCategory",
    nextValue: string,
  ) {
    setCategories((currentCategories) =>
      currentCategories.map((category) =>
        category.id === id ? { ...category, [field]: nextValue } : category,
      ),
    );
  }

  function addCategoryRow() {
    setCategories((currentCategories) => [
      ...currentCategories,
      createFundCategoryDraft(nextFundCategoryDraftId(currentCategories)),
    ]);
  }

  function removeCategoryRow(id: number) {
    setCategories((currentCategories) => {
      if (currentCategories.length === 1) {
        return currentCategories;
      }

      return currentCategories.filter((category) => category.id !== id);
    });
  }

  function handleClose() {
    navigate(requestedFiscalYear === undefined ? "/" : `/${setFiscalYearInSearch("", requestedFiscalYear)}`);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await submit(async () => {
      if (categoryBudgetError) {
        return {
          blockingMessage: categoryBudgetError,
        };
      }

      let awardedAmount: number;
      let parsedCategories: CreateFundRequest["categories"];
      try {
        awardedAmount = parsePositiveAmountExpression(values.awardedAmount, "交付額");
        parsedCategories = categories.map((category) => ({
          name: category.name,
          amount: parseNonnegativeAmountExpression(category.amount, "予算額"),
          crossAggregateCategory: category.crossAggregateCategory || "unset",
        }));
      } catch (error) {
        return {
          blockingMessage: error instanceof Error ? error.message : "金額を確認してください。",
        };
      }

      const result = await apiMutateJson<{ fundId: number }, CreateFundRequest>("/api/funds", "POST", {
          name: values.name,
          fiscalYear: Number(values.fiscalYear),
          awardedAmount,
          notes: values.notes,
          projectTagIds: selectedProjectTagIds,
          auxiliaryLabelIds: selectedAuxiliaryLabelIds,
          categories: parsedCategories,
      });

      if (!result.ok) {
        return {
          blockingMessage: result.error.message,
        };
      }

      await invalidateFinancialSummaryQueries(queryClient);
      await queryClient.invalidateQueries({ queryKey: queryKeys.overview.detail(Number(values.fiscalYear)) });
      await navigate(`/funds/${result.data.fundId}${setFiscalYearInSearch("", Number(values.fiscalYear))}`);

      return {
        infoMessage: "予算を保存しました。",
      };
    }, "予算を保存できませんでした。");
  }

  return (
    <section className="budget-form-panel">
      <div className="budget-form-panel-header">
        <div>
          <h2>新規予算を作成</h2>
        </div>
      </div>

      <form className="budget-entry-form" onSubmit={handleSubmit}>
        <FundFormFields
          addCategoryRow={addCategoryRow}
          categories={categories}
          isSubmitting={isSubmitting}
          projectTagOptions={classificationData.projectTags}
          auxiliaryLabelOptions={classificationData.auxiliaryLabels}
          selectedProjectTagIds={selectedProjectTagIds}
          selectedAuxiliaryLabelIds={selectedAuxiliaryLabelIds}
          onProjectTagIdsChange={setSelectedProjectTagIds}
          onAuxiliaryLabelIdsChange={setSelectedAuxiliaryLabelIds}
          removeCategoryRow={removeCategoryRow}
          setValue={setValue}
          updateCategory={updateCategory}
          values={values}
        />

        <div className="budget-form-actions">
          <button
            type="button"
            className="budget-modal-secondary"
            disabled={isSubmitting}
            onClick={handleClose}
          >
            閉じる
          </button>
          <button
            className={`budget-entry-submit${categoryBudgetError ? " budget-entry-submit-disabled" : ""}`}
            disabled={isSubmitting || Boolean(categoryBudgetError)}
            type="submit"
          >
            {isSubmitting ? "保存中..." : "保存"}
          </button>
        </div>
      </form>

      <FormFeedback
        blockingMessage={categoryBudgetError || blockingMessage}
        infoMessage={infoMessage}
        warnings={warnings}
      />
    </section>
  );
}

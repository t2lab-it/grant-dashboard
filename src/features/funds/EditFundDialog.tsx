import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModalShell } from "../../app/ModalShell";
import { apiFetch, apiGet } from "../../lib/api";
import type { ClassificationResponse, ClassificationTag } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";
import { FormFeedback } from "../forms/FormFeedback";
import { readApiErrorMessage } from "../forms/useEntryForm";
import { buildFundBudgetSummary, FundBudgetSummary } from "./FundBudgetSummary";
import {
  FundFormFields,
  createFundCategoryDraft,
  nextFundCategoryDraftId,
  type FundCategoryDraft,
} from "./FundFormFields";
import { useCloseOnEscape } from "./fundDetailDialogSupport";

type EditFundDialogProps = {
  fundId: number;
  initialValues: {
    name: string;
    fiscalYear: number;
    awardedAmount: number;
    notes: string;
    projectTags?: ClassificationTag[];
    auxiliaryLabels?: ClassificationTag[];
    categories: Array<{
      id: number;
      name: string;
      amount: number | null;
      crossAggregateCategory?: FundCategoryDraft["crossAggregateCategory"];
    }>;
  };
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function EditFundDialog({ fundId, initialValues, onClose, onSaved }: EditFundDialogProps) {
  const [values, setValues] = useState({
    name: initialValues.name,
    fiscalYear: String(initialValues.fiscalYear),
    awardedAmount: String(initialValues.awardedAmount),
    notes: initialValues.notes,
  });
  const [categories, setCategories] = useState<FundCategoryDraft[]>(
    initialValues.categories.map((category, index) =>
      createFundCategoryDraft(index + 1, {
        categoryId: category.id,
        name: category.name,
        amount: String(category.amount ?? 0),
        crossAggregateCategory: category.crossAggregateCategory ?? "unset",
      }),
    ),
  );
  const [selectedProjectTagIds, setSelectedProjectTagIds] = useState<number[]>(
    initialValues.projectTags?.map((tag) => tag.id) ?? [],
  );
  const [selectedAuxiliaryLabelIds, setSelectedAuxiliaryLabelIds] = useState<number[]>(
    initialValues.auxiliaryLabels?.map((tag) => tag.id) ?? [],
  );
  const [blockingMessage, setBlockingMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { awardedAmount, categoryTotal, balance } = buildFundBudgetSummary(
    categories.map((category) => category.amount),
    values.awardedAmount,
  );
  const isAwardedAmountEntered = values.awardedAmount.trim().length > 0;
  const categoryBudgetError =
    isAwardedAmountEntered && categoryTotal > awardedAmount
      ? "費目予算の合計が交付額を超えています。"
      : "";
  const { data: rawClassificationData } = useQuery({
    queryKey: ["classifications"],
    queryFn: () => apiGet<ClassificationResponse>("/api/classifications"),
  });
  const classificationData = normalizeClassifications(rawClassificationData);

  useCloseOnEscape(onClose, !isSubmitting);

  function setValue<K extends keyof typeof values>(field: K, value: (typeof values)[K]) {
    setValues((currentValues) => ({ ...currentValues, [field]: value }));
  }

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (categoryBudgetError) {
      setBlockingMessage(categoryBudgetError);
      return;
    }

    setIsSubmitting(true);
    setBlockingMessage("");

    try {
      const response = await apiFetch(`/api/funds/${fundId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          fiscalYear: Number(values.fiscalYear),
          awardedAmount: Number(values.awardedAmount),
          notes: values.notes,
          projectTagIds: selectedProjectTagIds,
          auxiliaryLabelIds: selectedAuxiliaryLabelIds,
          categories: categories.map((category) => ({
            ...(category.categoryId === undefined ? {} : { id: category.categoryId }),
            name: category.name,
            amount: category.amount.trim().length > 0 ? Number(category.amount) : Number.NaN,
            crossAggregateCategory: category.crossAggregateCategory || "unset",
          })),
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        setBlockingMessage(readApiErrorMessage(payload, "予算を保存できませんでした。"));
        return;
      }

      await onSaved();
      onClose();
    } catch {
      setBlockingMessage("予算を保存できませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      ariaLabelledBy="edit-fund-dialog-title"
      canCloseOnBackdrop={!isSubmitting}
      onRequestClose={onClose}
    >
      <>
        <div className="budget-modal-header">
          <div>
            <h3 id="edit-fund-dialog-title">予算を編集</h3>
            <p className="budget-modal-description">{initialValues.name}</p>
          </div>
        </div>

        <form
          className="budget-entry-form"
          data-testid="tour-target-fund-edit-form"
          data-tour-id="fund-edit-form"
          onSubmit={handleSubmit}
        >
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
          <FundBudgetSummary balance={balance} />
          <div className="budget-modal-actions">
            <button
              type="button"
              className="budget-modal-secondary"
              disabled={isSubmitting}
              onClick={onClose}
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
          infoMessage=""
          warnings={[]}
        />
      </>
    </ModalShell>
  );
}

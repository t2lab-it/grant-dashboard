import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModalShell } from "../../app/ModalShell";
import { apiGet, apiMutateJson } from "../../lib/api";
import type { ClassificationResponse, ClassificationTag } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";
import { FormFeedback } from "../forms/FormFeedback";
import { parseNonnegativeAmountExpression, parsePositiveAmountExpression } from "../forms/amountExpression";
import { buildFundBudgetSummary } from "./FundBudgetSummary";
import {
  FundFormFields,
  createFundCategoryDraft,
  nextFundCategoryDraftId,
  type FundCategoryDraft,
} from "./FundFormFields";

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
  const { awardedAmount, categoryTotal } = buildFundBudgetSummary(
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

    let awardedAmount: number;
    let parsedCategories: Array<{ id?: number; name: string; amount: number; crossAggregateCategory: string }>;
    try {
      awardedAmount = parsePositiveAmountExpression(values.awardedAmount, "交付額");
      parsedCategories = categories.map((category) => ({
        ...(category.categoryId === undefined ? {} : { id: category.categoryId }),
        name: category.name,
        amount: parseNonnegativeAmountExpression(category.amount, "予算額"),
        crossAggregateCategory: category.crossAggregateCategory || "unset",
      }));
    } catch (error) {
      setBlockingMessage(error instanceof Error ? error.message : "金額を確認してください。");
      return;
    }

    setIsSubmitting(true);
    setBlockingMessage("");

    try {
      const result = await apiMutateJson(`/api/funds/${fundId}`, "PUT", {
          name: values.name,
          fiscalYear: Number(values.fiscalYear),
          awardedAmount,
          notes: values.notes,
          projectTagIds: selectedProjectTagIds,
          auxiliaryLabelIds: selectedAuxiliaryLabelIds,
          categories: parsedCategories,
      });

      if (!result.ok) {
        setBlockingMessage(result.error.message);
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
      canClose={!isSubmitting}
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

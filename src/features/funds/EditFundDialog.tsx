import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModalShell } from "../../app/ModalShell";
import { apiGet, apiMutateJson } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
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
import type { UpdateFundRequest } from "../../contracts/requestSchemas";

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
  onDeleted: () => Promise<void>;
  onSaved: () => Promise<void>;
};

export function EditFundDialog({ fundId, initialValues, onClose, onDeleted, onSaved }: EditFundDialogProps) {
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
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
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
    queryKey: queryKeys.classifications.all,
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
    let parsedCategories: UpdateFundRequest["categories"];
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
      const result = await apiMutateJson<unknown, UpdateFundRequest>(`/api/funds/${fundId}`, "PUT", {
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

  async function handleDelete() {
    if (deleteConfirmationName !== initialValues.name) {
      return;
    }

    setIsSubmitting(true);
    setBlockingMessage("");

    try {
      const result = await apiMutateJson(`/api/funds/${fundId}`, "DELETE");

      if (!result.ok) {
        setBlockingMessage(result.error.message);
        return;
      }

      await onDeleted();
    } catch {
      setBlockingMessage("予算を削除できませんでした。");
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
            <h3 id="edit-fund-dialog-title">{isConfirmingDelete ? "予算を削除" : "予算を編集"}</h3>
            <p className="budget-modal-description">{initialValues.name}</p>
          </div>
        </div>

        {isConfirmingDelete ? (
          <div className="budget-entry-form">
            <p className="budget-modal-copy">
              この予算を削除すると、費目、計画項目、精算項目もすべて削除されます。この操作は取り消せません。
            </p>
            <label className="budget-entry-field">
              <span>確認のため予算名「{initialValues.name}」を入力してください。</span>
              <input
                aria-label="削除する予算名"
                autoComplete="off"
                disabled={isSubmitting}
                onChange={(event) => setDeleteConfirmationName(event.target.value)}
                value={deleteConfirmationName}
              />
            </label>
            <div className="budget-modal-actions">
              <button
                type="button"
                className="budget-modal-secondary"
                disabled={isSubmitting}
                onClick={() => {
                  setBlockingMessage("");
                  setDeleteConfirmationName("");
                  setIsConfirmingDelete(false);
                }}
              >
                編集に戻る
              </button>
              <button
                type="button"
                className="detail-action-button detail-action-button-danger"
                disabled={isSubmitting || deleteConfirmationName !== initialValues.name}
                onClick={handleDelete}
              >
                {isSubmitting ? "削除中..." : "予算を完全に削除"}
              </button>
            </div>
          </div>
        ) : (
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
            <div className="budget-modal-actions budget-modal-actions-between">
              <button
                type="button"
                aria-label="予算を削除"
                className="detail-action-button detail-action-button-danger"
                disabled={isSubmitting}
                onClick={() => {
                  setBlockingMessage("");
                  setDeleteConfirmationName("");
                  setIsConfirmingDelete(true);
                }}
              >
                削除
              </button>
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
            </div>
          </form>
        )}

        <FormFeedback
          blockingMessage={isConfirmingDelete ? blockingMessage : categoryBudgetError || blockingMessage}
          infoMessage=""
          warnings={[]}
        />
      </>
    </ModalShell>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModalShell } from "../../app/ModalShell";
import { apiGet, apiMutateJson } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { ClassificationCheckboxGroup } from "../classifications/ClassificationCheckboxGroup";
import type { ClassificationResponse } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";
import { FundCategorySelectFields } from "../forms/FundCategorySelectFields";
import { FormFeedback } from "../forms/FormFeedback";
import { parsePositiveAmountExpression } from "../forms/amountExpression";
import { useBudgetTargetOptions } from "./fundDetailDialogSupport";
import type { PlannedItem } from "./fundDetailTypes";

export type EditPlannedItemDialogProps = {
  fundId: number;
  fiscalYear: number;
  item: PlannedItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function EditPlannedItemDialog({
  fundId,
  fiscalYear,
  item,
  onClose,
  onSaved,
}: EditPlannedItemDialogProps) {
  const [selectedFundId, setSelectedFundId] = useState(String(fundId));
  const [selectedCategoryId, setSelectedCategoryId] = useState(String(item.categoryId));
  const [scheduledMonth, setScheduledMonth] = useState(item.scheduledMonth);
  const [description, setDescription] = useState(item.description);
  const [amount, setAmount] = useState(String(item.amount));
  const [notes, setNotes] = useState(item.notes);
  const [selectedAuxiliaryLabelIds, setSelectedAuxiliaryLabelIds] = useState<number[]>(
    item.auxiliaryLabels?.map((label) => label.id) ?? [],
  );
  const [blockingMessage, setBlockingMessage] = useState("");
  const [infoMessage, setInfoMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const { funds, categories, areCategoriesLoaded, hasSelectedFund } = useBudgetTargetOptions(
    selectedFundId,
    fiscalYear,
    true,
  );
  const { data: rawClassificationData } = useQuery({
    queryKey: queryKeys.classifications.all,
    queryFn: () => apiGet<ClassificationResponse>("/api/classifications"),
  });
  const classificationData = normalizeClassifications(rawClassificationData);

  useEffect(() => {
    if (selectedCategoryId.length === 0 || !areCategoriesLoaded) {
      return;
    }

    if (!categories.some((category) => String(category.id) === selectedCategoryId)) {
      setSelectedCategoryId("");
    }
  }, [areCategoriesLoaded, categories, selectedCategoryId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setBlockingMessage("");
    setInfoMessage("");
    setWarnings([]);

    let parsedAmount: number;
    try {
      parsedAmount = parsePositiveAmountExpression(amount, "金額");
    } catch (error) {
      setBlockingMessage(error instanceof Error ? error.message : "金額を確認してください。");
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await apiMutateJson<{ warnings?: unknown }>(`/api/planned-items/${item.id}`, "PUT", {
          fundId: Number(selectedFundId),
          categoryId: Number(selectedCategoryId),
          scheduledMonth,
          description,
          amount: parsedAmount,
          notes,
          auxiliaryLabelIds: selectedAuxiliaryLabelIds,
      });

      if (!result.ok) {
        setBlockingMessage(result.error.message);
        return;
      }

      await onSaved();
      const nextWarnings = Array.isArray(result.data.warnings)
        ? result.data.warnings.filter((warning: unknown): warning is string => typeof warning === "string")
        : [];

      if (nextWarnings.length > 0) {
        setInfoMessage("計画項目を保存しました。警告を確認してください。");
        setWarnings(nextWarnings);
        return;
      }

      onClose();
    } catch {
      setBlockingMessage("計画項目を更新できませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    setIsSubmitting(true);
    setBlockingMessage("");
    setInfoMessage("");
    setWarnings([]);

    try {
      const result = await apiMutateJson(`/api/planned-items/${item.id}/cancel`, "POST");

      if (!result.ok) {
        setBlockingMessage(result.error.message);
        return;
      }

      await onSaved();
      onClose();
    } catch {
      setBlockingMessage("計画項目を取り消せませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsSubmitting(true);
    setBlockingMessage("");
    setInfoMessage("");
    setWarnings([]);

    try {
      const result = await apiMutateJson(`/api/planned-items/${item.id}`, "DELETE");

      if (!result.ok) {
        setBlockingMessage(result.error.message);
        return;
      }

      await onSaved();
      onClose();
    } catch {
      setBlockingMessage("計画項目を削除できませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      ariaLabelledBy="edit-planned-item-dialog-title"
      canClose={!isSubmitting}
      onRequestClose={onClose}
    >
      <>
        <div className="budget-modal-header">
          <div>
            <h3 id="edit-planned-item-dialog-title">計画項目を編集</h3>
            <p className="budget-modal-description">{item.description}</p>
          </div>
        </div>

        <form className="budget-entry-form" onSubmit={handleSubmit}>
          <FundCategorySelectFields
            categories={categories}
            categoryId={selectedCategoryId}
            categoryLabel="費目ID"
            fundId={selectedFundId}
            fundLabel="資金ID"
            funds={funds}
            hasSelectedFund={hasSelectedFund}
            onCategoryChange={setSelectedCategoryId}
            onFundChange={(value) => {
              setSelectedFundId(value);
              setSelectedCategoryId("");
            }}
          />
          <label className="budget-entry-field">
            <span>執行予定月</span>
            <input
              aria-label="執行予定月"
              name="scheduledMonth"
              onChange={(event) => setScheduledMonth(event.target.value)}
              value={scheduledMonth}
            />
          </label>
          <label className="budget-entry-field">
            <span>説明</span>
            <input
              aria-label="説明"
              name="description"
              onChange={(event) => setDescription(event.target.value)}
              value={description}
            />
          </label>
          <label className="budget-entry-field">
            <span>金額</span>
            <input
              aria-label="金額"
              data-direct-number-input="true"
              name="amount"
              onChange={(event) => setAmount(event.target.value)}
              type="text"
              inputMode="decimal"
              value={amount}
            />
          </label>
          <label className="budget-entry-field">
            <span>メモ</span>
            <textarea
              aria-label="メモ"
              name="notes"
              onChange={(event) => setNotes(event.target.value)}
              rows={4}
              value={notes}
            />
          </label>
          <ClassificationCheckboxGroup
            title="補助ラベル"
            options={classificationData.auxiliaryLabels}
            selectedIds={selectedAuxiliaryLabelIds}
            onChange={setSelectedAuxiliaryLabelIds}
          />
          <div className="budget-modal-actions budget-modal-actions-between">
            <div className="budget-modal-actions">
              <button
                type="button"
                className="detail-action-button detail-action-button-danger"
                disabled={isSubmitting}
                onClick={handleCancel}
              >
                取消
              </button>
              <button
                type="button"
                className="detail-action-button detail-action-button-danger"
                disabled={isSubmitting}
                onClick={handleDelete}
              >
                削除
              </button>
            </div>
            <div className="budget-modal-actions">
              <button type="button" className="budget-modal-secondary" onClick={onClose}>
                閉じる
              </button>
              <button className="budget-entry-submit" disabled={isSubmitting} type="submit">
                {isSubmitting ? "保存中..." : "更新を保存"}
              </button>
            </div>
          </div>
        </form>

        <FormFeedback
          blockingMessage={blockingMessage}
          infoMessage={infoMessage}
          warnings={warnings}
        />
      </>
    </ModalShell>
  );
}

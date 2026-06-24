import { useEffect, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModalShell } from "../../app/ModalShell";
import { apiFetch, apiGet } from "../../lib/api";
import { ClassificationCheckboxGroup } from "../classifications/ClassificationCheckboxGroup";
import type { ClassificationResponse } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";
import { FundCategorySelectFields } from "../forms/FundCategorySelectFields";
import { FormFeedback } from "../forms/FormFeedback";
import { DateField, formatDateForDisplay, normalizeDateForApi } from "../forms/DateField";
import { parsePositiveAmountExpression } from "../forms/amountExpression";
import { readApiErrorMessage } from "../forms/useEntryForm";
import { useBudgetTargetOptions, useCloseOnEscape } from "./fundDetailDialogSupport";
import type { ActualEntry, PlannedItem } from "./fundDetailTypes";

export type ActualEntryDialogProps =
  | {
      mode: "create";
      fundId: number;
      item: PlannedItem;
      onClose: () => void;
      onSaved: () => Promise<void>;
    }
  | {
      mode: "edit";
      currentCategoryId: number | null;
      currentFundId: number;
      entry: ActualEntry;
      onClose: () => void;
      onSaved: () => Promise<void>;
    }
  | {
      mode: "duplicate";
      currentFundId: number;
      entry: ActualEntry;
      onClose: () => void;
      onSaved: () => Promise<void>;
    };

export function ActualEntryDialog(props: ActualEntryDialogProps) {
  const isEditMode = props.mode === "edit";
  const isDuplicateMode = props.mode === "duplicate";
  const actualDateInitialValue = isEditMode
    ? props.entry.actualDate
    : new Date().toISOString().slice(0, 10);
  const descriptionInitialValue =
    isEditMode || isDuplicateMode ? props.entry.description : props.item.description;
  const amountInitialValue =
    isEditMode || isDuplicateMode ? String(props.entry.amount) : String(props.item.amount);
  const notesInitialValue = isEditMode || isDuplicateMode ? props.entry.notes : props.item.notes;
  const auxiliaryLabelsInitialValue =
    isEditMode || isDuplicateMode ? props.entry.auxiliaryLabels : [];
  const dialogTitle = isEditMode
    ? "精算項目を編集"
    : isDuplicateMode
      ? "精算項目を複製"
      : "計画項目を精算";
  const submitLabel = isEditMode ? "更新を保存" : isDuplicateMode ? "複製を保存" : "精算を登録";
  const submittingLabel = isEditMode ? "保存中..." : isDuplicateMode ? "保存中..." : "登録中...";
  const submitErrorMessage = isEditMode
    ? "精算項目を更新できませんでした。"
    : isDuplicateMode
      ? "精算項目を複製できませんでした。"
      : "精算を登録できませんでした。";
  const [actualDate, setActualDate] = useState(formatDateForDisplay(actualDateInitialValue));
  const [description, setDescription] = useState(descriptionInitialValue);
  const [amount, setAmount] = useState(amountInitialValue);
  const [notes, setNotes] = useState(notesInitialValue);
  const [selectedAuxiliaryLabelIds, setSelectedAuxiliaryLabelIds] = useState<number[]>(
    auxiliaryLabelsInitialValue?.map((label) => label.id) ?? [],
  );
  const [keepRemainingPlanned, setKeepRemainingPlanned] = useState(false);
  const [selectedFundId, setSelectedFundId] = useState(
    isEditMode || isDuplicateMode ? String(props.currentFundId) : String(props.fundId),
  );
  const [selectedCategoryId, setSelectedCategoryId] = useState(
    isEditMode && props.currentCategoryId !== null ? String(props.currentCategoryId) : "",
  );
  const currentCategoryName = isEditMode ? props.entry.categoryName : "";
  const [blockingMessage, setBlockingMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { funds, categories, areCategoriesLoaded, hasSelectedFund } = useBudgetTargetOptions(
    selectedFundId,
    isEditMode,
  );
  const { data: rawClassificationData } = useQuery({
    queryKey: ["classifications"],
    queryFn: () => apiGet<ClassificationResponse>("/api/classifications"),
  });
  const classificationData = normalizeClassifications(rawClassificationData);

  useCloseOnEscape(props.onClose, !isSubmitting);

  useEffect(() => {
    if (!isEditMode) {
      return;
    }

    if (!areCategoriesLoaded) {
      return;
    }

    if (selectedCategoryId.length === 0) {
      const matchedCategory = categories.find((category) => category.categoryName === currentCategoryName);
      if (matchedCategory) {
        setSelectedCategoryId(String(matchedCategory.id));
      }
      return;
    }

    if (!categories.some((category) => String(category.id) === selectedCategoryId)) {
      setSelectedCategoryId("");
    }
  }, [areCategoriesLoaded, categories, currentCategoryName, isEditMode, selectedCategoryId]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setBlockingMessage("");

    let parsedAmount: number;
    try {
      parsedAmount = parsePositiveAmountExpression(amount, "金額");
    } catch (error) {
      setBlockingMessage(error instanceof Error ? error.message : "金額を確認してください。");
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await apiFetch(isEditMode ? `/api/actual-entries/${props.entry.id}` : "/api/actual-entries", {
        method: isEditMode ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isEditMode
            ? {
                fundId: Number(selectedFundId),
                categoryId: Number(selectedCategoryId),
                actualDate: normalizeDateForApi(actualDate),
                description,
                amount: parsedAmount,
                notes,
                auxiliaryLabelIds: selectedAuxiliaryLabelIds,
              }
            : isDuplicateMode
              ? {
                  fundId: props.currentFundId,
                  categoryId: props.entry.categoryId,
                  actualDate: normalizeDateForApi(actualDate),
                  description,
                  amount: parsedAmount,
                  notes,
                  auxiliaryLabelIds: selectedAuxiliaryLabelIds,
                }
            : {
                fundId: props.fundId,
                categoryId: props.item.categoryId,
                plannedItemId: props.item.id,
                actualDate: normalizeDateForApi(actualDate),
                description,
                amount: parsedAmount,
                notes,
                auxiliaryLabelIds: selectedAuxiliaryLabelIds,
                keepRemainingPlanned,
              },
        ),
      });
      const payload = await response.json();

      if (!response.ok) {
        setBlockingMessage(readApiErrorMessage(payload, submitErrorMessage));
        return;
      }

      await props.onSaved();
      props.onClose();
    } catch {
      setBlockingMessage(submitErrorMessage);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCancel() {
    if (!isEditMode) {
      return;
    }

    setIsSubmitting(true);
    setBlockingMessage("");

    try {
      const response = await apiFetch(`/api/actual-entries/${props.entry.id}/cancel`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        setBlockingMessage(readApiErrorMessage(payload, "精算項目を取り消せませんでした。"));
        return;
      }

      await props.onSaved();
      props.onClose();
    } catch {
      setBlockingMessage("精算項目を取り消せませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      ariaLabelledBy="settle-planned-item-dialog-title"
      canCloseOnBackdrop={!isSubmitting}
      onRequestClose={props.onClose}
    >
      <>
        <div className="budget-modal-header">
          <div>
            <h3 id="settle-planned-item-dialog-title">{dialogTitle}</h3>
            <p className="budget-modal-description">{descriptionInitialValue}</p>
          </div>
        </div>

        <form className="budget-entry-form" onSubmit={handleSubmit}>
          {isEditMode ? (
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
          ) : null}
          <DateField
            buttonAriaLabel="実績日カレンダーを開く"
            calendarAriaLabel="実績日カレンダー"
            label="実績日"
            name="actualDate"
            onChange={setActualDate}
            textAriaLabel="実績日"
            value={actualDate}
          />
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
          {!isEditMode && !isDuplicateMode ? (
            <label className="budget-entry-checkbox">
              <input
                checked={keepRemainingPlanned}
                name="keepRemainingPlanned"
                onChange={(event) => setKeepRemainingPlanned(event.target.checked)}
                type="checkbox"
              />
              <span>残額を予定として残す</span>
            </label>
          ) : null}
          <ClassificationCheckboxGroup
            title="補助ラベル"
            options={classificationData.auxiliaryLabels}
            selectedIds={selectedAuxiliaryLabelIds}
            onChange={setSelectedAuxiliaryLabelIds}
          />
          {isEditMode ? (
            <div className="budget-modal-actions budget-modal-actions-between">
              <button
                type="button"
                className="detail-action-button detail-action-button-danger"
                disabled={isSubmitting}
                onClick={handleCancel}
              >
                {isSubmitting ? "取り消し中..." : "精算を取り消す"}
              </button>
              <div className="budget-modal-actions">
                <button type="button" className="budget-modal-secondary" onClick={props.onClose}>
                  閉じる
                </button>
                <button className="budget-entry-submit" disabled={isSubmitting} type="submit">
                  {isSubmitting ? submittingLabel : submitLabel}
                </button>
              </div>
            </div>
          ) : (
            <div className="budget-modal-actions">
              <button type="button" className="budget-modal-secondary" onClick={props.onClose}>
                閉じる
              </button>
              <button className="budget-entry-submit" disabled={isSubmitting} type="submit">
                {isSubmitting ? submittingLabel : submitLabel}
              </button>
            </div>
          )}
        </form>

        <FormFeedback blockingMessage={blockingMessage} infoMessage="" warnings={[]} />
      </>
    </ModalShell>
  );
}

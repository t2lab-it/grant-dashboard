import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ModalShell } from "../../app/ModalShell";
import { apiGet, apiMutateJson } from "../../lib/api";
import { queryKeys } from "../../lib/queryKeys";
import { formatTokyoDateKey } from "../../lib/calendar";
import { ClassificationCheckboxGroup } from "../classifications/ClassificationCheckboxGroup";
import type { ClassificationResponse } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";
import { DateField, formatDateForDisplay, normalizeDateForApi } from "../forms/DateField";
import { FormFeedback } from "../forms/FormFeedback";
import { parsePositiveAmountExpression } from "../forms/amountExpression";
import type { PlannedItem } from "./fundDetailTypes";

type DuplicatePlannedItemDialogProps = {
  fundId: number;
  item: PlannedItem;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function DuplicatePlannedItemDialog({
  fundId,
  item,
  onClose,
  onSaved,
}: DuplicatePlannedItemDialogProps) {
  const [plannedDate, setPlannedDate] = useState(formatDateForDisplay(formatTokyoDateKey(new Date())));
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
  const { data: rawClassificationData } = useQuery({
    queryKey: queryKeys.classifications.all,
    queryFn: () => apiGet<ClassificationResponse>("/api/classifications"),
  });
  const classificationData = normalizeClassifications(rawClassificationData);

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
      const result = await apiMutateJson<{ warnings?: unknown }>("/api/planned-items", "POST", {
          fundId,
          categoryId: item.categoryId,
          plannedDate: normalizeDateForApi(plannedDate),
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
        setInfoMessage("計画項目を複製しました。警告を確認してください。");
        setWarnings(nextWarnings);
        return;
      }

      onClose();
    } catch {
      setBlockingMessage("計画項目を複製できませんでした。");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ModalShell
      ariaLabelledBy="duplicate-planned-item-dialog-title"
      canClose={!isSubmitting}
      onRequestClose={onClose}
    >
      <>
        <div className="budget-modal-header">
          <div>
            <h3 id="duplicate-planned-item-dialog-title">計画項目を複製</h3>
            <p className="budget-modal-description">{item.description}</p>
          </div>
        </div>

        <form className="budget-entry-form" onSubmit={handleSubmit}>
          <DateField
            buttonAriaLabel="立案日カレンダーを開く"
            calendarAriaLabel="立案日カレンダー"
            label="立案日"
            name="plannedDate"
            onChange={setPlannedDate}
            textAriaLabel="立案日"
            value={plannedDate}
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
          <div className="budget-modal-actions">
            <button type="button" className="budget-modal-secondary" onClick={onClose}>
              閉じる
            </button>
            <button className="budget-entry-submit" disabled={isSubmitting} type="submit">
              {isSubmitting ? "保存中..." : "複製を保存"}
            </button>
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

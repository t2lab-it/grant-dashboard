import { ClassificationCheckboxGroup } from "../classifications/ClassificationCheckboxGroup";
import { FundCategoryBudgetChart } from "./FundCategoryBudgetChart";
import type { ClassificationTag } from "../classifications/classificationTypes";
import {
  CROSS_AGGREGATE_CATEGORY_CODES,
  CROSS_AGGREGATE_CATEGORY_LABELS,
  type CrossAggregateCategory,
} from "../../contracts/crossAggregateCategory";

type FundFormValues = {
  name: string;
  fiscalYear: string;
  awardedAmount: string;
  notes: string;
};

export type FundCategoryDraft = {
  id: number;
  categoryId?: number;
  name: string;
  amount: string;
  crossAggregateCategory: CrossAggregateCategory | "";
};

export function createFundCategoryDraft(
  id: number,
  initial?: Partial<Pick<FundCategoryDraft, "categoryId" | "name" | "amount" | "crossAggregateCategory">>,
): FundCategoryDraft {
  return {
    id,
    categoryId: initial?.categoryId,
    name: initial?.name ?? "",
    amount: initial?.amount ?? "",
    crossAggregateCategory: initial?.crossAggregateCategory ?? "",
  };
}

export function nextFundCategoryDraftId(categories: FundCategoryDraft[]) {
  return categories.reduce((maxId, category) => Math.max(maxId, category.id), 0) + 1;
}

type FundFormFieldsProps = {
  categories: FundCategoryDraft[];
  isSubmitting: boolean;
  values: FundFormValues;
  setValue: <K extends keyof FundFormValues>(field: K, value: FundFormValues[K]) => void;
  updateCategory: (
    id: number,
    field: "name" | "amount" | "crossAggregateCategory",
    nextValue: string,
  ) => void;
  addCategoryRow: () => void;
  removeCategoryRow: (id: number) => void;
  projectTagOptions?: ClassificationTag[];
  auxiliaryLabelOptions?: ClassificationTag[];
  selectedProjectTagIds?: number[];
  selectedAuxiliaryLabelIds?: number[];
  onProjectTagIdsChange?: (selectedIds: number[]) => void;
  onAuxiliaryLabelIdsChange?: (selectedIds: number[]) => void;
};

export function FundFormFields({
  categories,
  isSubmitting,
  values,
  setValue,
  updateCategory,
  addCategoryRow,
  removeCategoryRow,
  projectTagOptions = [],
  auxiliaryLabelOptions = [],
  selectedProjectTagIds = [],
  selectedAuxiliaryLabelIds = [],
  onProjectTagIdsChange,
  onAuxiliaryLabelIdsChange,
}: FundFormFieldsProps) {
  const hasUnsetCrossAggregateCategory = categories.some(
    (category) => category.crossAggregateCategory === "" || category.crossAggregateCategory === "unset",
  );

  return (
    <>
      <label className="budget-entry-field">
        <span>予算名</span>
        <input
          aria-label="予算名"
          name="name"
          onChange={(event) => setValue("name", event.target.value)}
          value={values.name}
        />
      </label>
      <label className="budget-entry-field">
        <span>年度</span>
        <input
          aria-label="年度"
          data-direct-number-input="true"
          name="fiscalYear"
          onChange={(event) => setValue("fiscalYear", event.target.value)}
          type="number"
          value={values.fiscalYear}
        />
      </label>
      <label className="budget-entry-field">
        <span>交付額</span>
        <input
          aria-label="交付額"
          data-direct-number-input="true"
          name="awardedAmount"
          onChange={(event) => setValue("awardedAmount", event.target.value)}
          type="text"
          inputMode="decimal"
          value={values.awardedAmount}
        />
      </label>
      <label className="budget-entry-field">
        <span>予算メモ</span>
        <textarea
          aria-label="予算メモ"
          name="notes"
          onChange={(event) => setValue("notes", event.target.value)}
          rows={3}
          value={values.notes}
        />
      </label>
      <ClassificationCheckboxGroup
        title="研究プロジェクトタグ"
        options={projectTagOptions}
        selectedIds={selectedProjectTagIds}
        onChange={onProjectTagIdsChange ?? (() => undefined)}
      />
      <ClassificationCheckboxGroup
        title="補助ラベル"
        options={auxiliaryLabelOptions}
        selectedIds={selectedAuxiliaryLabelIds}
        onChange={onAuxiliaryLabelIdsChange ?? (() => undefined)}
      />

      <section className="budget-category-section" aria-label="費目一覧">
        <div className="budget-category-section-header">
          <h3>費目</h3>
          <button
            className="budget-category-add"
            disabled={isSubmitting}
            onClick={addCategoryRow}
            type="button"
          >
            費目を追加
          </button>
        </div>
        <div className="budget-category-list">
          {categories.map((category) => (
            <div key={category.id} className="budget-category-row">
              <label className="budget-entry-field">
                <span>費目名</span>
                <input
                  aria-label="費目名"
                  onChange={(event) => updateCategory(category.id, "name", event.target.value)}
                  value={category.name}
                />
              </label>
              <label className="budget-entry-field">
                <span>予算額</span>
                <input
                  aria-label="予算額"
                  data-direct-number-input="true"
                  onChange={(event) => updateCategory(category.id, "amount", event.target.value)}
                  type="text"
                  inputMode="decimal"
                  value={category.amount}
                />
              </label>
              <label className="budget-entry-field">
                <span>横断集計カテゴリ</span>
                <select
                  aria-label="横断集計カテゴリ"
                  onChange={(event) =>
                    updateCategory(category.id, "crossAggregateCategory", event.target.value)
                  }
                  value={category.crossAggregateCategory}
                >
                  <option value="">選択してください</option>
                  {CROSS_AGGREGATE_CATEGORY_CODES.filter((code) => code !== "unset").map((code) => (
                    <option key={code} value={code}>
                      {CROSS_AGGREGATE_CATEGORY_LABELS[code]}
                    </option>
                  ))}
                  <option value="unset">{CROSS_AGGREGATE_CATEGORY_LABELS.unset}</option>
                </select>
              </label>
              <button
                className="budget-category-remove detail-action-button-danger"
                disabled={isSubmitting || categories.length === 1}
                onClick={() => removeCategoryRow(category.id)}
                type="button"
              >
                削除
              </button>
            </div>
          ))}
        </div>
        {hasUnsetCrossAggregateCategory ? (
          <p className="budget-form-status budget-form-status-info">
            横断集計カテゴリが未設定の費目があります。
          </p>
        ) : null}
      </section>

      <FundCategoryBudgetChart awardedAmount={values.awardedAmount} categories={categories} />
    </>
  );
}

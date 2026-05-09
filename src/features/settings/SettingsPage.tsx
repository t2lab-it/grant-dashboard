import { useEffect, useId, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { buildOverviewApiPath, getFiscalYearFromSearch } from "../../app/fiscalYear";
import { apiFetch, apiGet, apiPostJson } from "../../lib/api";
import type { ClassificationKind, ClassificationResponse, ClassificationTag } from "../classifications/classificationTypes";
import { normalizeClassifications } from "../classifications/classificationTypes";
import {
  formatRatePercentage,
  getRateThresholdClassName,
  type BalanceRateThresholds,
  type ExecutionRateThresholds,
  type RateMetricKey,
} from "../../lib/executionRate";
import {
  customOverviewChartPresetRef,
  isValidChartHexColor,
  overviewChartPresetOrder,
  overviewChartPresets,
  type CustomOverviewChartPreset,
  type OverviewChartFund,
} from "../overview/overviewChart";
import { OverviewFundChart } from "../overview/OverviewFundChart";
import { useDirectManipulationSortableList } from "../../lib/useDirectManipulationSortableList";
import { useAppSettings } from "./AppSettings";
import {
  defaultFundDetailSectionOrder,
  fundDetailSectionLabels,
  moveFundDetailSection,
} from "./fundDetailSectionOrder";

type OverviewResponse = {
  funds: Array<{
    id: number;
    name: string;
  }>;
};

type FundDetailResponse = {
  categories: Array<{
    id: number;
    categoryName: string;
  }>;
};

type TwoChoiceToggleOption<Value extends string> = {
  value: Value;
  title: string;
  copy?: string;
};

const previewFundBase: Omit<OverviewChartFund, "name"> = {
  awarded_amount: 1000000,
  committed_amount: 350000,
  actual_amount: 200000,
  freeBalance: 450000,
};

type CustomChartPresetFormState = {
  label: string;
  actual: string;
  committed: string;
  balance: string;
  balanceBorder: string;
};

const defaultCustomChartPresetForm: CustomChartPresetFormState = {
  label: "",
  actual: "#7c3aed",
  committed: "#f97316",
  balance: "#fff7ed",
  balanceBorder: "#c2410c",
};

function hexToRgb(hexColor: string) {
  const value = Number.parseInt(hexColor.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function colorDistance(firstColor: string, secondColor: string) {
  const first = hexToRgb(firstColor);
  const second = hexToRgb(secondColor);
  return Math.sqrt(
    (first.r - second.r) ** 2 + (first.g - second.g) ** 2 + (first.b - second.b) ** 2,
  );
}

function hasLowReadabilityWarning(form: CustomChartPresetFormState) {
  const colors = [form.actual, form.committed, form.balance, form.balanceBorder];
  if (!colors.every(isValidChartHexColor)) {
    return false;
  }

  return (
    colorDistance(form.balance, "#ffffff") < 36 ||
    colorDistance(form.balance, form.balanceBorder) < 36 ||
    colorDistance(form.actual, form.committed) < 36 ||
    colorDistance(form.actual, form.balance) < 36 ||
    colorDistance(form.committed, form.balance) < 36
  );
}

function randomChartHexColor() {
  return `#${Math.floor(Math.random() * 0x1000000)
    .toString(16)
    .padStart(6, "0")}`;
}

function createCustomPresetId(label: string, presets: CustomOverviewChartPreset[]) {
  const asciiBase = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = asciiBase || `preset-${Date.now().toString(36)}`;
  const usedIds = new Set(presets.map((preset) => preset.id));
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

function formFromCustomPreset(preset: CustomOverviewChartPreset): CustomChartPresetFormState {
  return {
    label: preset.label,
    actual: preset.palette.actual,
    committed: preset.palette.committed,
    balance: preset.palette.balance,
    balanceBorder: preset.palette.balanceBorder,
  };
}

const thresholdFieldOrder: Array<keyof ExecutionRateThresholds> = ["notice", "warning", "alert"];

function getSystemThemeMode() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light" as const;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function createThresholdExamples(
  metric: RateMetricKey,
  thresholds: ExecutionRateThresholds | BalanceRateThresholds,
) {
  if (metric === "balance") {
    return [
      { tone: "normal", percentage: thresholds.notice + 1 },
      {
        tone: "notice",
        percentage:
          thresholds.notice > thresholds.warning
            ? (thresholds.notice + thresholds.warning) / 2
            : null,
      },
      {
        tone: "warning",
        percentage:
          thresholds.warning > thresholds.alert
            ? (thresholds.warning + thresholds.alert) / 2
            : null,
      },
      { tone: "alert", percentage: thresholds.alert - 1 },
    ] as const;
  }

  return [
    { tone: "normal", percentage: thresholds.notice - 1 },
    {
      tone: "notice",
      percentage:
        thresholds.notice < thresholds.warning
          ? (thresholds.notice + thresholds.warning) / 2
          : null,
    },
    {
      tone: "warning",
      percentage:
        thresholds.warning < thresholds.alert
          ? (thresholds.warning + thresholds.alert) / 2
          : null,
    },
    { tone: "alert", percentage: thresholds.alert },
  ] as const;
}

function alignExecutionThresholds(
  field: keyof ExecutionRateThresholds,
  thresholds: ExecutionRateThresholds,
): ExecutionRateThresholds {
  if (field === "notice") {
    const warning = Math.max(thresholds.warning, thresholds.notice);
    const alert = Math.max(thresholds.alert, warning);
    return { notice: thresholds.notice, warning, alert };
  }

  if (field === "warning") {
    const notice = Math.min(thresholds.notice, thresholds.warning);
    const alert = Math.max(thresholds.alert, thresholds.warning);
    return { notice, warning: thresholds.warning, alert };
  }

  const warning = Math.min(thresholds.warning, thresholds.alert);
  const notice = Math.min(thresholds.notice, warning);
  return { notice, warning, alert: thresholds.alert };
}

function alignBalanceThresholds(
  field: keyof BalanceRateThresholds,
  thresholds: BalanceRateThresholds,
): BalanceRateThresholds {
  if (field === "notice") {
    const warning = Math.min(thresholds.warning, thresholds.notice);
    const alert = Math.min(thresholds.alert, warning);
    return { notice: thresholds.notice, warning, alert };
  }

  if (field === "warning") {
    const notice = Math.max(thresholds.notice, thresholds.warning);
    const alert = Math.min(thresholds.alert, thresholds.warning);
    return { notice, warning: thresholds.warning, alert };
  }

  const warning = Math.max(thresholds.warning, thresholds.alert);
  const notice = Math.max(thresholds.notice, warning);
  return { notice, warning, alert: thresholds.alert };
}

function TwoChoiceToggleGroup<Value extends string>({
  currentValue,
  options,
  onChange,
}: {
  currentValue: Value;
  options: TwoChoiceToggleOption<Value>[];
  onChange: (value: Value) => void;
}) {
  return (
    <div className="settings-theme-mode-toggle settings-toggle-strip">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={
            currentValue === option.value
              ? "settings-theme-mode-button settings-theme-mode-button-active"
              : "settings-theme-mode-button"
          }
          aria-label={option.title}
          aria-pressed={currentValue === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.title}
        </button>
      ))}
    </div>
  );
}

function SettingsHelp({ description, label }: { description: string; label: string }) {
  const helpId = useId();

  return (
    <span className="overview-context-help settings-inline-help">
      <button
        type="button"
        className="overview-context-help-trigger"
        aria-label={label}
        aria-describedby={helpId}
      >
        ?
      </button>
      <span id={helpId} role="tooltip" className="overview-context-help-tooltip settings-inline-help-tooltip">
        {description}
      </span>
    </span>
  );
}

function ClassificationCreateForm({
  kind,
  label,
  defaultColor,
  onCreated,
}: {
  kind: ClassificationKind;
  label: string;
  defaultColor: string;
  onCreated: () => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState(defaultColor);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleCreate() {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await apiPostJson<{ kind: ClassificationKind; name: string; color: string }, { id: number }>(
        "/api/classifications",
        { kind, name: trimmedName, color },
      );
      if (result.ok) {
        setName("");
        setColor(defaultColor);
        await onCreated();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="classification-create-row">
      <label className="budget-entry-field">
        <input
          aria-label={`${label}名`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="budget-entry-field classification-color-field">
        <input
          aria-label={`${label}色`}
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="detail-action-button"
        disabled={isSubmitting || name.trim().length === 0}
        onClick={handleCreate}
      >
        {label}を追加
      </button>
    </div>
  );
}

function ClassificationEditRow({
  label,
  tag,
  onChanged,
}: {
  label: string;
  tag: ClassificationTag;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setName(tag.name);
    setColor(tag.color);
  }, [tag.color, tag.name]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/api/classifications/${tag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, color }),
      });
      if (response.ok) {
        await onChanged();
        setIsEditing(false);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsSubmitting(true);
    try {
      const response = await apiFetch(`/api/classifications/${tag.id}`, { method: "DELETE" });
      if (response.ok) {
        await onChanged();
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleCancel() {
    setName(tag.name);
    setColor(tag.color);
    setIsEditing(false);
  }

  if (!isEditing) {
    return (
      <div className="classification-saved-row">
        <span className="classification-saved-label">
          <span
            className="classification-color-swatch"
            aria-label={`${label}色: ${tag.color}`}
            role="img"
            style={{ backgroundColor: tag.color }}
          />
          <span>{tag.name}</span>
          <span className="classification-saved-color-code">{tag.color}</span>
        </span>
        <button
          type="button"
          className="detail-action-button"
          aria-label={`${label}を編集: ${tag.name}`}
          disabled={isSubmitting}
          onClick={() => setIsEditing(true)}
        >
          編集
        </button>
        <button
          type="button"
          className="detail-action-button detail-action-button-danger"
          aria-label={`${label}を削除: ${tag.name}`}
          disabled={isSubmitting}
          onClick={handleDelete}
        >
          削除
        </button>
      </div>
    );
  }

  return (
    <div className="classification-edit-row">
      <label className="budget-entry-field">
        <input
          aria-label={`${label}名: ${tag.name}`}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="budget-entry-field classification-color-field">
        <input
          aria-label={`${label}色: ${name}`}
          type="color"
          value={color}
          onChange={(event) => setColor(event.target.value)}
        />
      </label>
      <button
        type="button"
        className="detail-action-button"
        disabled={isSubmitting || name.trim().length === 0}
        onClick={handleSave}
      >
        保存
      </button>
      <button
        type="button"
        className="detail-action-button"
        disabled={isSubmitting}
        onClick={handleCancel}
      >
        キャンセル
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
  );
}

export function SettingsPage() {
  const location = useLocation();
  const queryClient = useQueryClient();
  const requestedFiscalYear = getFiscalYearFromSearch(location.search);
  const {
    settings: {
      appThemeMode,
      themePreset,
      customChartPresets,
      defaultRateMetric,
      defaultOverviewDisplayMode,
      notesDisplayMode,
      defaultFundId,
      defaultCategoryId,
      amountDisplayMode,
      fundDetailSectionOrder,
      executionRateThresholds,
      balanceRateThresholds,
    },
    setAppThemeMode,
    setThemePreset,
    saveCustomChartPreset,
    deleteCustomChartPreset,
    setDefaultRateMetric,
    setDefaultOverviewDisplayMode,
    setNotesDisplayMode,
    setDefaultFundId,
    setDefaultCategoryId,
    setAmountDisplayMode,
    setFundDetailSectionOrder,
    setExecutionRateThresholds,
    setBalanceRateThresholds,
    resetExecutionRateThresholds,
    resetBalanceRateThresholds,
  } = useAppSettings();
  const hasDefaultFund = defaultFundId !== null;
  const editedThresholds =
    defaultRateMetric === "balance" ? balanceRateThresholds : executionRateThresholds;
  const thresholdExamples = createThresholdExamples(defaultRateMetric, editedThresholds);
  const thresholdDirection = defaultRateMetric === "balance" ? "<" : "≥";
  const thresholdHeading =
    defaultRateMetric === "balance" ? "残高率のしきい値" : "予算消化率のしきい値";
  const [systemThemeMode, setSystemThemeMode] = useState<"light" | "dark">(() =>
    getSystemThemeMode(),
  );
  const [customPresetEditor, setCustomPresetEditor] = useState<
    { mode: "create" } | { mode: "edit"; id: string } | null
  >(null);
  const [customPresetForm, setCustomPresetForm] = useState<CustomChartPresetFormState>(
    defaultCustomChartPresetForm,
  );
  const [customPresetSaveAttempted, setCustomPresetSaveAttempted] = useState(false);
  const customPresetLabel = customPresetForm.label.trim();
  const customPresetColors = [
    customPresetForm.actual,
    customPresetForm.committed,
    customPresetForm.balance,
    customPresetForm.balanceBorder,
  ];
  const customPresetHasInvalidColor = !customPresetColors.every(isValidChartHexColor);
  const customPresetHasWarning = hasLowReadabilityWarning(customPresetForm);
  const canSaveCustomPreset = customPresetLabel.length > 0 && !customPresetHasInvalidColor;
  const customPresetSaveLabel = customPresetHasWarning
    ? "警告付きで保存"
    : "カスタムプリセットを保存";
  const customPresetPreviewFund: OverviewChartFund = {
    name: "カスタムプリセット例",
    ...previewFundBase,
  };
  const customPresetPreviewPalette = {
    actual: isValidChartHexColor(customPresetForm.actual)
      ? customPresetForm.actual
      : defaultCustomChartPresetForm.actual,
    committed: isValidChartHexColor(customPresetForm.committed)
      ? customPresetForm.committed
      : defaultCustomChartPresetForm.committed,
    balance: isValidChartHexColor(customPresetForm.balance)
      ? customPresetForm.balance
      : defaultCustomChartPresetForm.balance,
    balanceBorder: isValidChartHexColor(customPresetForm.balanceBorder)
      ? customPresetForm.balanceBorder
      : defaultCustomChartPresetForm.balanceBorder,
  };
  const { data: overviewData } = useQuery({
    queryKey: ["overview", requestedFiscalYear ?? "auto"],
    queryFn: () => apiGet<OverviewResponse>(buildOverviewApiPath(requestedFiscalYear)),
  });
  const { data: fundDetailData } = useQuery({
    queryKey: ["fund-category-options", defaultFundId],
    queryFn: () => apiGet<FundDetailResponse>(`/api/funds/${defaultFundId}`),
    enabled: hasDefaultFund,
  });
  const { data: rawClassificationData } = useQuery({
    queryKey: ["classifications"],
    queryFn: () => apiGet<ClassificationResponse>("/api/classifications"),
  });
  const classificationData = normalizeClassifications(rawClassificationData);

  function openCreateCustomPresetEditor() {
    setCustomPresetEditor({ mode: "create" });
    setCustomPresetForm(defaultCustomChartPresetForm);
    setCustomPresetSaveAttempted(false);
  }

  function openEditCustomPresetEditor(preset: CustomOverviewChartPreset) {
    setCustomPresetEditor({ mode: "edit", id: preset.id });
    setCustomPresetForm(formFromCustomPreset(preset));
    setCustomPresetSaveAttempted(false);
  }

  function closeCustomPresetEditor() {
    setCustomPresetEditor(null);
    setCustomPresetForm(defaultCustomChartPresetForm);
    setCustomPresetSaveAttempted(false);
  }

  function updateCustomPresetForm(field: keyof CustomChartPresetFormState, value: string) {
    setCustomPresetForm((current) => ({
      ...current,
      [field]: field === "label" ? value : value.toLowerCase(),
    }));
  }

  function randomizeCustomPresetColors() {
    setCustomPresetForm((current) => ({
      ...current,
      actual: randomChartHexColor(),
      committed: randomChartHexColor(),
      balance: randomChartHexColor(),
      balanceBorder: randomChartHexColor(),
    }));
    setCustomPresetSaveAttempted(false);
  }

  function saveCustomPresetFromForm() {
    setCustomPresetSaveAttempted(true);
    if (!canSaveCustomPreset || customPresetEditor === null) {
      return;
    }

    const id =
      customPresetEditor.mode === "edit"
        ? customPresetEditor.id
        : createCustomPresetId(customPresetLabel, customChartPresets);
    const preset: CustomOverviewChartPreset = {
      id,
      label: customPresetLabel,
      palette: {
        actual: customPresetForm.actual.toLowerCase(),
        committed: customPresetForm.committed.toLowerCase(),
        balance: customPresetForm.balance.toLowerCase(),
        balanceBorder: customPresetForm.balanceBorder.toLowerCase(),
      },
    };
    saveCustomChartPreset(preset);
    setThemePreset(customOverviewChartPresetRef(id));
    closeCustomPresetEditor();
  }

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleThemeChange() {
      setSystemThemeMode(mediaQuery.matches ? "dark" : "light");
    }

    handleThemeChange();
    mediaQuery.addEventListener("change", handleThemeChange);
    return () => {
      mediaQuery.removeEventListener("change", handleThemeChange);
    };
  }, []);

  useEffect(() => {
    if (!hasDefaultFund || defaultCategoryId === null || !fundDetailData) {
      return;
    }

    const hasMatchingCategory = fundDetailData.categories.some(
      (category) => category.id === defaultCategoryId,
    );
    if (!hasMatchingCategory) {
      setDefaultCategoryId(null);
    }
  }, [defaultCategoryId, fundDetailData, hasDefaultFund, setDefaultCategoryId]);

  function updateThreshold(
    field: keyof ExecutionRateThresholds,
    nextValue: number,
  ) {
    if (defaultRateMetric === "balance") {
      setBalanceRateThresholds(
        alignBalanceThresholds(field, {
          ...balanceRateThresholds,
          [field]: nextValue,
        }),
      );
      return;
    }

    setExecutionRateThresholds(
      alignExecutionThresholds(field, {
        ...executionRateThresholds,
        [field]: nextValue,
      }),
    );
  }

  function resetThresholds() {
    if (defaultRateMetric === "balance") {
      resetBalanceRateThresholds();
      return;
    }

    resetExecutionRateThresholds();
  }
  const sectionOrderSortable = useDirectManipulationSortableList({
    items: fundDetailSectionOrder,
    onReorder: setFundDetailSectionOrder,
  });
  const effectiveThemeMode = appThemeMode === "system" ? systemThemeMode : appThemeMode;
  const refreshClassifications = () => queryClient.invalidateQueries({ queryKey: ["classifications"] });

  return (
    <section className="settings-page">
      <h2>設定</h2>
      <section className="settings-section">
        <h3>分類</h3>
        <div className="classification-settings-grid">
          <section className="classification-settings-panel" aria-label="研究プロジェクトタグ">
            <div className="classification-settings-heading">
              <h4>研究プロジェクトタグ</h4>
              <SettingsHelp
                label="研究プロジェクトタグの使い分け"
                description="研究プロジェクトタグは、同じ研究テーマや事業に紐づく複数の予算を束ねる分類です。例: 量子制御基盤、次世代通信、学内共同研究。"
              />
            </div>
            <ClassificationCreateForm
              kind="project"
              label="研究プロジェクトタグ"
              defaultColor="#2563eb"
              onCreated={refreshClassifications}
            />
            <div className="classification-edit-list">
              {classificationData.projectTags.map((tag) => (
                <ClassificationEditRow
                  key={tag.id}
                  label="研究プロジェクトタグ"
                  tag={tag}
                  onChanged={refreshClassifications}
                />
              ))}
            </div>
          </section>
          <section className="classification-settings-panel" aria-label="補助ラベル">
            <div className="classification-settings-heading">
              <h4>補助ラベル</h4>
              <SettingsHelp
                label="補助ラベルの使い分け"
                description="費目は予算額・残高・消化率を管理する会計上の分類です。補助ラベルは、予算や費目をまたいで後から探したい印です。例: 学生支援、出張、要確認。"
              />
            </div>
            <ClassificationCreateForm
              kind="auxiliary"
              label="補助ラベル"
              defaultColor="#16a34a"
              onCreated={refreshClassifications}
            />
            <div className="classification-edit-list">
              {classificationData.auxiliaryLabels.map((tag) => (
                <ClassificationEditRow
                  key={tag.id}
                  label="補助ラベル"
                  tag={tag}
                  onChanged={refreshClassifications}
                />
              ))}
            </div>
          </section>
        </div>
      </section>
      <section className="settings-section">
        <h3>入力の既定値</h3>
        <div className="settings-option-grid">
          <fieldset className="settings-option-group">
            <legend>新規作成時の既定値</legend>
            <label className="budget-entry-field">
              <span>新規作成時の既定予算</span>
              <select
                aria-label="新規作成時の既定予算"
                value={defaultFundId === null ? "" : String(defaultFundId)}
                onChange={(event) =>
                  setDefaultFundId(
                    event.target.value.length > 0 ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">設定しない</option>
                {overviewData?.funds.map((fund) => (
                  <option key={fund.id} value={String(fund.id)}>
                    {fund.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="budget-entry-field">
              <span>新規作成時の既定費目</span>
              <select
                aria-label="新規作成時の既定費目"
                disabled={!hasDefaultFund}
                value={defaultCategoryId === null ? "" : String(defaultCategoryId)}
                onChange={(event) =>
                  setDefaultCategoryId(
                    event.target.value.length > 0 ? Number(event.target.value) : null,
                  )
                }
              >
                <option value="">設定しない</option>
                {fundDetailData?.categories.map((category) => (
                  <option key={category.id} value={String(category.id)}>
                    {category.categoryName}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        </div>
      </section>
      <section className="settings-section">
        <h3>表示</h3>
        <div className="settings-option-grid">
          <fieldset className="settings-option-group">
            <legend>Overview の既定表示</legend>
            <TwoChoiceToggleGroup
              currentValue={defaultOverviewDisplayMode}
              options={[
                {
                  value: "chart",
                  title: "円グラフ",
                },
                {
                  value: "numeric",
                  title: "数値",
                },
              ]}
              onChange={setDefaultOverviewDisplayMode}
            />
          </fieldset>
          <fieldset className="settings-option-group">
            <legend>率表示の既定値</legend>
            <TwoChoiceToggleGroup
              currentValue={defaultRateMetric}
              options={[
                {
                  value: "execution",
                  title: "予算消化率",
                },
                {
                  value: "balance",
                  title: "残高率",
                },
              ]}
              onChange={setDefaultRateMetric}
            />
            <div className="settings-threshold-section">
              <p className="settings-option-title">{thresholdHeading}</p>
              <div className="settings-threshold-bar">
                <div className="settings-threshold-inline">
                  {thresholdFieldOrder.map((field) => (
                    <label key={field} className="settings-threshold-inline-item">
                      <span className="settings-threshold-inline-text">{`${field} ${thresholdDirection}`}</span>
                      <input
                        type="number"
                        className="settings-threshold-input"
                        aria-label={field}
                        value={editedThresholds[field]}
                        onChange={(event) =>
                          updateThreshold(
                            field,
                            Number.isNaN(event.target.valueAsNumber) ? 0 : event.target.valueAsNumber,
                          )
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  className="settings-reset-button"
                  onClick={resetThresholds}
                >
                  デフォルト値に戻す
                </button>
              </div>
              <div className="settings-threshold-examples" aria-live="polite">
                <span className="settings-threshold-examples-title">表示例</span>
                <div className="settings-threshold-examples-line">
                  {thresholdExamples.map((example) => {
                    const className =
                      example.percentage === null
                        ? undefined
                        : getRateThresholdClassName(
                            defaultRateMetric,
                            example.percentage,
                            executionRateThresholds,
                            balanceRateThresholds,
                          );
                    const valueLabel =
                      example.percentage === null ? "該当なし" : formatRatePercentage(example.percentage);

                    return (
                      <span
                        key={example.tone}
                        className={
                          className
                            ? `settings-threshold-example ${className}`
                            : "settings-threshold-example"
                        }
                      >
                        {`${example.tone}: ${valueLabel}`}
                      </span>
                    );
                  })}
                </div>
              </div>
            </div>
          </fieldset>
          <fieldset className="settings-option-group">
            <legend>金額表示</legend>
            <div className="settings-option-choices">
              <label className="settings-option-card">
                <input
                  type="radio"
                  name="amountDisplayMode"
                  value="grouped-yen"
                  checked={amountDisplayMode === "grouped-yen"}
                  onChange={() => setAmountDisplayMode("grouped-yen")}
                />
                <span className="settings-option-title">千円区切り</span>
                <span className="settings-option-copy">例: 1,234,567円</span>
              </label>
              <label className="settings-option-card">
                <input
                  type="radio"
                  name="amountDisplayMode"
                  value="plain-yen"
                  checked={amountDisplayMode === "plain-yen"}
                  onChange={() => setAmountDisplayMode("plain-yen")}
                />
                <span className="settings-option-title">円のみ</span>
                <span className="settings-option-copy">例: 1234567円</span>
              </label>
              <label className="settings-option-card">
                <input
                  type="radio"
                  name="amountDisplayMode"
                  value="thousand-yen"
                  checked={amountDisplayMode === "thousand-yen"}
                  onChange={() => setAmountDisplayMode("thousand-yen")}
                />
                <span className="settings-option-title">千円</span>
                <span className="settings-option-copy">例: 1235千円</span>
              </label>
            </div>
          </fieldset>
          <fieldset className="settings-option-group">
            <legend>注記の表示方法</legend>
            <div className="settings-option-choices">
              <label className="settings-option-card">
                <input
                  type="radio"
                  name="notesDisplayMode"
                  value="hover"
                  checked={notesDisplayMode === "hover"}
                  onChange={() => setNotesDisplayMode("hover")}
                />
                <span className="settings-option-title">ホバーで表示</span>
              </label>
              <label className="settings-option-card">
                <input
                  type="radio"
                  name="notesDisplayMode"
                  value="click"
                  checked={notesDisplayMode === "click"}
                  onChange={() => setNotesDisplayMode("click")}
                />
                <span className="settings-option-title">クリックで表示</span>
              </label>
              <label className="settings-option-card">
                <input
                  type="radio"
                  name="notesDisplayMode"
                  value="expanded"
                  checked={notesDisplayMode === "expanded"}
                  onChange={() => setNotesDisplayMode("expanded")}
                />
                <span className="settings-option-title">常時展開</span>
              </label>
            </div>
          </fieldset>
          <fieldset className="settings-option-group">
            <legend>予算ページの表示順</legend>
            <div className="settings-order-toolbar">
              <button
                type="button"
                className="settings-reset-button"
                onClick={() => setFundDetailSectionOrder(defaultFundDetailSectionOrder)}
              >
                デフォルト値に戻す
              </button>
            </div>
            <ol className="settings-order-list sortable-list" aria-label="予算ページの表示順">
              {fundDetailSectionOrder.map((sectionKey, index) => {
                const sectionLabel = fundDetailSectionLabels[sectionKey];
                const itemState = sectionOrderSortable.getItemState(sectionKey);
                const itemClassName = [
                  "settings-order-item",
                  "sortable-list-item",
                  itemState.isDragged ? "sortable-list-item-dragging" : "",
                  itemState.isSlidingUp ? "sortable-list-item-sliding-up" : "",
                  itemState.isSlidingDown ? "sortable-list-item-sliding-down" : "",
                ]
                  .filter((className) => className.length > 0)
                  .join(" ");

                return (
                  <li
                    key={sectionKey}
                    className={itemClassName}
                    style={itemState.style}
                    {...sectionOrderSortable.getItemProps(sectionKey)}
                  >
                    <span className="settings-order-label">{sectionLabel}</span>
                    <div className="settings-order-actions">
                      <button
                        type="button"
                        className="settings-order-button"
                        aria-label={`${sectionLabel}を上へ`}
                        disabled={index === 0}
                        onClick={() =>
                          setFundDetailSectionOrder(
                            moveFundDetailSection(fundDetailSectionOrder, sectionKey, "up"),
                          )
                        }
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="settings-order-button"
                        aria-label={`${sectionLabel}を下へ`}
                        disabled={index === fundDetailSectionOrder.length - 1}
                        onClick={() =>
                          setFundDetailSectionOrder(
                            moveFundDetailSection(fundDetailSectionOrder, sectionKey, "down"),
                          )
                        }
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          </fieldset>
        </div>
      </section>
      <section className="settings-section">
        <h3>外観</h3>
        <div className="settings-theme-toolbar">
          <div className="settings-theme-mode-toggle" role="group" aria-label="表示モード切り替え">
            <button
              type="button"
              className={
                effectiveThemeMode === "light"
                  ? "settings-theme-mode-button settings-theme-mode-button-active"
                  : "settings-theme-mode-button"
              }
              aria-pressed={effectiveThemeMode === "light"}
              onClick={() => setAppThemeMode("light")}
            >
              ライト
            </button>
            <button
              type="button"
              className={
                effectiveThemeMode === "dark"
                  ? "settings-theme-mode-button settings-theme-mode-button-active"
                  : "settings-theme-mode-button"
              }
              aria-pressed={effectiveThemeMode === "dark"}
              onClick={() => setAppThemeMode("dark")}
            >
              ダーク
            </button>
          </div>
          <button
            type="button"
            className={
              appThemeMode === "system"
                ? "settings-theme-system-button settings-theme-system-button-active"
                : "settings-theme-system-button"
            }
            aria-pressed={appThemeMode === "system"}
            onClick={() => setAppThemeMode("system")}
          >
            システムのデフォルト
          </button>
        </div>
        <div className="settings-custom-theme-controls">
          <button
            type="button"
            className="settings-reset-button"
            onClick={openCreateCustomPresetEditor}
          >
            カスタムプリセットを追加
          </button>
          {customPresetEditor !== null ? (
            <div className="settings-custom-theme-editor">
              <div className="settings-custom-theme-form">
                <div className="settings-custom-theme-fields">
                  <label className="budget-entry-field">
                    <span>プリセット名</span>
                    <input
                      aria-label="プリセット名"
                      value={customPresetForm.label}
                      onChange={(event) => updateCustomPresetForm("label", event.target.value)}
                    />
                  </label>
                  <label className="budget-entry-field">
                    <span>執行済</span>
                    <input
                      type="color"
                      aria-label="執行済カラーピッカー"
                      value={
                        isValidChartHexColor(customPresetForm.actual)
                          ? customPresetForm.actual
                          : defaultCustomChartPresetForm.actual
                      }
                      onChange={(event) => updateCustomPresetForm("actual", event.target.value)}
                    />
                  </label>
                  <label className="budget-entry-field">
                    <span>執行予定</span>
                    <input
                      type="color"
                      aria-label="執行予定カラーピッカー"
                      value={
                        isValidChartHexColor(customPresetForm.committed)
                          ? customPresetForm.committed
                          : defaultCustomChartPresetForm.committed
                      }
                      onChange={(event) => updateCustomPresetForm("committed", event.target.value)}
                    />
                  </label>
                  <label className="budget-entry-field">
                    <span>残高</span>
                    <input
                      type="color"
                      aria-label="残高カラーピッカー"
                      value={
                        isValidChartHexColor(customPresetForm.balance)
                          ? customPresetForm.balance
                          : defaultCustomChartPresetForm.balance
                      }
                      onChange={(event) => updateCustomPresetForm("balance", event.target.value)}
                    />
                  </label>
                  <label className="budget-entry-field">
                    <span>残高枠線</span>
                    <input
                      type="color"
                      aria-label="残高枠線カラーピッカー"
                      value={
                        isValidChartHexColor(customPresetForm.balanceBorder)
                          ? customPresetForm.balanceBorder
                          : defaultCustomChartPresetForm.balanceBorder
                      }
                      onChange={(event) =>
                        updateCustomPresetForm("balanceBorder", event.target.value)
                      }
                    />
                  </label>
                </div>
                <div className="settings-custom-theme-actions">
                  <button
                    type="button"
                    className="settings-reset-button"
                    onClick={randomizeCustomPresetColors}
                  >
                    ランダム配色
                  </button>
                  <button
                    type="button"
                    className="detail-action-button"
                    onClick={saveCustomPresetFromForm}
                  >
                    {customPresetSaveLabel}
                  </button>
                  <button
                    type="button"
                    className="settings-reset-button"
                    onClick={closeCustomPresetEditor}
                  >
                    キャンセル
                  </button>
                </div>
                <div className="settings-custom-theme-messages">
                  {customPresetSaveAttempted && customPresetLabel.length === 0 ? (
                    <p className="settings-custom-theme-error">プリセット名を入力してください。</p>
                  ) : null}
                  {customPresetSaveAttempted && customPresetHasInvalidColor ? (
                    <p className="settings-custom-theme-error">色は #rrggbb 形式で入力してください。</p>
                  ) : null}
                  {customPresetHasWarning ? (
                    <p className="settings-custom-theme-warning">
                      配色が近いため読みづらい可能性があります。
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="settings-custom-theme-preview" aria-label="カスタムプリセット例">
                <OverviewFundChart
                  fund={customPresetPreviewFund}
                  palette={customPresetPreviewPalette}
                  rateMetric="execution"
                  amountDisplayMode={amountDisplayMode}
                  executionRateThresholds={executionRateThresholds}
                  balanceRateThresholds={balanceRateThresholds}
                />
              </div>
            </div>
          ) : null}
        </div>
        <div className="settings-theme-grid" role="radiogroup" aria-label="カラーテーマ">
          {overviewChartPresetOrder.map((presetKey) => {
            const preset = overviewChartPresets[presetKey];
            const previewFund: OverviewChartFund = {
              name: preset.label,
              ...previewFundBase,
            };

            return (
              <label
                key={presetKey}
                className={
                  presetKey === themePreset
                    ? "settings-theme-card settings-theme-card-selected"
                    : "settings-theme-card"
                }
              >
                <span className="settings-theme-card-head">
                  <input
                    type="radio"
                    name="themePreset"
                    value={presetKey}
                    checked={presetKey === themePreset}
                    onChange={() => setThemePreset(presetKey)}
                  />
                  <span className="settings-theme-title">{preset.label}</span>
                </span>
                <div className="settings-theme-preview">
                  <OverviewFundChart
                    fund={previewFund}
                    palette={preset.palette}
                    rateMetric="execution"
                    amountDisplayMode={amountDisplayMode}
                    executionRateThresholds={executionRateThresholds}
                    balanceRateThresholds={balanceRateThresholds}
                  />
                </div>
              </label>
            );
          })}
          {customChartPresets.map((preset: CustomOverviewChartPreset) => {
            const presetRef = `custom:${preset.id}` as const;
            const previewFund: OverviewChartFund = {
              name: preset.label,
              ...previewFundBase,
            };

            return (
              <label
                key={presetRef}
                className={
                  presetRef === themePreset
                    ? "settings-theme-card settings-theme-card-selected"
                    : "settings-theme-card"
                }
              >
                <span className="settings-theme-card-head">
                  <input
                    type="radio"
                    name="themePreset"
                    value={presetRef}
                    checked={presetRef === themePreset}
                    onChange={() => setThemePreset(presetRef)}
                  />
                  <span className="settings-theme-title">{preset.label}</span>
                  <span className="settings-theme-card-actions">
                    <button
                      type="button"
                      className="settings-theme-card-action"
                      aria-label={`カスタムプリセットを編集: ${preset.label}`}
                      onClick={(event) => {
                        event.preventDefault();
                        openEditCustomPresetEditor(preset);
                      }}
                    >
                      編集
                    </button>
                    <button
                      type="button"
                      className="settings-theme-card-action"
                      aria-label={`カスタムプリセットを削除: ${preset.label}`}
                      onClick={(event) => {
                        event.preventDefault();
                        deleteCustomChartPreset(preset.id);
                      }}
                    >
                      削除
                    </button>
                  </span>
                </span>
                <div className="settings-theme-preview">
                  <OverviewFundChart
                    fund={previewFund}
                    palette={preset.palette}
                    rateMetric="execution"
                    amountDisplayMode={amountDisplayMode}
                    executionRateThresholds={executionRateThresholds}
                    balanceRateThresholds={balanceRateThresholds}
                  />
                </div>
              </label>
            );
          })}
        </div>
      </section>
    </section>
  );
}

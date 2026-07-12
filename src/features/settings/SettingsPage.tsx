import { useEffect, useState } from "react";
import {
  customOverviewChartPresetRef,
  isValidChartHexColor,
  overviewChartPresetOrder,
  overviewChartPresets,
  type CustomOverviewChartPreset,
  type OverviewChartFund,
} from "../overview/overviewChart";
import { OverviewFundChart } from "../overview/OverviewFundChart";
import { DisplaySettingsSection } from "./DisplaySettingsSection";
import { ClassificationSettingsSection } from "./ClassificationSettingsSection";
import { DefaultInputSettingsSection } from "./DefaultInputSettingsSection";
import { useAppSettings } from "./AppSettings";


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


function getSystemThemeMode() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light" as const;
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}


export function SettingsPage() {
  const {
    settings: {
      appThemeMode,
      themePreset,
      customChartPresets,
      amountDisplayMode,
      executionRateThresholds,
      balanceRateThresholds,
    },
    setAppThemeMode,
    setThemePreset,
    saveCustomChartPreset,
    deleteCustomChartPreset,
  } = useAppSettings();
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

  const effectiveThemeMode = appThemeMode === "system" ? systemThemeMode : appThemeMode;

  return (
    <section className="settings-page">
      <h2>設定</h2>
      <ClassificationSettingsSection />
      <DefaultInputSettingsSection />
      <DisplaySettingsSection />
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

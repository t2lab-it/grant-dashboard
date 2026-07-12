import { formatRatePercentage, getRateThresholdClassName, type BalanceRateThresholds, type ExecutionRateThresholds, type RateMetricKey } from "../../lib/executionRate";
import { useDirectManipulationSortableList } from "../../lib/useDirectManipulationSortableList";
import { useAppSettings } from "./AppSettings";
import { defaultFundDetailSectionOrder, fundDetailSectionLabels, moveFundDetailSection } from "./fundDetailSectionOrder";

type TwoChoiceToggleOption<Value extends string> = {
  value: Value;
  title: string;
  copy?: string;
};
const thresholdFieldOrder: Array<keyof ExecutionRateThresholds> = ["notice", "warning", "alert"];
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
export function DisplaySettingsSection() {
  const {
    settings: { defaultRateMetric, defaultOverviewDisplayMode, notesDisplayMode, amountDisplayMode, fundDetailSectionOrder, executionRateThresholds, balanceRateThresholds },
    setDefaultRateMetric, setDefaultOverviewDisplayMode, setNotesDisplayMode, setAmountDisplayMode, setFundDetailSectionOrder, setExecutionRateThresholds, setBalanceRateThresholds, resetExecutionRateThresholds, resetBalanceRateThresholds,
  } = useAppSettings();
  const editedThresholds = defaultRateMetric === "balance" ? balanceRateThresholds : executionRateThresholds;
  const thresholdExamples = createThresholdExamples(defaultRateMetric, editedThresholds);
  const thresholdDirection = defaultRateMetric === "balance" ? "<" : "≥";
  const thresholdHeading = defaultRateMetric === "balance" ? "残高率のしきい値" : "予算消化率のしきい値";
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
  return (
          <section className="settings-section">
            <h3>表示</h3>
            <div className="settings-option-grid">
              <fieldset className="settings-option-group">
                <legend>概要画面の既定表示</legend>
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
  );
}

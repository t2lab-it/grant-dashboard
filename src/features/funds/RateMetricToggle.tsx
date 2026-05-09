import type { RateMetricKey } from "../../lib/executionRate";

type RateMetricToggleProps = {
  rateMetric: RateMetricKey;
  onRateMetricChange: (rateMetric: RateMetricKey) => void;
};

export function RateMetricToggle({ rateMetric, onRateMetricChange }: RateMetricToggleProps) {
  return (
    <div className="overview-display-toggle" role="group" aria-label="率表示">
      <button
        type="button"
        className="overview-display-toggle-button"
        aria-pressed={rateMetric === "execution"}
        onClick={() => onRateMetricChange("execution")}
      >
        予算消化率
      </button>
      <button
        type="button"
        className="overview-display-toggle-button"
        aria-pressed={rateMetric === "balance"}
        onClick={() => onRateMetricChange("balance")}
      >
        残高率
      </button>
    </div>
  );
}

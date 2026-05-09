import type { RateMetricKey } from "../../lib/executionRate";

export function setRateSearchParam(
  params: URLSearchParams,
  value: RateMetricKey,
  defaultValue: RateMetricKey,
) {
  if (value === defaultValue) {
    params.delete("rate");
  } else {
    params.set("rate", value);
  }
}

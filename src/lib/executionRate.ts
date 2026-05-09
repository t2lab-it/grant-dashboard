const executionRateFormatter = new Intl.NumberFormat("ja-JP", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export type RateMetricKey = "execution" | "balance";
export type RateThresholdTone = "normal" | "notice" | "warning" | "alert";
export type ExecutionRateThresholds = {
  notice: number;
  warning: number;
  alert: number;
};
export type BalanceRateThresholds = {
  notice: number;
  warning: number;
  alert: number;
};

export const defaultExecutionRateThresholds: ExecutionRateThresholds = {
  notice: 70,
  warning: 90,
  alert: 100,
};

export const defaultBalanceRateThresholds: BalanceRateThresholds = {
  notice: 30,
  warning: 10,
  alert: 0,
};

function getFiniteThreshold(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeExecutionRateThresholds(
  thresholds?: Partial<ExecutionRateThresholds> | null,
): ExecutionRateThresholds {
  const notice = getFiniteThreshold(thresholds?.notice, defaultExecutionRateThresholds.notice);
  const warning = Math.max(
    getFiniteThreshold(thresholds?.warning, defaultExecutionRateThresholds.warning),
    notice,
  );
  const alert = Math.max(
    getFiniteThreshold(thresholds?.alert, defaultExecutionRateThresholds.alert),
    warning,
  );

  return { notice, warning, alert };
}

export function normalizeBalanceRateThresholds(
  thresholds?: Partial<BalanceRateThresholds> | null,
): BalanceRateThresholds {
  const notice = getFiniteThreshold(thresholds?.notice, defaultBalanceRateThresholds.notice);
  const warning = Math.min(
    getFiniteThreshold(thresholds?.warning, defaultBalanceRateThresholds.warning),
    notice,
  );
  const alert = Math.min(
    getFiniteThreshold(thresholds?.alert, defaultBalanceRateThresholds.alert),
    warning,
  );

  return { notice, warning, alert };
}

function getExecutionRateTone(
  percentage: number,
  thresholds: ExecutionRateThresholds,
): RateThresholdTone {
  if (percentage >= thresholds.alert) {
    return "alert";
  }

  if (percentage >= thresholds.warning) {
    return "warning";
  }

  if (percentage >= thresholds.notice) {
    return "notice";
  }

  return "normal";
}

function getExecutionRateClassName(tone: RateThresholdTone) {
  switch (tone) {
    case "notice":
      return "detail-rate-notice";
    case "warning":
      return "detail-rate-warning";
    case "alert":
      return "detail-rate-alert";
    default:
      return undefined;
  }
}

function getBalanceRateTone(percentage: number, thresholds: BalanceRateThresholds): RateThresholdTone {
  if (percentage < thresholds.alert) {
    return "alert";
  }

  if (percentage < thresholds.warning) {
    return "warning";
  }

  if (percentage < thresholds.notice) {
    return "notice";
  }

  return "normal";
}

export function formatRatePercentage(percentage: number) {
  return executionRateFormatter.format(percentage) + "%";
}

export function getRateMetricKey(value: string | null): RateMetricKey {
  return value === "balance" ? "balance" : "execution";
}

export function getExecutionRate(
  budgetAmount: number | null,
  plannedAmount: number,
  actualAmount: number,
  thresholds: ExecutionRateThresholds = defaultExecutionRateThresholds,
) {
  if (budgetAmount === null || budgetAmount <= 0) {
    return { label: "-", tone: "normal" as const, className: undefined };
  }

  const percentage = ((plannedAmount + actualAmount) / budgetAmount) * 100;
  const tone = getExecutionRateTone(percentage, thresholds);

  return {
    label: formatRatePercentage(percentage),
    tone,
    className: getExecutionRateClassName(tone),
  };
}

export function getBalanceRate(
  budgetAmount: number | null,
  freeBalance: number,
  thresholds: BalanceRateThresholds = defaultBalanceRateThresholds,
) {
  if (budgetAmount === null || budgetAmount <= 0) {
    return { label: "-", tone: "normal" as const, className: undefined };
  }

  const percentage = (freeBalance / budgetAmount) * 100;
  const tone = getBalanceRateTone(percentage, thresholds);

  return {
    label: formatRatePercentage(percentage),
    tone,
    className: getExecutionRateClassName(tone),
  };
}

export function getRateThresholdClassName(
  metric: RateMetricKey,
  percentage: number,
  executionThresholds: ExecutionRateThresholds = defaultExecutionRateThresholds,
  balanceThresholds: BalanceRateThresholds = defaultBalanceRateThresholds,
) {
  const tone =
    metric === "balance"
      ? getBalanceRateTone(percentage, balanceThresholds)
      : getExecutionRateTone(percentage, executionThresholds);

  return getExecutionRateClassName(tone);
}

export function getRateMetric(
  metric: RateMetricKey,
  budgetAmount: number | null,
  plannedAmount: number,
  actualAmount: number,
  freeBalance: number,
  executionThresholds: ExecutionRateThresholds = defaultExecutionRateThresholds,
  balanceThresholds: BalanceRateThresholds = defaultBalanceRateThresholds,
) {
  if (metric === "balance") {
    return getBalanceRate(budgetAmount, freeBalance, balanceThresholds);
  }

  return getExecutionRate(budgetAmount, plannedAmount, actualAmount, executionThresholds);
}

export function getRateMetricLabel(metric: RateMetricKey) {
  return metric === "balance" ? "残高率 [%]" : "予算消化率 [%]";
}

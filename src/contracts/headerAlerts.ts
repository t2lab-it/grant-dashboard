import type { YearEndRiskFund, YearEndRiskKind } from "./yearEndRisk";

export type HeaderAlertKey =
  | "budget_overrun"
  | "reconciliation_mismatch"
  | "overdue"
  | "unlinked"
  | "year_end_risk"
  | "import_warning";

export type HeaderAlertSeverity = "danger" | "warning" | "supporting";

export type HeaderAlertYearEndRisk = {
  kind: YearEndRiskKind;
  label: string;
  amount: number;
  rate?: number;
};

export type HeaderAlertDetailTone = YearEndRiskKind | "budget_overrun" | "overdue";

export type HeaderAlertDetail = {
  id: string;
  label: string;
  labelTone?: HeaderAlertDetailTone;
  title?: string;
  amount: number;
  rate?: number;
};

export type HeaderAlertItem = {
  id: string;
  title: string;
  description?: string;
  href: string;
  amount?: number;
  details?: HeaderAlertDetail[];
  yearEndRisks?: HeaderAlertYearEndRisk[];
};

export type HeaderAlertCategory = {
  key: HeaderAlertKey;
  label: string;
  severity: HeaderAlertSeverity;
  count: number;
  description?: string;
  items: HeaderAlertItem[];
};

export type HeaderAlertsResponse = {
  availableFiscalYears: number[];
  selectedFiscalYear: number | null;
  primary: HeaderAlertCategory[];
  supporting: HeaderAlertCategory[];
};

const headerYearEndRiskLabels: Record<YearEndRiskKind, string> = {
  overdue_planned: "期限超過予定",
  excess_balance: "残高過多",
  low_balance: "残高不足",
  negative_balance: "残高不足",
};

const HEADER_YEAR_END_RISK_ORDER: YearEndRiskKind[] = [
  "negative_balance",
  "low_balance",
  "excess_balance",
  "overdue_planned",
];

function sortHeaderYearEndRiskKinds(riskKinds: YearEndRiskKind[]) {
  return [...riskKinds].sort(
    (left, right) => HEADER_YEAR_END_RISK_ORDER.indexOf(left) - HEADER_YEAR_END_RISK_ORDER.indexOf(right),
  );
}

function toHeaderYearEndRisk(risk: YearEndRiskFund, kind: YearEndRiskKind): HeaderAlertYearEndRisk {
  if (kind === "overdue_planned") {
    return {
      kind,
      label: headerYearEndRiskLabels[kind],
      amount: risk.overduePlannedAmount,
    };
  }

  const rate =
    risk.plannedBalanceRate ?? (risk.awardedAmount > 0 ? (risk.plannedBalance / risk.awardedAmount) * 100 : undefined);

  return {
    kind,
    label: headerYearEndRiskLabels[kind],
    amount: risk.plannedBalance,
    ...(rate === undefined ? {} : { rate }),
  };
}

export function toHeaderYearEndRisks(risk: YearEndRiskFund): HeaderAlertYearEndRisk[] {
  return sortHeaderYearEndRiskKinds(risk.riskKinds).map((kind) => toHeaderYearEndRisk(risk, kind));
}

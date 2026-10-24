import type Database from "better-sqlite3";
import { listFundAggregateRows, toFreeBalance } from "../services/financialAggregates";
import type {
  DryRunImportResult,
  ReconciliationFundSnapshot,
  ReconciliationMetric,
  ReconciliationMetricSet,
  ReconciliationMismatch,
  ReconciliationReport,
  ReconciliationSnapshot,
} from "./types";

const METRICS: ReconciliationMetric[] = ["assets", "planned", "actual", "free_balance"];

function zeroMetricSet(): ReconciliationMetricSet {
  return { assets: 0, planned: 0, actual: 0, free_balance: 0 };
}

function metricSetFromValues(
  assets: number,
  planned: number,
  actual: number,
): ReconciliationMetricSet {
  return {
    assets,
    planned,
    actual,
    free_balance: toFreeBalance(assets, planned, actual),
  };
}

function sortFunds(funds: ReconciliationFundSnapshot[]) {
  return [...funds].sort((left, right) => left.fund_code.localeCompare(right.fund_code));
}

export function buildExpectedReconciliationSnapshot(
  draft: DryRunImportResult,
): ReconciliationSnapshot {
  const linkedActualAmountByRef = new Map<string, number>();
  for (const entry of draft.actual_entries) {
    if (!entry.planned_ref) {
      continue;
    }

    linkedActualAmountByRef.set(
      entry.planned_ref,
      (linkedActualAmountByRef.get(entry.planned_ref) ?? 0) + entry.amount,
    );
  }

  const funds = sortFunds(
    draft.funds.map((fund) => {
      const planned = draft.planned_items
        .filter((item) => item.fund_code === fund.fund_code && item.status === "planned")
        .reduce((sum, item) => {
          const linkedActualAmount = item.planned_ref
            ? linkedActualAmountByRef.get(item.planned_ref) ?? 0
            : 0;
          return sum + Math.max(item.amount - linkedActualAmount, 0);
        }, 0);
      const actual = draft.actual_entries
        .filter((entry) => entry.fund_code === fund.fund_code)
        .reduce((sum, entry) => sum + entry.amount, 0);

      return {
        fund_code: fund.fund_code,
        fund_name: fund.name,
        fiscal_year: fund.fiscal_year,
        ...metricSetFromValues(fund.awarded_amount, planned, actual),
      };
    }),
  );

  const overall = metricSetFromValues(
    funds.reduce((sum, fund) => sum + fund.assets, 0),
    funds.reduce((sum, fund) => sum + fund.planned, 0),
    funds.reduce((sum, fund) => sum + fund.actual, 0),
  );

  return { overall, funds };
}

export function buildActualReconciliationSnapshot(
  db: Database.Database,
): ReconciliationSnapshot {
  const funds = sortFunds(
    listFundAggregateRows(db).map((row) => ({
      fund_code: row.fund_code,
      fund_name: row.name,
      fiscal_year: row.fiscal_year,
      ...metricSetFromValues(row.awarded_amount, row.committed_amount, row.actual_amount),
    })),
  );

  const overall = metricSetFromValues(
    funds.reduce((sum, fund) => sum + fund.assets, 0),
    funds.reduce((sum, fund) => sum + fund.planned, 0),
    funds.reduce((sum, fund) => sum + fund.actual, 0),
  );

  return { overall, funds };
}

function pushMetricMismatches(
  mismatches: ReconciliationMismatch[],
  identity: { scope: "overall" } | { scope: "fund"; fund_code: string; fund_name: string; fiscal_year: number },
  expected: ReconciliationMetricSet,
  actual: ReconciliationMetricSet,
) {
  for (const metric of METRICS) {
    if (expected[metric] !== actual[metric]) {
      mismatches.push({ ...identity, metric, expected: expected[metric], actual: actual[metric], delta: actual[metric] - expected[metric] });
    }
  }
}

function fundMap(snapshot: ReconciliationSnapshot) {
  return new Map(snapshot.funds.map((fund) => [fund.fund_code, fund]));
}

export function buildReconciliationReport({
  workbookPath,
  dbPath,
  expected,
  actual,
}: {
  workbookPath: string;
  dbPath: string;
  expected: ReconciliationSnapshot;
  actual: ReconciliationSnapshot;
}): ReconciliationReport {
  const mismatches: ReconciliationMismatch[] = [];

  pushMetricMismatches(mismatches, { scope: "overall" }, expected.overall, actual.overall);

  const expectedFunds = fundMap(expected);
  const actualFunds = fundMap(actual);
  const fundCodes = [...new Set([...expectedFunds.keys(), ...actualFunds.keys()])].sort();

  const funds = fundCodes.map((fund_code) => {
    const source = expectedFunds.get(fund_code) ?? actualFunds.get(fund_code)!;
    const expectedFund = expectedFunds.get(fund_code) ?? zeroMetricSet();
    const actualFund = actualFunds.get(fund_code) ?? zeroMetricSet();
    const fund_name = source.fund_name;
    const fiscal_year = source.fiscal_year;
    if (expectedFunds.has(fund_code) && actualFunds.has(fund_code) && expectedFunds.get(fund_code)!.fiscal_year !== actualFunds.get(fund_code)!.fiscal_year) {
      throw new Error(`Fiscal year mismatch for ${fund_code}`);
    }
    pushMetricMismatches(mismatches, { scope: "fund", fund_code, fund_name, fiscal_year }, expectedFund, actualFund);

    return {
      fund_code,
      fund_name,
      fiscal_year,
      expected: {
        assets: expectedFund.assets,
        planned: expectedFund.planned,
        actual: expectedFund.actual,
        free_balance: expectedFund.free_balance,
      },
      actual: {
        assets: actualFund.assets,
        planned: actualFund.planned,
        actual: actualFund.actual,
        free_balance: actualFund.free_balance,
      },
    };
  });

  return {
    format_version: 2,
    workbook_path: workbookPath,
    db_path: dbPath,
    ok: mismatches.length === 0,
    overall: { expected: expected.overall, actual: actual.overall },
    funds,
    mismatches,
  };
}

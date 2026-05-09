import { describe, expect, it } from "vitest";
import { buildReconciliationReport } from "../../server/imports/reconcileImport";

describe("buildReconciliationReport", () => {
  it("builds deterministic mismatches for sorted fund codes", () => {
    const report = buildReconciliationReport({
      workbookPath: "/tmp/expected.xlsx",
      dbPath: "/tmp/app.db",
      expected: {
        overall: { assets: 10, planned: 7, actual: 1, free_balance: 2 },
        funds: [
          {
            fund_code: "zulu-fund",
            fund_name: "Zulu Fund",
            assets: 10,
            planned: 7,
            actual: 1,
            free_balance: 2,
          },
        ],
      },
      actual: {
        overall: { assets: 16, planned: 2, actual: 4, free_balance: 10 },
        funds: [
          {
            fund_code: "alpha-fund",
            fund_name: "Alpha Fund",
            assets: 6,
            planned: 2,
            actual: 4,
            free_balance: 0,
          },
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.funds.map((fund) => fund.fund_code)).toEqual(["alpha-fund", "zulu-fund"]);
    expect(report.mismatches.slice(0, 4)).toEqual([
      {
        scope: "overall",
        metric: "assets",
        expected: 10,
        actual: 16,
        delta: 6,
      },
      {
        scope: "overall",
        metric: "planned",
        expected: 7,
        actual: 2,
        delta: -5,
      },
      {
        scope: "overall",
        metric: "actual",
        expected: 1,
        actual: 4,
        delta: 3,
      },
      {
        scope: "overall",
        metric: "free_balance",
        expected: 2,
        actual: 10,
        delta: 8,
      },
    ]);
    expect(report.funds).toEqual([
      {
        fund_code: "alpha-fund",
        fund_name: "Alpha Fund",
        expected: { assets: 0, planned: 0, actual: 0, free_balance: 0 },
        actual: { assets: 6, planned: 2, actual: 4, free_balance: 0 },
      },
      {
        fund_code: "zulu-fund",
        fund_name: "Zulu Fund",
        expected: { assets: 10, planned: 7, actual: 1, free_balance: 2 },
        actual: { assets: 0, planned: 0, actual: 0, free_balance: 0 },
      },
    ]);
    expect(report.mismatches.slice(4)).toEqual([
      {
        scope: "fund",
        fund_code: "alpha-fund",
        fund_name: "Alpha Fund",
        metric: "assets",
        expected: 0,
        actual: 6,
        delta: 6,
      },
      {
        scope: "fund",
        fund_code: "alpha-fund",
        fund_name: "Alpha Fund",
        metric: "planned",
        expected: 0,
        actual: 2,
        delta: 2,
      },
      {
        scope: "fund",
        fund_code: "alpha-fund",
        fund_name: "Alpha Fund",
        metric: "actual",
        expected: 0,
        actual: 4,
        delta: 4,
      },
      {
        scope: "fund",
        fund_code: "zulu-fund",
        fund_name: "Zulu Fund",
        metric: "assets",
        expected: 10,
        actual: 0,
        delta: -10,
      },
      {
        scope: "fund",
        fund_code: "zulu-fund",
        fund_name: "Zulu Fund",
        metric: "planned",
        expected: 7,
        actual: 0,
        delta: -7,
      },
      {
        scope: "fund",
        fund_code: "zulu-fund",
        fund_name: "Zulu Fund",
        metric: "actual",
        expected: 1,
        actual: 0,
        delta: -1,
      },
      {
        scope: "fund",
        fund_code: "zulu-fund",
        fund_name: "Zulu Fund",
        metric: "free_balance",
        expected: 2,
        actual: 0,
        delta: -2,
      },
    ]);
  });

  it("keeps duplicate fund names separate when diffing", () => {
    const baseReport: Parameters<typeof buildReconciliationReport>[0] = {
      workbookPath: "/tmp/expected.xlsx",
      dbPath: "/tmp/app.db",
      expected: {
        overall: { assets: 20, planned: 10, actual: 5, free_balance: 5 },
        funds: [
          {
            fund_code: "duplicate-a",
            fund_name: "Duplicate Fund",
            assets: 10,
            planned: 5,
            actual: 2,
            free_balance: 3,
          },
          {
            fund_code: "duplicate-b",
            fund_name: "Duplicate Fund",
            assets: 10,
            planned: 5,
            actual: 3,
            free_balance: 2,
          },
        ],
      },
      actual: {
        overall: { assets: 20, planned: 10, actual: 5, free_balance: 5 },
        funds: [
          {
            fund_code: "duplicate-a",
            fund_name: "Duplicate Fund",
            assets: 10,
            planned: 5,
            actual: 2,
            free_balance: 3,
          },
          {
            fund_code: "duplicate-b",
            fund_name: "Duplicate Fund",
            assets: 10,
            planned: 5,
            actual: 3,
            free_balance: 2,
          },
        ],
      },
    };

    expect(buildReconciliationReport(baseReport)).toMatchObject({
      ok: true,
      funds: [
        {
          fund_code: "duplicate-a",
          fund_name: "Duplicate Fund",
          expected: {
            assets: 10,
            planned: 5,
            actual: 2,
            free_balance: 3,
          },
          actual: {
            assets: 10,
            planned: 5,
            actual: 2,
            free_balance: 3,
          },
        },
        {
          fund_code: "duplicate-b",
          fund_name: "Duplicate Fund",
          expected: {
            assets: 10,
            planned: 5,
            actual: 3,
            free_balance: 2,
          },
          actual: {
            assets: 10,
            planned: 5,
            actual: 3,
            free_balance: 2,
          },
        },
      ],
      mismatches: [],
    });
  });
});

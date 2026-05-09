import type Database from "better-sqlite3";
import type { ImportedFundDraft } from "../imports/types";

const DEMO_FUND_CODES = ["demo-a", "demo-b", "demo-c"] as const;

export type DemoImportMetadata = {
  eligible: boolean;
};

function hasDemoFundCodes(codes: Iterable<string>) {
  const codeSet = new Set(Array.from(codes, (code) => code.trim().toLowerCase()));
  return DEMO_FUND_CODES.every((code) => codeSet.has(code));
}

export function getDemoImportMetadata(funds: Pick<ImportedFundDraft, "fund_code">[]): DemoImportMetadata {
  return {
    eligible: hasDemoFundCodes(funds.map((fund) => fund.fund_code)),
  };
}

export function isDemoTutorialEligible(db: Database.Database) {
  const rows = db
    .prepare(
      `
      SELECT fund_code
      FROM funds
      WHERE fund_code IS NOT NULL
      `,
    )
    .all() as Array<{ fund_code: string }>;

  return hasDemoFundCodes(rows.map((row) => row.fund_code));
}

export type EntryWorkflowErrorCode =
  | "invalid_reference"
  | "category_fund_mismatch"
  | "planned_item_mismatch"
  | "planned_item_not_found"
  | "planned_item_has_actuals"
  | "planned_item_delete_has_actuals"
  | "planned_item_not_deletable"
  | "planned_item_not_cancelled_for_restore"
  | "planned_item_complete_requires_actuals"
  | "planned_item_complete_requires_remaining"
  | "actual_entry_not_found";

export class EntryWorkflowDomainError extends Error {
  readonly code: EntryWorkflowErrorCode;

  constructor(code: EntryWorkflowErrorCode) {
    super(code);
    this.name = "EntryWorkflowDomainError";
    this.code = code;
  }
}

export function isEntryWorkflowDomainError(error: unknown): error is EntryWorkflowDomainError {
  return error instanceof EntryWorkflowDomainError;
}

export function throwEntryWorkflowError(code: EntryWorkflowErrorCode): never {
  throw new EntryWorkflowDomainError(code);
}

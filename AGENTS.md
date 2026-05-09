# Repository Instructions

## Superpowers Docs Policy

- Do not add new files under `docs/superpowers/specs/` or `docs/superpowers/plans/` for small, localized changes.
- Do not create or keep implementation plan files under `docs/superpowers/plans/`. Treat that directory as non-repository working context.
- "Small, localized changes" includes narrow UI tweaks, single-route navigation changes, copy edits, styling-only adjustments, and other work that does not introduce a durable architectural decision.
- Add a new spec or plan document only when the task spans a meaningful subsystem, records a durable design decision, or the user explicitly asks for the document to be kept in the repository.
- If a workflow suggests creating a spec or plan for a small task, treat it as temporary working context only. Keep it outside the repository or under a gitignored location, not under `docs/superpowers/plans/`.
- Before committing, review `docs/superpowers/` changes and delete any temporary task-specific docs that are not intended to remain as project documentation.

## Budget Dashboard Test Policy

Apply the machine-wide Codex test quality policy, and treat the following `budget_dashboard` areas as high-value coverage. Keep tests that protect:

- Core user workflows across overview, fund detail, forms, dialogs, routing, search, filters, and import/export actions.
- Workbook import/export contracts, including sheet names, column names, identity fields, duplicate handling, and persistence boundaries.
- Ledger and budget domain rules that affect financial totals, planned/actual linkage, status transitions, or data consistency.
- User-visible budget formatting or copy when wording, local time, amount display, warning labels, or Japanese operation text affect use.
- Representative API route contracts where request parsing, HTTP status, response body, or service wiring is the behavior under test.

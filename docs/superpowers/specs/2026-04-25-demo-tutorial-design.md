# Demo Tutorial Design Note

## Scope

Issue #123 adds a guided tutorial that appears only for the built-in demo dataset. The issue body remains the detailed source of truth; this note records the durable boundaries used by the implementation.

## Design

- Demo eligibility is exposed by server responses, not inferred from client-only labels.
- `GET /api/overview` returns `tutorial.eligibleDemoData` so the shell can decide whether to show the automatic prompt.
- Workbook preview/import responses return `demoImport.eligible` so imports of the repository demo workbook can be identified without changing the workbook schema.
- Tutorial UI lives under `src/features/tutorial/`; demo startup prompts are not persistently suppressed, so reopening demo data asks again.
- Existing screens expose stable `data-tour-id` targets; the tutorial overlay reads those targets instead of coupling to layout-specific selectors.
- The `発展` action after workbook preview continues into a short optional guide for planned-item creation, actual-entry creation, and budget editing.
- Tutorial actions run against the real demo DB. Steps that save data are intentionally persistent.

## Non-Goals

- No external tour library.
- No tutorial prompt or launcher for normal operational workbooks.
- No versioned implementation plan in `docs/superpowers/plans/`.

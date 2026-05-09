# Demo Seed Profile Design Note

Updated: 2026-05-08

## Purpose

Ship a publishable `demo` dataset that can walk through the current dashboard, import review, and workbook export flows without depending on operational data.

## Durable Decisions

- Keep `demo` separate from `dev` and `test`.
- Optimize `demo` for walkthroughs, not minimal fixtures:
  - overview should show multiple funds with visibly different states
  - one fund should exercise richer detail behavior
  - import review and workbook export should be usable immediately after seeding
- Keep two demo sources in the repo:
  - checked-in seed JSON under `seeds/demo/`
  - a checked-in demo workbook fixture
- Keep static demo and local demo import summaries aligned for workbook-import-visible rows:
  - demo import warnings should be zero
  - completed and cancelled planned items are application state, not workbook import rows
- Show completed and cancelled planned items in fund detail as read-only history separate from active planned items.
- Include a low-balance year-end-risk case in the demo data, alongside excess and negative balance cases.
- `npm run seed:demo` should copy the fixture to a writable runtime path and store that copy in `imports.workbook_path`.
- The checked-in workbook fixture is immutable during normal demo use. Export writes only to the runtime copy.

## Boundaries

- `seedDatabase` stays generic and loads seed JSON into SQLite.
- Demo-only setup such as workbook-copy preparation and synthetic import history lives in a thin layer above the generic seeder.
- Tests should lock down both deterministic demo aggregates and workbook-backed export readiness.

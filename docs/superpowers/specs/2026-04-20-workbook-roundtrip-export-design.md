# Workbook Round-Trip Export Design Note

Updated: 2026-04-23

## Purpose

The app can write current SQLite state back to the latest imported workbook without making workbook files the runtime source of truth.

## Durable Decisions

- Workbook identities are preserved through `fund_code`, `category_code`, and `planned_ref`.
- The latest successful import stores `workbook_path` in `imports`.
- Workbook export rebuilds sheets from normalized SQLite rows; it does not patch a cached workbook blob.
- Export always uses preview before save.
- Final save overwrites the remembered workbook path atomically.

## Availability Rules

Export is unavailable when there is no usable latest import, no valid target workbook path, an unreadable workbook, or an unwritable target directory.

## Diff Boundary

- Preview reports compact `added`, `updated`, and `removed` summaries.
- The UI is not a spreadsheet diff viewer.

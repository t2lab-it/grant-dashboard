# 研究予算ダッシュボード Design Note

Updated: 2026-04-23

## Purpose

The budget dashboard is a local operator tool, not a spreadsheet runtime. Workbook files are an input format; SQLite is the runtime source of truth.

## Durable Decisions

- Input workflow starts from a simple `.xlsx` workbook.
- Normalized runtime data lives in `funds`, `categories`, `budget_lines`, `planned_items`, `actual_entries`, and `imports`.
- Overview and fund detail always read derived aggregates from SQLite, not from workbook cells.
- Browser edits update normalized records only. Balances, commitment totals, and chart values stay derived.
- Workbook identity fields such as `fund_code`, `category_code`, and `planned_ref` survive import so later export and reconciliation can stay stable.

## Product Shape

- The landing surface stays overview-first.
- Fund detail explains and edits one fund, rather than replacing the overview.
- Import, review, and export remain operator workflows around the normalized store.

## Out of Scope

- Multi-user accounting
- Generic spreadsheet execution
- Packaging or deployment strategy
- CRUD-only admin UI with no budget-specific read model

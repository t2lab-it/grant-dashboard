# Financial Aggregate Centralization Design Note

Updated: 2026-04-23

## Purpose

Shared budget semantics should be defined once and reused across overview, fund detail, reconciliation, and export paths.

## Durable Decisions

- Canonical aggregate logic lives in one server-side read-model module under `server/services/`.
- That layer owns:
  - linked actual totals by `planned_item_id`
  - remaining planned amount for `status = 'planned'`, clamped at zero
  - free balance as `assets - committed - actual`
  - reusable per-fund, per-category, and per-month aggregate rows
- Route handlers may shape payloads, but they should not restate these semantics.
- Reconciliation should reuse the same database-side aggregate rules so the UI and review logic cannot drift.

## Boundary

The aggregate layer exposes rows and small arithmetic helpers. It should not know about HTTP payload structure, UI labels, or route error handling.

# Import Review UI Design Note

Updated: 2026-04-23

## Purpose

Import review lives inside the app by reading persisted import snapshots instead of relying on terminal output or recomputation.

## Durable Decisions

- `imports` is the source of truth for review history.
- Warning detail, reconciliation detail, and import summary are persisted with the import run.
- Review UI is read-only.
- History and detail stay split between `/imports` and `/imports/:importId`.
- Detail pages show the stored snapshot for that import run, not a recomputed view of the current database.

## API Boundary

- `GET /api/imports` returns history summaries.
- `GET /api/imports/:importId` returns one stored review payload.
- Invalid ids return `400`; missing rows return `404`.

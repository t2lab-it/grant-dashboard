# Import Module Decomposition Design Note

Updated: 2026-04-23

## Purpose

Workbook import behavior should stay stable while parser, persistence, and stored-review logic remain independently changeable.

## Durable Decisions

- Keep import entry points stable and move dense internals behind focused modules.
- `parse/*` owns workbook loading, header validation, scalar parsing, warning generation, and draft construction.
- `persist/*` owns identifier mapping, managed-table safety checks, and normalized record insertion.
- `review/*` owns stored `imports` payload parsing and compatibility normalization.
- Reconciliation stays a shared computation boundary instead of being coupled directly into parser or persistence helpers.

## Boundary Rules

- Parsing code should not absorb database write concerns.
- Persistence code should not absorb stored-review compatibility logic.
- Route handlers and review readers should consume normalized review shapes instead of reimplementing them.

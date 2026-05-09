# Seed Data Design Note

Updated: 2026-04-23

## Purpose

Seed data exists to create reproducible local and test databases without introducing a second runtime source of truth.

## Durable Decisions

- Seed inputs live under `seeds/dev/` and `seeds/test/`.
- Seed files are reviewed JSON, not TypeScript fixtures or raw SQL.
- Seeding recreates the target SQLite database from scratch, runs migrations, validates shape and referential integrity, then inserts rows in dependency order.
- SQLite remains the only runtime source of truth after seeding.
- Seed workflows target normalized application tables only. Workbook import behavior and `imports` history are separate concerns.

## Profile Roles

- `dev`: small but expressive data for local UI work
- `test`: smaller deterministic data for automated tests

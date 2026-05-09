import type Database from "better-sqlite3";

export const MANAGED_TABLES = [
  "funds",
  "categories",
  "budget_lines",
  "planned_items",
  "actual_entries",
  "imports",
] as const;

export type ManagedTable = (typeof MANAGED_TABLES)[number];

export function getManagedRowCounts(db: Database.Database) {
  const counts = {} as Record<ManagedTable, number>;

  for (const table of MANAGED_TABLES) {
    const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
      count: number;
    };
    counts[table] = row.count;
  }

  return counts;
}

export function hasManagedData(counts: Record<ManagedTable, number>) {
  return Object.values(counts).some((count) => count > 0);
}

export function clearManagedTables(db: Database.Database) {
  db.prepare(
    `
    DELETE FROM classification_assignments
    WHERE target_type IN ('fund', 'planned_item', 'actual_entry')
    `,
  ).run();

  for (const table of [...MANAGED_TABLES].reverse()) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

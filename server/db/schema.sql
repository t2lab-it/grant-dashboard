CREATE TABLE IF NOT EXISTS funds (
  id INTEGER PRIMARY KEY,
  fund_code TEXT,
  name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  awarded_amount INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  category_code TEXT,
  name TEXT NOT NULL,
  cross_aggregate_category TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS budget_lines (
  id INTEGER PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  amount INTEGER,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS planned_items (
  id INTEGER PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  planned_ref TEXT,
  planned_date TEXT NOT NULL,
  scheduled_month TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS actual_entries (
  id INTEGER PRIMARY KEY,
  fund_id INTEGER NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  planned_item_id INTEGER REFERENCES planned_items(id) ON DELETE SET NULL,
  actual_date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS classification_tags (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('project', 'auxiliary')),
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#64748b'
);

CREATE TABLE IF NOT EXISTS classification_assignments (
  tag_id INTEGER NOT NULL REFERENCES classification_tags(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL CHECK (target_type IN ('fund', 'planned_item', 'actual_entry')),
  target_id INTEGER NOT NULL,
  PRIMARY KEY (tag_id, target_type, target_id)
);

CREATE TABLE IF NOT EXISTS imports (
  id INTEGER PRIMARY KEY,
  source_filename TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  warning_count INTEGER NOT NULL DEFAULT 0,
  mapping_summary TEXT NOT NULL DEFAULT '{}',
  warnings_json TEXT NOT NULL DEFAULT '[]',
  reconciliation_json TEXT NOT NULL DEFAULT '{}',
  workbook_path TEXT NOT NULL DEFAULT ''
);

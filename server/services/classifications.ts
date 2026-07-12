import type Database from "better-sqlite3";
import type {
  ParsedCreateClassificationRequest,
  ParsedUpdateClassificationRequest,
} from "../../src/contracts/requestSchemas";

export type ClassificationKind = "project" | "auxiliary";
export type ClassificationTargetType = "fund" | "planned_item" | "actual_entry";

export type ClassificationTag = {
  id: number;
  kind: ClassificationKind;
  name: string;
  color: string;
};

type ClassificationTagRow = {
  id: number;
  kind: ClassificationKind;
  name: string;
  color: string;
};

export const CLASSIFICATION_NOT_FOUND_ERROR = "Classification not found";
export const INVALID_CLASSIFICATION_ASSIGNMENT_ERROR = "Invalid classification assignment";

const defaultAuxiliaryLabels = [
  { kind: "auxiliary", name: "学生支援", color: "#16a34a" },
  { kind: "auxiliary", name: "出張", color: "#f59e0b" },
  { kind: "auxiliary", name: "要確認", color: "#7c3aed" },
] as const;

function insertAndReadId(db: Database.Database) {
  const row = db.prepare("SELECT last_insert_rowid() AS id").get() as { id: number };
  return Number(row.id);
}

function uniqueIds(ids: number[]) {
  return Array.from(new Set(ids));
}

function listTagsByKind(db: Database.Database, kind: ClassificationKind) {
  return db
    .prepare(
      `
      SELECT id, kind, name, color
      FROM classification_tags
      WHERE kind = ?
      ORDER BY id
      `,
    )
    .all(kind) as ClassificationTag[];
}

export function listClassifications(db: Database.Database) {
  return {
    projectTags: listTagsByKind(db, "project"),
    auxiliaryLabels: listTagsByKind(db, "auxiliary"),
  };
}

export function ensureDefaultAuxiliaryLabels(db: Database.Database) {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM classification_tags WHERE kind = 'auxiliary'")
    .get() as { count: number };

  if (row.count > 0) {
    return;
  }

  const insertLabel = db.prepare(`
    INSERT INTO classification_tags (kind, name, color)
    VALUES (@kind, @name, @color)
  `);

  for (const label of defaultAuxiliaryLabels) {
    insertLabel.run(label);
  }
}

export function createClassification(
  db: Database.Database,
  input: ParsedCreateClassificationRequest,
) {
  db.prepare(
    `
    INSERT INTO classification_tags (kind, name, color)
    VALUES (@kind, @name, @color)
    `,
  ).run(input);

  return { id: insertAndReadId(db) };
}

export function updateClassification(
  db: Database.Database,
  tagId: number,
  input: ParsedUpdateClassificationRequest,
) {
  const result = db
    .prepare(
      `
      UPDATE classification_tags
      SET name = @name,
          color = @color
      WHERE id = @id
      `,
    )
    .run({ id: tagId, ...input }) as { changes: number };

  if (result.changes === 0) {
    throw new Error(CLASSIFICATION_NOT_FOUND_ERROR);
  }

  return { success: true };
}

export function deleteClassification(db: Database.Database, tagId: number) {
  const result = db.prepare("DELETE FROM classification_tags WHERE id = ?").run(tagId) as {
    changes: number;
  };

  if (result.changes === 0) {
    throw new Error(CLASSIFICATION_NOT_FOUND_ERROR);
  }

  return { success: true };
}

function readTagKinds(db: Database.Database, tagIds: number[]) {
  if (tagIds.length === 0) {
    return new Map<number, ClassificationKind>();
  }

  const placeholders = tagIds.map(() => "?").join(", ");
  const rows = db
    .prepare(
      `
      SELECT id, kind
      FROM classification_tags
      WHERE id IN (${placeholders})
      `,
    )
    .all(...tagIds) as Array<{ id: number; kind: ClassificationKind }>;

  return new Map(rows.map((row) => [row.id, row.kind]));
}

function assertTagKinds(
  db: Database.Database,
  tagIds: number[],
  expectedKind: ClassificationKind,
) {
  const uniqueTagIds = uniqueIds(tagIds);
  const kinds = readTagKinds(db, uniqueTagIds);

  for (const tagId of uniqueTagIds) {
    if (kinds.get(tagId) !== expectedKind) {
      throw new Error(INVALID_CLASSIFICATION_ASSIGNMENT_ERROR);
    }
  }

  return uniqueTagIds;
}

function replaceAssignments(
  db: Database.Database,
  targetType: ClassificationTargetType,
  targetId: number,
  kind: ClassificationKind,
  tagIds: number[],
) {
  const validTagIds = assertTagKinds(db, tagIds, kind);
  db.prepare(
    `
    DELETE FROM classification_assignments
    WHERE target_type = @targetType
      AND target_id = @targetId
      AND tag_id IN (
        SELECT id
        FROM classification_tags
        WHERE kind = @kind
      )
    `,
  ).run({ targetType, targetId, kind });

  const insertAssignment = db.prepare(
    `
    INSERT OR IGNORE INTO classification_assignments (tag_id, target_type, target_id)
    VALUES (@tagId, @targetType, @targetId)
    `,
  );

  for (const tagId of validTagIds) {
    insertAssignment.run({ tagId, targetType, targetId });
  }
}

export function setFundClassifications(
  db: Database.Database,
  fundId: number,
  input: { projectTagIds: number[]; auxiliaryLabelIds: number[] },
) {
  replaceAssignments(db, "fund", fundId, "project", input.projectTagIds);
  replaceAssignments(db, "fund", fundId, "auxiliary", input.auxiliaryLabelIds);
}

export function setAuxiliaryLabelAssignments(
  db: Database.Database,
  targetType: Exclude<ClassificationTargetType, "fund">,
  targetId: number,
  auxiliaryLabelIds: number[],
) {
  replaceAssignments(db, targetType, targetId, "auxiliary", auxiliaryLabelIds);
}

export function listAssignedClassifications(
  db: Database.Database,
  targetType: ClassificationTargetType,
  targetId: number,
) {
  return db
    .prepare(
      `
      SELECT t.id, t.kind, t.name, t.color
      FROM classification_assignments ca
      INNER JOIN classification_tags t ON t.id = ca.tag_id
      WHERE ca.target_type = @targetType
        AND ca.target_id = @targetId
      ORDER BY t.id
      `,
    )
    .all({ targetType, targetId }) as ClassificationTagRow[];
}

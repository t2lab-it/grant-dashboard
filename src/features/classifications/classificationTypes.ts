export type ClassificationKind = "project" | "auxiliary";

export type ClassificationTag = {
  id: number;
  kind: ClassificationKind;
  name: string;
  color: string;
};

export type ClassificationResponse = {
  projectTags: ClassificationTag[];
  auxiliaryLabels: ClassificationTag[];
};

export const emptyClassifications: ClassificationResponse = {
  projectTags: [],
  auxiliaryLabels: [],
};

function isClassificationTag(value: unknown): value is ClassificationTag {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as ClassificationTag;
  return (
    typeof candidate.id === "number" &&
    (candidate.kind === "project" || candidate.kind === "auxiliary") &&
    typeof candidate.name === "string" &&
    typeof candidate.color === "string"
  );
}

export function normalizeClassifications(value: unknown): ClassificationResponse {
  if (!value || typeof value !== "object") {
    return emptyClassifications;
  }

  const candidate = value as Partial<ClassificationResponse>;
  return {
    projectTags: Array.isArray(candidate.projectTags)
      ? candidate.projectTags.filter(isClassificationTag)
      : [],
    auxiliaryLabels: Array.isArray(candidate.auxiliaryLabels)
      ? candidate.auxiliaryLabels.filter(isClassificationTag)
      : [],
  };
}

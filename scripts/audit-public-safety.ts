import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";

export type AuditScope = "tracked" | "history" | "tracked-content" | "working-tree";
export type AuditSeverity = "fail" | "warn";

export interface AuditFinding {
  scope: AuditScope;
  severity: AuditSeverity;
  rule: string;
  path: string;
  message: string;
  line?: number;
}

export interface PathAuditInput {
  scope: "tracked" | "history";
  paths: string[];
}

export interface TextAuditEntry {
  path: string;
  text: string;
}

export interface AuditResult {
  fetched: boolean;
  auditedRefs: string[];
  findings: AuditFinding[];
  allowedArtifacts: string[];
}

export interface AuditSummary {
  failures: number;
  warnings: number;
}

interface RunAuditOptions {
  fetch: boolean;
  cwd?: string;
}

const ALLOWED_ARTIFACTS = [
  "seeds/demo/demo-budget.xlsx",
  "vendor/xlsx-0.20.3.tgz",
];

const PRIVATE_DATA_EXTENSIONS = new Set([".db", ".sqlite", ".sqlite3", ".xls", ".xlsx"]);
const PRIVATE_DATA_SEGMENTS = new Set(["imports", "backups"]);
const MAX_TEXT_SCAN_BYTES = 1024 * 1024;
const SECRET_CONTENT_PATTERN =
  /^\s*(?:export\s+)?["']?[A-Z0-9_-]*(?:PASSWORD|TOKEN|SECRET|API[_-]?KEY|PRIVATE[_-]?KEY)[A-Z0-9_-]*["']?\s*[:=]\s*['"]?[^'"\s#]{8,}/i;
const SECRET_PATH_PATTERN = /(^|[._-])(secret|password|token|api[-_]?key|private[-_]?key)($|[._-])/i;

class GitCommandError extends Error {
  constructor(
    readonly args: string[],
    readonly stderr: string,
  ) {
    super(`git ${args.join(" ")} failed`);
  }
}

function normalizePath(path: string) {
  return path.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isAllowedArtifact(path: string) {
  return ALLOWED_ARTIFACTS.includes(normalizePath(path));
}

function pathSegments(path: string) {
  return normalizePath(path).split("/").filter(Boolean);
}

function classifySensitivePath(path: string): Pick<AuditFinding, "rule" | "message"> | null {
  const normalized = normalizePath(path);
  const segments = pathSegments(normalized);
  const lowerSegments = segments.map((segment) => segment.toLowerCase());
  const basename = lowerSegments[lowerSegments.length - 1] ?? "";
  const extension = extname(basename);

  if (
    basename === ".env" ||
    basename.startsWith(".env.") ||
    basename.endsWith(".pem") ||
    basename.endsWith(".key") ||
    SECRET_PATH_PATTERN.test(basename)
  ) {
    return {
      rule: "secret-like-path",
      message: "Secret-like filename is not allowed in public reachable files.",
    };
  }

  if (
    PRIVATE_DATA_EXTENSIONS.has(extension) ||
    PRIVATE_DATA_SEGMENTS.has(lowerSegments[0] ?? "") ||
    lowerSegments.some((segment) => segment.endsWith(".db.uploads"))
  ) {
    return {
      rule: "runtime-or-private-data-path",
      message: "Runtime database, workbook, upload, import, or backup path is not allowed in public reachable files.",
    };
  }

  return null;
}

export function auditPaths(input: PathAuditInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const seen = new Set<string>();

  for (const rawPath of input.paths) {
    const path = normalizePath(rawPath);
    if (!path || seen.has(path) || isAllowedArtifact(path)) {
      continue;
    }
    seen.add(path);

    const classification = classifySensitivePath(path);
    if (classification) {
      findings.push({
        scope: input.scope,
        severity: "fail",
        path,
        ...classification,
      });
    }
  }

  return findings;
}

export function auditCurrentTextContent(entries: TextAuditEntry[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const entry of entries) {
    const lines = entry.text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (SECRET_CONTENT_PATTERN.test(line)) {
        findings.push({
          scope: "tracked-content",
          severity: "fail",
          rule: "secret-like-content",
          path: normalizePath(entry.path),
          line: index + 1,
          message: "Current tracked text contains a secret-like assignment.",
        });
        break;
      }
    }
  }

  return findings;
}

export function summarizeAudit(findings: AuditFinding[]): AuditSummary {
  return {
    failures: findings.filter((finding) => finding.severity === "fail").length,
    warnings: findings.filter((finding) => finding.severity === "warn").length,
  };
}

export function buildAuditReport(result: AuditResult): string {
  const summary = summarizeAudit(result.findings);
  const lines = [
    "# Public Safety Audit",
    "",
    `- Fetch: ${result.fetched ? "performed" : "skipped"}`,
    `- Audited refs: ${result.auditedRefs.length}`,
    `- Failures: ${summary.failures}`,
    `- Warnings: ${summary.warnings}`,
    "",
    "## Audited Refs",
    "",
    ...formatList(result.auditedRefs),
    "",
    "## Allowed Public Artifacts",
    "",
    ...formatList(result.allowedArtifacts),
    "",
    "## Findings",
    "",
  ];

  if (result.findings.length === 0) {
    lines.push("No findings.");
  } else {
    lines.push("| Severity | Scope | Rule | Path | Message |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const finding of result.findings) {
      const path = finding.line === undefined ? finding.path : `${finding.path}:${finding.line}`;
      lines.push(
        `| ${finding.severity} | ${finding.scope} | ${finding.rule} | \`${path}\` | ${finding.message} |`,
      );
    }
  }

  return `${lines.join("\n")}\n`;
}

export function runPublicSafetyAudit(options: RunAuditOptions): AuditResult {
  const cwd = options.cwd ?? process.cwd();
  const findings: AuditFinding[] = [];

  if (options.fetch) {
    runGit(["fetch", "--prune", "--tags", "origin"], cwd);
  }

  const statusLines = runGit(["status", "--short"], cwd)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  findings.push(...statusLines.map((line) => ({
    scope: "working-tree" as const,
    severity: "warn" as const,
    rule: "dirty-working-tree",
    path: line,
    message: "Working tree has local changes; review them before publication.",
  })));

  const trackedPaths = parseNulList(runGit(["ls-files", "-z"], cwd));
  findings.push(...auditPaths({ scope: "tracked", paths: trackedPaths }));
  findings.push(...auditCurrentTextContent(readTrackedTextEntries(trackedPaths, cwd)));

  const auditedRefs = listAuditedRefs(cwd);
  const historyPaths = auditedRefs.length === 0
    ? []
    : parseNulList(runGit(["log", "--format=", "--name-only", "-z", ...auditedRefs, "--"], cwd));
  findings.push(...auditPaths({ scope: "history", paths: historyPaths }));

  return {
    fetched: options.fetch,
    auditedRefs,
    findings: dedupeFindings(findings),
    allowedArtifacts: ALLOWED_ARTIFACTS,
  };
}

function runGit(args: string[], cwd: string) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new GitCommandError(args, result.stderr.trim());
  }

  return result.stdout;
}

function listAuditedRefs(cwd: string) {
  return runGit(["for-each-ref", "--format=%(refname:short)", "refs/remotes/origin", "refs/tags"], cwd)
    .split("\n")
    .map((line) => line.trim())
    .filter((ref) => ref && ref !== "origin" && ref !== "origin/HEAD")
    .sort();
}

function parseNulList(output: string) {
  return output
    .split("\0")
    .map((path) => path.trim())
    .filter(Boolean);
}

function readTrackedTextEntries(paths: string[], cwd: string): TextAuditEntry[] {
  const entries: TextAuditEntry[] = [];

  for (const path of paths) {
    if (isAllowedArtifact(path)) {
      continue;
    }

    const fullPath = `${cwd}/${path}`;
    if (!existsSync(fullPath)) {
      continue;
    }

    const stat = statSync(fullPath);
    if (!stat.isFile() || stat.size > MAX_TEXT_SCAN_BYTES) {
      continue;
    }

    const buffer = readFileSync(fullPath);
    if (buffer.includes(0)) {
      continue;
    }

    entries.push({ path, text: buffer.toString("utf8") });
  }

  return entries;
}

function dedupeFindings(findings: AuditFinding[]) {
  const seen = new Set<string>();
  const deduped: AuditFinding[] = [];

  for (const finding of findings) {
    const key = [
      finding.scope,
      finding.severity,
      finding.rule,
      finding.path,
      finding.line ?? "",
      finding.message,
    ].join("\0");
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(finding);
    }
  }

  return deduped;
}

function formatList(values: string[]) {
  if (values.length === 0) {
    return ["- none"];
  }
  return values.map((value) => `- \`${value}\``);
}

function parseArgs(args: string[]) {
  return {
    fetch: !args.includes("--no-fetch"),
    json: args.includes("--json"),
  };
}

function printUsage() {
  console.error("Usage: tsx scripts/audit-public-safety.ts [--no-fetch] [--json]");
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help") || args.includes("-h")) {
    printUsage();
    return;
  }

  const options = parseArgs(args);
  try {
    const result = runPublicSafetyAudit({ fetch: options.fetch });
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(buildAuditReport(result));
    }
    process.exitCode = summarizeAudit(result.findings).failures > 0 ? 1 : 0;
  } catch (error) {
    if (error instanceof GitCommandError) {
      console.error(`Git command failed: git ${error.args.join(" ")}`);
      if (error.stderr) {
        console.error(error.stderr);
      }
      process.exitCode = 2;
      return;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}

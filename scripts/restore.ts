import { restoreDatabase } from "../server/db/backupRestore";

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const backupArg = args.find((arg) => !arg.startsWith("--"));

if (!backupArg || args.some((arg) => arg.startsWith("--") && arg !== "--yes")) {
  throw new Error("Usage: tsx scripts/restore.ts <backup-path> --yes");
}

console.log(
  JSON.stringify(
    restoreDatabase({
      backupPath: backupArg,
      confirmed,
    }),
    null,
    2,
  ),
);

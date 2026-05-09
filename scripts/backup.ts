import { backupDatabase } from "../server/db/backupRestore";

const args = process.argv.slice(2);

if (args.length > 0) {
  throw new Error("Usage: tsx scripts/backup.ts");
}

console.log(JSON.stringify(backupDatabase(), null, 2));

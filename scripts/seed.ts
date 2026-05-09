import { resolve } from "node:path";
import { seedDemoDatabase } from "../server/seeds/demoSeed";
import { seedDatabase } from "../server/seeds/seedDatabase";

const profile = process.argv[2];

if (profile !== "dev" && profile !== "test" && profile !== "demo") {
  throw new Error("Usage: tsx scripts/seed.ts <dev|test|demo>");
}

const rootDir = resolve(".");
const dbPath = process.env.BUDGET_DB_PATH ?? resolve(rootDir, profile === "test" ? "app.test.db" : "app.db");
const summary =
  profile === "demo"
    ? seedDemoDatabase({ rootDir, dbPath })
    : seedDatabase({ rootDir, profile, dbPath });

console.log(`Seeded profile: ${summary.profile}`);
console.log(`Database path: ${summary.dbPath}`);
if ("workbookPath" in summary) {
  console.log(`Workbook path: ${summary.workbookPath}`);
}
console.log(JSON.stringify(summary.counts, null, 2));

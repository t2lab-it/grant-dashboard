import { resolve } from "node:path";
import { seedDatabase } from "../../server/seeds/seedDatabase";

export function seedTestDatabase(dbPath: string) {
  return seedDatabase({
    rootDir: resolve("."),
    profile: "test",
    dbPath,
  });
}

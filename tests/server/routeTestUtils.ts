import { rmSync } from "node:fs";
import { buildServer } from "../../server/app";
import { seedTestDatabase } from "../support/seed";

export async function createRouteTestContext(dbPath: string) {
  rmSync(dbPath, { force: true });
  seedTestDatabase(dbPath);

  const app = await buildServer({ dbPath, seedDefaultClassifications: false });

  return {
    app,
    async cleanup() {
      await app.close();
      rmSync(dbPath, { force: true });
      rmSync(`${dbPath}.uploads`, { recursive: true, force: true });
    },
  };
}

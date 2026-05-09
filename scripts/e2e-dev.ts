import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { seedDemoDatabase } from "../server/seeds/demoSeed";

const controller = new AbortController();
const dbDir = resolve(".e2e");
const dbPath = resolve(dbDir, "app.db");
const serverPort = Number(process.env.BUDGET_E2E_SERVER_PORT ?? 3001);
const clientPort = Number(process.env.BUDGET_E2E_CLIENT_PORT ?? 5173);
const backendUrl = `http://127.0.0.1:${serverPort}`;
const frontendUrl = `http://127.0.0.1:${clientPort}`;
let shuttingDown = false;
let exitCode = 0;

mkdirSync(dbDir, { recursive: true });
seedDemoDatabase({
  rootDir: resolve("."),
  dbPath,
});

async function waitForHttp(url: string, label: string) {
  const deadline = Date.now() + 30_000;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the child process is ready or times out.
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }

  throw new Error(`Timed out waiting for ${label} at ${url}`);
}

function spawnChild(args: string[], env: NodeJS.ProcessEnv = process.env) {
  const child = spawn("npm", args, {
    stdio: "inherit",
    shell: true,
    signal: controller.signal,
    env,
  });

  child.on("error", (error: unknown) => {
    if (!shuttingDown) {
      console.error(error);
      exitCode = 1;
      shutdown(1);
    }
  });
  child.on("exit", (code: number | null, signal: NodeJS.Signals | null) => {
    if (!shuttingDown) {
      exitCode = code && code !== 0 ? code : 0;
      shutdown(exitCode);
    }

    if (signal && signal !== "SIGTERM" && signal !== "SIGINT") {
      exitCode = 1;
    }
  });

  return child;
}

spawnChild(["run", "dev:server"], {
  ...process.env,
  BUDGET_DB_PATH: dbPath,
  PORT: String(serverPort),
});
await waitForHttp(`${backendUrl}/api/overview`, "backend");
spawnChild(["run", "dev:client", "--", "--host", "127.0.0.1", "--port", String(clientPort), "--strictPort"], {
  ...process.env,
  VITE_BACKEND_URL: backendUrl,
});
await waitForHttp(frontendUrl, "frontend");

function shutdown(code: number) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  exitCode = code;
  controller.abort();
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(signal as NodeJS.Signals, () => shutdown(0));
}

process.on("exit", () => {
  process.exitCode = exitCode;
});

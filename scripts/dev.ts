import { existsSync } from "node:fs";
import { spawn } from "node:child_process";

const controller = new AbortController();
let shuttingDown = false;
let exitCode = 0;

function spawnChild(args: string[]) {
  const child = spawn("npm", args, {
    stdio: "inherit",
    shell: true,
    signal: controller.signal,
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

if (existsSync("server/app.ts")) {
  spawnChild(["run", "dev:server"]);
}

spawnChild(["run", "dev:client"]);

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

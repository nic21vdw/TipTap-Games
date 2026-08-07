#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const parked = join(root, ".native-parked");

const SERVER_ONLY = ["app/api", "app/auth", "app/art-check", "middleware.ts"];

const moved = [];

function park() {
  mkdirSync(parked, { recursive: true });
  for (const rel of SERVER_ONLY) {
    const from = join(root, rel);
    if (!existsSync(from)) continue;
    const to = join(parked, rel.replace(/[\\/]/g, "__"));
    rmSync(to, { recursive: true, force: true });
    renameSync(from, to);
    moved.push([to, from]);
  }
}

function restore() {
  while (moved.length) {
    const [to, from] = moved.pop();
    if (!existsSync(to)) continue;
    mkdirSync(dirname(from), { recursive: true });
    rmSync(from, { recursive: true, force: true });
    renameSync(to, from);
  }
  rmSync(parked, { recursive: true, force: true });
}

let restored = false;
function restoreOnce() {
  if (restored) return;
  restored = true;
  restore();
}

for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) {
  process.on(sig, () => {
    restoreOnce();
    process.exit(1);
  });
}
process.on("exit", restoreOnce);
process.on("uncaughtException", (err) => {
  restoreOnce();
  console.error(err);
  process.exit(1);
});

if (existsSync(parked)) {
  console.warn("[build:native] found a parked tree from an earlier run — restoring it first");
  for (const rel of SERVER_ONLY) {
    const to = join(parked, rel.replace(/[\\/]/g, "__"));
    if (existsSync(to)) moved.push([to, join(root, rel)]);
  }
  restore();
}

park();

rmSync(join(root, "out"), { recursive: true, force: true });

const result = spawnSync(
  process.execPath,
  [join(root, "node_modules", "next", "dist", "bin", "next"), "build"],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      TTG_NATIVE: "1",
      NEXT_PUBLIC_NATIVE: "1",
      NEXT_PUBLIC_API_ORIGIN:
        process.env.NEXT_PUBLIC_API_ORIGIN ?? "https://tip-tap-games-roan.vercel.app",
    },
  }
);

restoreOnce();

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

if (result.status !== 0) process.exit(result.status ?? 1);

if (!existsSync(join(root, "out", "index.html"))) {
  console.error("[build:native] export finished but out/index.html is missing");
  process.exit(1);
}

console.log("[build:native] static bundle ready in out/");

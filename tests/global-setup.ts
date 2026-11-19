import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";

export default function setup(): void {
  const root = process.cwd();
  for (const file of ["test.db", "test.db-journal", "test.db-wal", "test.db-shm"]) {
    const full = path.join(root, "prisma", file);
    if (existsSync(full)) rmSync(full, { force: true });
  }
  execFileSync(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--force-reset"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: "file:./test.db" },
    stdio: "pipe",
  });
}

import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  server: { host: "127.0.0.1" },
  resolve: {
    alias: { "@": path.resolve(process.cwd(), "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 60000,
    hookTimeout: 60000,
    env: {
      DATABASE_URL: "file:./test.db",
      APP_SECRET: "test-secret",
      NODE_ENV: "test",
    },
  },
});

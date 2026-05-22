import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@syllabus": path.resolve(__dirname, "src/domains/syllabus"),
      "@routines": path.resolve(__dirname, "src/domains/routines"),
      "@social": path.resolve(__dirname, "src/domains/social"),
      "@orgs": path.resolve(__dirname, "src/domains/orgs"),
      "@messaging": path.resolve(__dirname, "src/domains/messaging"),
      "@competitions": path.resolve(__dirname, "src/domains/competitions"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    // Two projects with different runtimes:
    //  - "node":   existing Drizzle/tRPC integration tests against local Postgres
    //  - "convex": Convex function tests in the edge-runtime environment
    // Vitest 4 removed `environmentMatchGlobs`; `projects` is the replacement.
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          globals: true,
          include: ["tests/**/*.test.ts"],
          globalSetup: [
            "./tests/setup/global-setup.ts",
            "./tests/setup/global-teardown.ts",
          ],
          setupFiles: ["./tests/setup/vitest-setup.ts"],
          testTimeout: 15_000,
          hookTimeout: 15_000,
          environment: "node",
          // `fileParallelism: false` is essential — the Postgres integration
          // tests share one database and race without sequential file runs.
          pool: "forks",
          forks: { singleFork: true },
          fileParallelism: false,
        },
      },
      {
        extends: true,
        test: {
          name: "convex",
          globals: true,
          include: ["convex/**/*.test.{ts,js}"],
          environment: "edge-runtime",
        },
      },
    ],
  },
});

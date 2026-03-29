import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    globals: true,
    globalSetup: "./tests/setup/global-setup.ts",
    setupFiles: ["./tests/setup/vitest-setup.ts"],
    testTimeout: 15_000,
    hookTimeout: 15_000,
    pool: "forks",
    poolOptions: {
      forks: { singleFork: true },
    },
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "src/shared"),
      "@syllabus": path.resolve(__dirname, "src/domains/syllabus"),
      "@routines": path.resolve(__dirname, "src/domains/routines"),
      "@social": path.resolve(__dirname, "src/domains/social"),
      "@orgs": path.resolve(__dirname, "src/domains/orgs"),
      "@messaging": path.resolve(__dirname, "src/domains/messaging"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});

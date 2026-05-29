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
    name: "convex",
    globals: true,
    include: ["convex/**/*.test.{ts,js}", "scripts/**/*.test.{ts,js}"],
    environment: "edge-runtime",
  },
});

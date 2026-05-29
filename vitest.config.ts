import path from "path";
import { defineConfig } from "vitest/config";

const alias = {
  "@shared": path.resolve(__dirname, "src/shared"),
  "@syllabus": path.resolve(__dirname, "src/domains/syllabus"),
  "@routines": path.resolve(__dirname, "src/domains/routines"),
  "@social": path.resolve(__dirname, "src/domains/social"),
  "@orgs": path.resolve(__dirname, "src/domains/orgs"),
  "@messaging": path.resolve(__dirname, "src/domains/messaging"),
  "@competitions": path.resolve(__dirname, "src/domains/competitions"),
  "@": path.resolve(__dirname, "src"),
};

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    projects: [
      {
        resolve: {
          alias,
        },
        test: {
          name: "convex",
          include: ["convex/**/*.test.{ts,js}"],
          environment: "edge-runtime",
        },
      },
      {
        resolve: {
          alias,
        },
        test: {
          name: "src",
          include: ["src/**/*.test.{ts,js,tsx,jsx}"],
          environment: "node",
        },
      },
      {
        resolve: {
          alias,
        },
        test: {
          name: "scripts",
          include: ["scripts/**/*.test.{ts,js}"],
          environment: "node",
        },
      },
    ],
  },
});

import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: [
    "./src/shared/schema.ts",
    "./src/shared/db/enums.ts",
    "./src/domains/syllabus/schema.ts",
    "./src/domains/routines/schema.ts",
  ],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});

import { describe, it } from "vitest";

// Foundation smoke test for the Convex backend.
//
// The real assertion needs `convex/schema.ts`, which Task 2 of the Convex
// migration creates. Until then this stays skipped so the test harness
// (vitest `convex` project, edge-runtime environment) is exercised without a
// hard dependency on the schema.
//
// Task 2 replaces the body with:
//
//   import { convexTest } from "convex-test";
//   import schema from "./schema";
//   import { modules } from "./test.setup";
//
//   const t = convexTest(schema, modules);
//   const dances = await t.run((ctx) => ctx.db.query("dances").collect());
//   expect(dances).toEqual([]);
describe("convex foundation", () => {
  it.skip("starts with an empty test database", () => {
    // Enabled by Task 2 after convex/schema.ts exists.
  });
});

import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";

// Foundation smoke test for the Convex backend. Enabled by Task 2 of the
// Convex migration now that `convex/schema.ts` exists: it exercises the
// vitest `convex` project (edge-runtime environment), the `convex-test`
// harness, and the schema together.
describe("convex foundation", () => {
  it("starts with an empty test database", async () => {
    const t = convexTest(schema, modules);
    const dances = await t.run(async (ctx) => {
      return await ctx.db.query("dances").collect();
    });

    expect(dances).toEqual([]);
  });
});

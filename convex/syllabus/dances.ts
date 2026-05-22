import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Syllabus dance queries — read-only public data.
 *
 * Replaces the `danceRouter` tRPC procedures
 * (`src/domains/syllabus/routers/dance.ts`) for the Convex migration
 * (docs/superpowers/plans/2026-05-22-convex-migration.md, Task 3).
 */

/**
 * List every dance ordered by display name, each annotated with its figure
 * count. One screen-level query backs the `/dances` index page so it never
 * fans out a per-dance count request.
 */
export const list = query({
  args: {},
  handler: async (ctx) => {
    const dances = await ctx.db.query("dances").collect();
    dances.sort((a, b) => a.displayName.localeCompare(b.displayName));

    return await Promise.all(
      dances.map(async (dance) => {
        const figures = await ctx.db
          .query("figures")
          .withIndex("by_dance", (q) => q.eq("danceId", dance._id))
          .collect();
        return {
          id: dance._id,
          name: dance.name,
          displayName: dance.displayName,
          timeSignature: dance.timeSignature ?? null,
          tempoDescription: dance.tempoDescription ?? null,
          figureCount: figures.length,
        };
      }),
    );
  },
});

/**
 * Find a dance by its URL slug (`name`). Returns `null` when no dance
 * matches so callers can render a 404.
 */
export const getByName = query({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const dance = await ctx.db
      .query("dances")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (!dance) return null;
    return {
      id: dance._id,
      name: dance.name,
      displayName: dance.displayName,
      timeSignature: dance.timeSignature ?? null,
      tempoDescription: dance.tempoDescription ?? null,
    };
  },
});

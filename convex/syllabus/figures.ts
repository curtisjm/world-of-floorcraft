import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { figureLevel } from "../schema";

/**
 * Syllabus figure queries — read-only public data.
 *
 * Replaces the `figureRouter` tRPC procedures
 * (`src/domains/syllabus/routers/figure.ts`) for the Convex migration
 * (docs/superpowers/plans/2026-05-22-convex-migration.md, Task 3).
 */

/** Compact figure shape for list and graph views. */
function figureSummary(doc: Doc<"figures">) {
  return {
    id: doc._id,
    name: doc.name,
    variantName: doc.variantName ?? null,
    level: doc.level,
    figureNumber: doc.figureNumber ?? null,
  };
}

/** Full figure shape for the detail page. */
function figureDetail(doc: Doc<"figures">) {
  return {
    id: doc._id,
    danceId: doc.danceId,
    figureNumber: doc.figureNumber ?? null,
    name: doc.name,
    variantName: doc.variantName ?? null,
    level: doc.level,
    leaderSteps: doc.leaderSteps ?? null,
    followerSteps: doc.followerSteps ?? null,
    leaderFootwork: doc.leaderFootwork ?? null,
    followerFootwork: doc.followerFootwork ?? null,
    leaderCbm: doc.leaderCbm ?? null,
    followerCbm: doc.followerCbm ?? null,
    leaderSway: doc.leaderSway ?? null,
    followerSway: doc.followerSway ?? null,
    timing: doc.timing ?? null,
    beatValue: doc.beatValue ?? null,
    notes: doc.notes ?? null,
  };
}

/** Order figures by figure number, then name — matches the old SQL sort. */
function sortFigures(figures: Doc<"figures">[]): Doc<"figures">[] {
  return [...figures].sort((a, b) => {
    const an = a.figureNumber ?? Number.MAX_SAFE_INTEGER;
    const bn = b.figureNumber ?? Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    return a.name.localeCompare(b.name);
  });
}

/**
 * List a dance's figures, optionally filtered by teaching level, ordered by
 * figure number then name. Backs the figure-list page.
 */
export const listByDance = query({
  args: { danceId: v.id("dances"), level: v.optional(figureLevel) },
  handler: async (ctx, { danceId, level }) => {
    const figures = level
      ? await ctx.db
          .query("figures")
          .withIndex("by_dance_level", (q) =>
            q.eq("danceId", danceId).eq("level", level),
          )
          .collect()
      : await ctx.db
          .query("figures")
          .withIndex("by_dance", (q) => q.eq("danceId", danceId))
          .collect();
    return sortFigures(figures).map(figureSummary);
  },
});

/**
 * Read one figure by id. Accepts the raw URL id string and returns `null`
 * for unknown or malformed ids so callers can render a 404.
 */
export const getDetail = query({
  args: { figureId: v.string() },
  handler: async (ctx, { figureId }) => {
    const id = ctx.db.normalizeId("figures", figureId);
    if (!id) return null;
    const figure = await ctx.db.get(id);
    return figure ? figureDetail(figure) : null;
  },
});

/**
 * Resolve a figure's transition neighbours. `precedes` are figures that can
 * lead into it; `follows` are figures it can lead into. Each entry carries
 * the connecting edge plus the neighbour figure summary, so the detail and
 * local-graph pages need no extra figure lookups.
 */
export const neighbors = query({
  args: { figureId: v.string() },
  handler: async (ctx, { figureId }) => {
    const id = ctx.db.normalizeId("figures", figureId);
    if (!id) return { precedes: [], follows: [] };

    const incoming = await ctx.db
      .query("figureEdges")
      .withIndex("by_target", (q) => q.eq("targetFigureId", id))
      .collect();
    const outgoing = await ctx.db
      .query("figureEdges")
      .withIndex("by_source", (q) => q.eq("sourceFigureId", id))
      .collect();

    const toEntry = async (edge: Doc<"figureEdges">, neighborId: Doc<"figureEdges">["sourceFigureId"]) => {
      const figure = await ctx.db.get(neighborId);
      return {
        id: edge._id,
        sourceFigureId: edge.sourceFigureId,
        targetFigureId: edge.targetFigureId,
        level: edge.level,
        conditions: edge.conditions ?? null,
        figure: figure ? figureSummary(figure) : null,
      };
    };

    const precedes = await Promise.all(
      incoming.map((edge) => toEntry(edge, edge.sourceFigureId)),
    );
    const follows = await Promise.all(
      outgoing.map((edge) => toEntry(edge, edge.targetFigureId)),
    );
    return { precedes, follows };
  },
});

/**
 * Screen-level query for the whole-dance graph: every figure in the dance
 * plus every transition between them. A single query keeps the graph page
 * from fanning out a per-figure edge lookup.
 */
export const danceGraph = query({
  args: { danceId: v.id("dances") },
  handler: async (ctx, { danceId }) => {
    const figures = await ctx.db
      .query("figures")
      .withIndex("by_dance", (q) => q.eq("danceId", danceId))
      .collect();
    const figureIds = new Set(figures.map((f) => f._id));

    const edges = [];
    for (const figure of figures) {
      const outgoing = await ctx.db
        .query("figureEdges")
        .withIndex("by_source", (q) => q.eq("sourceFigureId", figure._id))
        .collect();
      for (const edge of outgoing) {
        // Keep intra-dance edges only — a transition to a figure outside
        // this dance would be a dangling node in the graph.
        if (!figureIds.has(edge.targetFigureId)) continue;
        edges.push({
          id: edge._id,
          sourceFigureId: edge.sourceFigureId,
          targetFigureId: edge.targetFigureId,
          level: edge.level,
          conditions: edge.conditions ?? null,
        });
      }
    }

    return { figures: sortFigures(figures).map(figureSummary), edges };
  },
});

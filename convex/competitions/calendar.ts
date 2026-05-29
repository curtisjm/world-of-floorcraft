import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { danceStyle } from "../schema";

/**
 * Public competition calendar — upcoming, past, and per-competition preview.
 * Ported from `src/domains/competitions/routers/calendar.ts`.
 */

const UPCOMING_STATUSES = new Set<Doc<"competitions">["status"]>([
  "advertised",
  "accepting_entries",
  "entries_closed",
  "running",
]);

async function enrichComp(ctx: QueryCtx, comp: Doc<"competitions">) {
  const org = await ctx.db.get(comp.orgId);
  const days = await ctx.db
    .query("competitionDays")
    .withIndex("by_competition_position", (q) =>
      q.eq("competitionId", comp._id),
    )
    .collect();
  days.sort((a, b) => a.position - b.position);
  const dates = days.map((d) => d.date).sort();
  const events = await ctx.db
    .query("competitionEvents")
    .withIndex("by_competition", (q) => q.eq("competitionId", comp._id))
    .collect();
  const styles = [...new Set(events.map((e) => e.style))];
  const regs = await ctx.db
    .query("competitionRegistrations")
    .withIndex("by_competition_user", (q) => q.eq("competitionId", comp._id))
    .collect();
  const active = regs.filter((r) => !r.cancelled);
  return {
    org,
    startDate: dates[0] ?? null,
    endDate: dates[dates.length - 1] ?? null,
    styles,
    events,
    registrationCount: active.length,
  };
}

export const getUpcoming = query({
  args: {
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    dateFrom: v.optional(v.string()),
    dateTo: v.optional(v.string()),
    style: v.optional(danceStyle),
  },
  handler: async (ctx, args) => {
    const byStatus = await Promise.all(
      [...UPCOMING_STATUSES].map((status) =>
        args.state
          ? ctx.db
              .query("competitions")
              .withIndex("by_status_state", (q) =>
                q.eq("status", status).eq("state", args.state),
              )
              .collect()
          : ctx.db
              .query("competitions")
              .withIndex("by_status", (q) => q.eq("status", status))
              .collect(),
      ),
    );
    const filteredByLocation = byStatus.flat().filter((c) => {
      if (
        args.city &&
        !c.city?.toLowerCase().includes(args.city.toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    const enriched = await Promise.all(
      filteredByLocation.map(async (comp) => {
        const e = await enrichComp(ctx, comp);
        return {
          id: comp._id,
          name: comp.name,
          slug: comp.slug,
          status: comp.status,
          organizationName: e.org?.name ?? null,
          city: comp.city,
          state: comp.state,
          startDate: e.startDate,
          endDate: e.endDate,
          styles: e.styles,
          registrationCount: e.registrationCount,
        };
      }),
    );

    let filtered = enriched;
    if (args.dateFrom) {
      filtered = filtered.filter(
        (c) => c.startDate && c.startDate >= args.dateFrom!,
      );
    }
    if (args.dateTo) {
      filtered = filtered.filter(
        (c) => c.startDate && c.startDate <= args.dateTo!,
      );
    }
    if (args.style) {
      filtered = filtered.filter((c) => c.styles.includes(args.style!));
    }
    filtered.sort((a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.localeCompare(b.startDate);
    });
    return filtered;
  },
});

export const getPast = query({
  args: {
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    year: v.optional(v.number()),
    style: v.optional(danceStyle),
    limit: v.optional(v.number()),
    offset: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let filtered = await (args.state
      ? ctx.db
          .query("competitions")
          .withIndex("by_status_state", (q) =>
            q.eq("status", "finished").eq("state", args.state),
          )
          .collect()
      : ctx.db
          .query("competitions")
          .withIndex("by_status", (q) => q.eq("status", "finished"))
          .collect());
    filtered = filtered.filter((c) => {
      if (
        args.city &&
        !c.city?.toLowerCase().includes(args.city.toLowerCase())
      ) {
        return false;
      }
      return true;
    });

    const enriched = await Promise.all(
      filtered.map(async (comp) => {
        const e = await enrichComp(ctx, comp);
        return {
          id: comp._id,
          name: comp.name,
          slug: comp.slug,
          organizationName: e.org?.name ?? null,
          city: comp.city,
          state: comp.state,
          startDate: e.startDate,
          styles: e.styles,
        };
      }),
    );

    let result = enriched;
    if (args.year) {
      result = result.filter(
        (c) => c.startDate && c.startDate.startsWith(String(args.year)),
      );
    }
    if (args.style) {
      result = result.filter((c) => c.styles.includes(args.style!));
    }
    result.sort((a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return b.startDate.localeCompare(a.startDate);
    });

    const total = result.length;
    const limit = Math.min(Math.max(args.limit ?? 20, 1), 100);
    const offset = Math.max(args.offset ?? 0, 0);
    return {
      competitions: result.slice(offset, offset + limit),
      total,
    };
  },
});

export const getCompetitionPreview = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const comp = await ctx.db.get(args.competitionId);
    if (!comp || comp.status === "archived") return null;
    const e = await enrichComp(ctx, comp);
    return {
      id: comp._id,
      name: comp.name,
      slug: comp.slug,
      status: comp.status,
      organizationName: e.org?.name ?? null,
      city: comp.city,
      state: comp.state,
      startDate: e.startDate,
      endDate: e.endDate,
      eventCount: e.events.length,
      registrationCount: e.registrationCount,
      styles: e.styles,
    };
  },
});

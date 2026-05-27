import { ConvexError, v } from "convex/values";
import * as bcrypt from "bcryptjs";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser } from "../lib/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireCompOrgRole } from "../lib/permissions";
import { competitionStatus } from "../schema";

/**
 * Competition lifecycle — create, read, update, delete, status, dashboard
 * aggregates. Ported from the Drizzle/tRPC `competition` router
 * (`src/domains/competitions/routers/competition.ts`) for Task 9 of the
 * Convex migration (docs/superpowers/plans/2026-05-22-convex-migration.md).
 *
 * Numeric IDs are replaced by Convex document IDs. Money fields (`baseFee`)
 * are stored as integer cents — the helpers in `convex/lib/money.ts` convert
 * to/from dollar strings at UI boundaries.
 */

const NAME_MAX = 200;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlug(
  ctx: QueryCtx,
  base: string,
): Promise<string> {
  let slug = base;
  const existing = await ctx.db
    .query("competitions")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();
  if (existing) {
    slug = `${slug}-${Date.now()}`;
  }
  return slug;
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Public competition profile by slug. Returns `null` for an unknown slug so
 * the competition page can render not-found without an error boundary.
 * Joins the parent org for header rendering.
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const comp = await ctx.db
      .query("competitions")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!comp) return null;
    const org = await ctx.db.get(comp.orgId);
    return {
      ...comp,
      orgName: org?.name ?? null,
      orgSlug: org?.slug ?? null,
      orgAvatarUrl: org?.avatarUrl ?? null,
    };
  },
});

/**
 * Paginated competition index, optionally filtered by status or org. Ordered
 * by creation time descending so the freshest competitions appear first.
 */
export const list = query({
  args: {
    status: v.optional(competitionStatus),
    orgId: v.optional(v.id("organizations")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await (async () => {
      if (args.orgId && args.status) {
        const { orgId, status } = args;
        return ctx.db
          .query("competitions")
          .withIndex("by_org_status", (q) =>
            q.eq("orgId", orgId).eq("status", status),
          )
          .order("desc")
          .paginate(args.paginationOpts);
      }
      if (args.orgId) {
        const { orgId } = args;
        return ctx.db
          .query("competitions")
          .withIndex("by_org", (q) => q.eq("orgId", orgId))
          .order("desc")
          .paginate(args.paginationOpts);
      }
      if (args.status) {
        const { status } = args;
        return ctx.db
          .query("competitions")
          .withIndex("by_status", (q) => q.eq("status", status))
          .order("desc")
          .paginate(args.paginationOpts);
      }
      return ctx.db
        .query("competitions")
        .order("desc")
        .paginate(args.paginationOpts);
    })();
    const enriched = await Promise.all(
      result.page.map(async (c) => {
        const org = await ctx.db.get(c.orgId);
        return {
          ...c,
          orgName: org?.name ?? null,
          orgSlug: org?.slug ?? null,
        };
      }),
    );
    return { ...result, page: enriched };
  },
});

/**
 * Competition + schedule + counts payload for the organizer dashboard root.
 * Requires org-role auth on the competition.
 */
export const getForDashboard = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const { competition } = await requireCompOrgRole(ctx, args.competitionId);

    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    days.sort((a, b) => a.position - b.position);

    const dayIds = days.map((d) => d._id);
    const blocks: Doc<"scheduleBlocks">[] = [];
    for (const dayId of dayIds) {
      const dayBlocks = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_day_position", (q) => q.eq("dayId", dayId))
        .collect();
      blocks.push(...dayBlocks);
    }
    blocks.sort((a, b) => a.position - b.position);

    const eventCount = (
      await ctx.db
        .query("competitionEvents")
        .withIndex("by_competition", (q) =>
          q.eq("competitionId", args.competitionId),
        )
        .collect()
    ).length;

    const staffRows = await ctx.db
      .query("competitionStaff")
      .withIndex("by_competition_user_role", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const staffCount = staffRows.length;
    const staffRoleCounts: Record<string, number> = {};
    for (const row of staffRows) {
      staffRoleCounts[row.role] = (staffRoleCounts[row.role] ?? 0) + 1;
    }

    const judgeCount = (
      await ctx.db
        .query("competitionJudges")
        .withIndex("by_competition_judge", (q) =>
          q.eq("competitionId", args.competitionId),
        )
        .collect()
    ).length;

    return {
      ...competition,
      days: days.map((day) => ({
        ...day,
        blocks: blocks.filter((b) => b.dayId === day._id),
      })),
      eventCount,
      staffCount,
      staffRoleCounts,
      judgeCount,
    };
  },
});

/**
 * Checklist data for the dashboard "setup status" panel: schedule, events,
 * staff coverage, registration state, number assignment, and round generation.
 */
export const setupStatus = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const { competition } = await requireCompOrgRole(ctx, args.competitionId);
    const compId = competition._id;

    // 1. Schedule — at least 1 day exists
    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", compId),
      )
      .collect();

    // 2. Events — at least 1 event exists
    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) => q.eq("competitionId", compId))
      .collect();

    // 3. Staff — scrutineer + emcee + chairman + DJ (1 each) + 5 judges
    const staffRows = await ctx.db
      .query("competitionStaff")
      .withIndex("by_competition_user_role", (q) =>
        q.eq("competitionId", compId),
      )
      .collect();
    const roleCounts: Record<string, number> = {};
    for (const r of staffRows) {
      roleCounts[r.role] = (roleCounts[r.role] ?? 0) + 1;
    }
    const judges = (
      await ctx.db
        .query("competitionJudges")
        .withIndex("by_competition_judge", (q) =>
          q.eq("competitionId", compId),
        )
        .collect()
    ).length;
    const staffDetail = {
      scrutineer: roleCounts["scrutineer"] ?? 0,
      emcee: roleCounts["emcee"] ?? 0,
      chairman: roleCounts["chairman"] ?? 0,
      dj: roleCounts["dj"] ?? 0,
      judges,
    };

    // 4. Registration opened — status at or beyond accepting_entries
    const statusOrder = [
      "draft",
      "advertised",
      "accepting_entries",
      "entries_closed",
      "running",
      "finished",
    ];
    const registrationOpen =
      statusOrder.indexOf(competition.status) >=
      statusOrder.indexOf("accepting_entries");

    // 5. Competitor numbers — all active registrations have a number
    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) => q.eq("competitionId", compId))
      .collect();
    const active = regs.filter((r) => !r.cancelled);
    const totalRegs = active.length;
    const unnumbered = active.filter(
      (r) => r.competitorNumber === undefined,
    ).length;

    // 6. Heats finalized — events with entries have rounds generated
    const eventIds = events.map((e) => e._id);
    const eventsWithEntriesSet = new Set<Id<"competitionEvents">>();
    for (const eventId of eventIds) {
      const eventEntries = await ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect();
      if (eventEntries.some((e) => !e.scratched)) {
        eventsWithEntriesSet.add(eventId);
      }
    }
    const eventsWithEntries = eventsWithEntriesSet.size;

    let eventsWithRounds = 0;
    for (const eventId of eventsWithEntriesSet) {
      const round = await ctx.db
        .query("rounds")
        .withIndex("by_event_position", (q) => q.eq("eventId", eventId))
        .first();
      if (round) eventsWithRounds++;
    }

    return {
      hasSchedule: days.length > 0,
      hasEvents: events.length > 0,
      staffComplete:
        staffDetail.scrutineer >= 1 &&
        staffDetail.emcee >= 1 &&
        staffDetail.chairman >= 1 &&
        staffDetail.dj >= 1 &&
        staffDetail.judges >= 5,
      staffDetail,
      registrationOpen,
      numbersAssigned: totalRegs > 0 && unnumbered === 0,
      numbersDetail: { total: totalRegs, assigned: totalRegs - unnumbered },
      heatsFinalized:
        eventsWithEntries > 0 && eventsWithEntries === eventsWithRounds,
      heatsDetail: { eventsWithEntries, eventsWithRounds },
    };
  },
});

// ── Mutations ───────────────────────────────────────────────────────

/**
 * Create a competition under an org. The caller must be an admin or owner
 * of the org. The slug is auto-generated from the name; collisions append a
 * timestamp suffix to keep URLs stable on retry.
 */
export const create = mutation({
  args: {
    name: v.string(),
    orgId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);

    const name = args.name.trim();
    if (name.length === 0 || name.length > NAME_MAX) {
      badRequest("Name must be 1-200 characters");
    }

    const org = await ctx.db.get(args.orgId);
    if (!org) notFound("Organization not found");
    if (org.ownerId !== user._id) {
      const membership = await ctx.db
        .query("memberships")
        .withIndex("by_org_user", (q) =>
          q.eq("orgId", args.orgId).eq("userId", user._id),
        )
        .unique();
      if (!membership || membership.role !== "admin") {
        forbidden("Org admin or owner required");
      }
    }

    const slug = await uniqueSlug(ctx, slugify(name));

    const now = Date.now();
    const compId = await ctx.db.insert("competitions", {
      orgId: args.orgId,
      createdBy: user._id,
      name,
      slug,
      status: "draft",
      pricingModel: "flat_fee",
      requirePaymentAtRegistration: false,
      stripeOnboardingComplete: false,
      createdAt: now,
      updatedAt: now,
    });
    const comp = await ctx.db.get(compId);
    if (!comp) {
      throw new ConvexError({
        code: "INTERNAL",
        message: "Competition creation failed",
      });
    }
    return comp;
  },
});

/** Update mutable competition fields. Org admin/owner or scrutineer only. */
export const update = mutation({
  args: {
    competitionId: v.id("competitions"),
    name: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
    rules: v.optional(v.union(v.string(), v.null())),
    venueName: v.optional(v.union(v.string(), v.null())),
    streetAddress: v.optional(v.union(v.string(), v.null())),
    city: v.optional(v.union(v.string(), v.null())),
    state: v.optional(v.union(v.string(), v.null())),
    zip: v.optional(v.union(v.string(), v.null())),
    country: v.optional(v.union(v.string(), v.null())),
    venueNotes: v.optional(v.union(v.string(), v.null())),
    maxFinalSize: v.optional(v.union(v.number(), v.null())),
    maxHeatSize: v.optional(v.union(v.number(), v.null())),
    baseFee: v.optional(v.union(v.number(), v.null())),
    numberStart: v.optional(v.number()),
    numberExclusions: v.optional(v.union(v.array(v.number()), v.null())),
    minutesPerCouplePerDance: v.optional(v.number()),
    transitionMinutes: v.optional(v.number()),
    pricingModel: v.optional(
      v.union(v.literal("flat_fee"), v.literal("per_event")),
    ),
    requirePaymentAtRegistration: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const patch: Partial<Doc<"competitions">> = { updatedAt: Date.now() };
    const { competitionId: _competitionId, ...rest } = args;
    void _competitionId;
    for (const [key, value] of Object.entries(rest)) {
      if (value === undefined) continue;
      // Convex `patch` treats `undefined` as "leave alone"; `null` to clear.
      // We accept `null` via the union and translate to undefined so the
      // optional field is cleared.
      if (value === null) {
        (patch as Record<string, unknown>)[key] = undefined;
      } else {
        (patch as Record<string, unknown>)[key] = value;
      }
    }

    if (patch.name !== undefined) {
      const trimmed = (patch.name as string).trim();
      if (trimmed.length === 0 || trimmed.length > NAME_MAX) {
        badRequest("Name must be 1-200 characters");
      }
      patch.name = trimmed;
    }

    await ctx.db.patch(args.competitionId, patch);
    const updated = await ctx.db.get(args.competitionId);
    return updated;
  },
});

/** Update a competition's lifecycle status. */
export const updateStatus = mutation({
  args: {
    competitionId: v.id("competitions"),
    status: competitionStatus,
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    await ctx.db.patch(args.competitionId, {
      status: args.status,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.competitionId);
  },
});

/**
 * Delete a competition. Owner only. Cascades to schedule, events, staff,
 * judge assignments, registrations, entries, payments, rounds, marks, and
 * other competition-scoped rows.
 */
export const remove = mutation({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) notFound("Competition not found");
    const org = await ctx.db.get(comp.orgId);
    if (org?.ownerId !== user._id) {
      forbidden("Only the org owner can delete a competition");
    }

    // Cascading cleanup — schema does not enforce FK on Convex, so we
    // explicitly delete children. Order: dependents first.

    // Schedule
    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const day of days) {
      const blocks = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_day_position", (q) => q.eq("dayId", day._id))
        .collect();
      for (const b of blocks) await ctx.db.delete(b._id);
      await ctx.db.delete(day._id);
    }

    // Events + dances + per-event derived data
    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const event of events) {
      const dances = await ctx.db
        .query("eventDances")
        .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
        .collect();
      for (const d of dances) await ctx.db.delete(d._id);
      const rounds = await ctx.db
        .query("rounds")
        .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
        .collect();
      for (const r of rounds) await ctx.db.delete(r._id);
      const overrides = await ctx.db
        .query("eventTimeOverrides")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      for (const o of overrides) await ctx.db.delete(o._id);
      const eventEntries = await ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      for (const e of eventEntries) await ctx.db.delete(e._id);
      await ctx.db.delete(event._id);
    }

    // Judges + staff assignments
    const cjs = await ctx.db
      .query("competitionJudges")
      .withIndex("by_competition_judge", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const cj of cjs) await ctx.db.delete(cj._id);
    const staffRows = await ctx.db
      .query("competitionStaff")
      .withIndex("by_competition_user_role", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const s of staffRows) await ctx.db.delete(s._id);

    // Registrations + payments + pricing tiers
    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const reg of regs) {
      const payRows = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      for (const p of payRows) await ctx.db.delete(p._id);
      await ctx.db.delete(reg._id);
    }
    const tiers = await ctx.db
      .query("pricingTiers")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const t of tiers) await ctx.db.delete(t._id);

    // TBA + team match + add/drop
    const tbas = await ctx.db
      .query("tbaListings")
      .withIndex("by_competition_fulfilled", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const t of tbas) await ctx.db.delete(t._id);
    const teamMatch = await ctx.db
      .query("teamMatchSubmissions")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const t of teamMatch) await ctx.db.delete(t._id);
    const addDrops = await ctx.db
      .query("addDropRequests")
      .withIndex("by_competition_status", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    for (const ad of addDrops) await ctx.db.delete(ad._id);

    await ctx.db.delete(args.competitionId);
    return { success: true };
  },
});

/**
 * Set the 3-4 character public competition code used by judge tablets and
 * deck-captain workflows. Validates uniqueness across competitions.
 */
export const setCompCode = mutation({
  args: {
    competitionId: v.id("competitions"),
    compCode: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const code = args.compCode;
    if (!/^[A-Z0-9]{3,4}$/.test(code)) {
      badRequest("Must be 3-4 uppercase letters/numbers");
    }

    const existing = await ctx.db
      .query("competitions")
      .withIndex("by_comp_code", (q) => q.eq("compCode", code))
      .unique();
    if (existing && existing._id !== args.competitionId) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Competition code already in use",
      });
    }

    await ctx.db.patch(args.competitionId, {
      compCode: code,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.competitionId);
  },
});

/**
 * Store a bcrypt hash of the competition's master password. The plaintext
 * value never leaves this function. bcryptjs is pure-JS and runs in the
 * Convex V8 runtime.
 */
export const setMasterPassword = mutation({
  args: {
    competitionId: v.id("competitions"),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    if (args.password.length < 4) {
      badRequest("Password must be at least 4 characters");
    }
    const hash = await bcrypt.hash(args.password, 10);

    await ctx.db.patch(args.competitionId, {
      masterPasswordHash: hash,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.competitionId);
  },
});

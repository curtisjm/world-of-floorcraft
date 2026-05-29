import { ConvexError, v } from "convex/values";
import * as bcrypt from "bcryptjs";
import { paginationOptsValidator } from "convex/server";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser, getCurrentUserOrNull } from "../lib/auth";
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

type Ctx = QueryCtx | MutationCtx;

async function canManageCompetition(
  ctx: Ctx,
  competition: Doc<"competitions">,
): Promise<boolean> {
  const user = await getCurrentUserOrNull(ctx);
  if (!user) return false;

  const org = await ctx.db.get(competition.orgId);
  if (org?.ownerId === user._id) return true;

  const membership = await ctx.db
    .query("memberships")
    .withIndex("by_org_user", (q) =>
      q.eq("orgId", competition.orgId).eq("userId", user._id),
    )
    .unique();
  if (membership?.role === "admin") return true;

  const scrutineer = await ctx.db
    .query("competitionStaff")
    .withIndex("by_competition_user_role", (q) =>
      q
        .eq("competitionId", competition._id)
        .eq("userId", user._id)
        .eq("role", "scrutineer"),
    )
    .unique();
  return scrutineer !== null;
}

async function visibleOnPublicSurfaces(
  ctx: Ctx,
  competition: Doc<"competitions">,
  includeArchived: boolean | undefined,
): Promise<boolean> {
  if (competition.status !== "archived") return true;
  return includeArchived === true && (await canManageCompetition(ctx, competition));
}

async function competitionDeletionBlockers(
  ctx: Ctx,
  competitionId: Id<"competitions">,
): Promise<string[]> {
  const blockers: string[] = [];
  const add = (label: string, count: number) => {
    if (count > 0) blockers.push(`${label} (${count})`);
  };

  const registrations = await ctx.db
    .query("competitionRegistrations")
    .withIndex("by_competition_user", (q) =>
      q.eq("competitionId", competitionId),
    )
    .collect();
  add("registrations", registrations.length);

  const payments = await ctx.db
    .query("payments")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  add("payments", payments.length);

  const checkoutSessions = await ctx.db
    .query("stripeCheckoutSessions")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  add("checkout sessions", checkoutSessions.length);

  let registrationCheckins = 0;
  for (const registration of registrations) {
    registrationCheckins += (
      await ctx.db
        .query("registrationCheckins")
        .withIndex("by_registration", (q) =>
          q.eq("registrationId", registration._id),
        )
        .collect()
    ).length;
  }
  add("check-ins", registrationCheckins);

  const events = await ctx.db
    .query("competitionEvents")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();

  const entryIds = new Set<Id<"entries">>();
  const directEntries = await ctx.db
    .query("entries")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  for (const entry of directEntries) entryIds.add(entry._id);

  let rounds = 0;
  let heats = 0;
  let heatAssignments = 0;
  let callbackMarks = 0;
  let finalMarks = 0;
  let judgeSubmissions = 0;
  let callbackResults = 0;
  let finalResults = 0;
  let tabulationTables = 0;
  let roundResultsMeta = 0;
  const activeRounds = (
    await ctx.db
      .query("activeRounds")
      .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
      .collect()
  ).length;
  let markCorrections = 0;
  let deckCaptainCheckins = 0;

  for (const event of events) {
    const eventEntries = await ctx.db
      .query("entries")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    for (const entry of eventEntries) entryIds.add(entry._id);

    const eventRounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
      .collect();
    rounds += eventRounds.length;

    for (const round of eventRounds) {
      const roundHeats = await ctx.db
        .query("heats")
        .withIndex("by_round_number", (q) => q.eq("roundId", round._id))
        .collect();
      heats += roundHeats.length;
      for (const heat of roundHeats) {
        heatAssignments += (
          await ctx.db
            .query("heatAssignments")
            .withIndex("by_heat_entry", (q) => q.eq("heatId", heat._id))
            .collect()
        ).length;
      }

      callbackMarks += (
        await ctx.db
          .query("callbackMarks")
          .withIndex("by_round_judge_entry", (q) => q.eq("roundId", round._id))
          .collect()
      ).length;
      finalMarks += (
        await ctx.db
          .query("finalMarks")
          .withIndex("by_round_judge_entry_dance", (q) =>
            q.eq("roundId", round._id),
          )
          .collect()
      ).length;
      judgeSubmissions += (
        await ctx.db
          .query("judgeSubmissions")
          .withIndex("by_round_judge", (q) => q.eq("roundId", round._id))
          .collect()
      ).length;
      callbackResults += (
        await ctx.db
          .query("callbackResults")
          .withIndex("by_round_entry", (q) => q.eq("roundId", round._id))
          .collect()
      ).length;
      finalResults += (
        await ctx.db
          .query("finalResults")
          .withIndex("by_round_entry_dance", (q) => q.eq("roundId", round._id))
          .collect()
      ).length;
      tabulationTables += (
        await ctx.db
          .query("tabulationTables")
          .withIndex("by_round_entry_dance", (q) => q.eq("roundId", round._id))
          .collect()
      ).length;
      roundResultsMeta += (
        await ctx.db
          .query("roundResultsMeta")
          .withIndex("by_round", (q) => q.eq("roundId", round._id))
          .collect()
      ).length;
      markCorrections += (
        await ctx.db
          .query("markCorrections")
          .withIndex("by_round", (q) => q.eq("roundId", round._id))
          .collect()
      ).length;
      deckCaptainCheckins += (
        await ctx.db
          .query("deckCaptainCheckins")
          .withIndex("by_round_entry", (q) => q.eq("roundId", round._id))
          .collect()
      ).length;
    }
  }

  add("entries", entryIds.size);
  add("rounds", rounds);
  add("heats", heats);
  add("heat assignments", heatAssignments);
  add("callback marks", callbackMarks);
  add("final marks", finalMarks);
  add("judge submissions", judgeSubmissions);
  add("callback results", callbackResults);
  add("final results", finalResults);
  add("tabulation tables", tabulationTables);
  add("round result metadata", roundResultsMeta);
  add("active rounds", activeRounds);
  add("mark corrections", markCorrections);
  add("deck check-ins", deckCaptainCheckins);

  const judgeSessions = await ctx.db
    .query("judgeSessions")
    .withIndex("by_competition_judge", (q) =>
      q.eq("competitionId", competitionId),
    )
    .collect();
  add("judge sessions", judgeSessions.length);

  const tbaListings = await ctx.db
    .query("tbaListings")
    .withIndex("by_competition_fulfilled", (q) =>
      q.eq("competitionId", competitionId),
    )
    .collect();
  add("TBA listings", tbaListings.length);

  const teamMatchSubmissions = await ctx.db
    .query("teamMatchSubmissions")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  add("team match submissions", teamMatchSubmissions.length);

  const addDropRequests = await ctx.db
    .query("addDropRequests")
    .withIndex("by_competition_status", (q) =>
      q.eq("competitionId", competitionId),
    )
    .collect();
  add("add/drop requests", addDropRequests.length);

  const announcementNotes = await ctx.db
    .query("announcementNotes")
    .withIndex("by_competition_day", (q) =>
      q.eq("competitionId", competitionId),
    )
    .collect();
  add("announcement notes", announcementNotes.length);

  const feedbackForms = await ctx.db
    .query("feedbackForms")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  add("feedback forms", feedbackForms.length);

  let feedbackResponses = 0;
  for (const form of feedbackForms) {
    feedbackResponses += (
      await ctx.db
        .query("feedbackResponses")
        .withIndex("by_form_user", (q) => q.eq("formId", form._id))
        .collect()
    ).length;
  }
  add("feedback responses", feedbackResponses);

  const recordRemovalRequests = await ctx.db
    .query("recordRemovalRequests")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  add("record-removal requests", recordRemovalRequests.length);

  return blockers;
}

async function deleteCompetitionSetupRows(
  ctx: MutationCtx,
  competitionId: Id<"competitions">,
): Promise<void> {
  const days = await ctx.db
    .query("competitionDays")
    .withIndex("by_competition_position", (q) =>
      q.eq("competitionId", competitionId),
    )
    .collect();
  for (const day of days) {
    const blocks = await ctx.db
      .query("scheduleBlocks")
      .withIndex("by_day_position", (q) => q.eq("dayId", day._id))
      .collect();
    for (const block of blocks) await ctx.db.delete(block._id);
    await ctx.db.delete(day._id);
  }

  const events = await ctx.db
    .query("competitionEvents")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  for (const event of events) {
    const dances = await ctx.db
      .query("eventDances")
      .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
      .collect();
    for (const dance of dances) await ctx.db.delete(dance._id);

    const overrides = await ctx.db
      .query("eventTimeOverrides")
      .withIndex("by_event", (q) => q.eq("eventId", event._id))
      .collect();
    for (const override of overrides) await ctx.db.delete(override._id);

    await ctx.db.delete(event._id);
  }

  const competitionJudges = await ctx.db
    .query("competitionJudges")
    .withIndex("by_competition_judge", (q) =>
      q.eq("competitionId", competitionId),
    )
    .collect();
  for (const judge of competitionJudges) await ctx.db.delete(judge._id);

  const staffRows = await ctx.db
    .query("competitionStaff")
    .withIndex("by_competition_user_role", (q) =>
      q.eq("competitionId", competitionId),
    )
    .collect();
  for (const staff of staffRows) await ctx.db.delete(staff._id);

  const tiers = await ctx.db
    .query("pricingTiers")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  for (const tier of tiers) await ctx.db.delete(tier._id);
}

// ── Queries ─────────────────────────────────────────────────────────

/**
 * Public competition profile by slug. Returns `null` for an unknown slug so
 * the competition page can render not-found without an error boundary.
 * Joins the parent org for header rendering.
 */
export const getBySlug = query({
  args: {
    slug: v.string(),
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const comp = await ctx.db
      .query("competitions")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
    if (!comp) return null;
    if (!(await visibleOnPublicSurfaces(ctx, comp, args.includeArchived))) {
      return null;
    }
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
    includeArchived: v.optional(v.boolean()),
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
    const visible = [] as Doc<"competitions">[];
    for (const competition of result.page) {
      if (
        await visibleOnPublicSurfaces(
          ctx,
          competition,
          args.includeArchived,
        )
      ) {
        visible.push(competition);
      }
    }

    const enriched = await Promise.all(
      visible.map(async (c) => {
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
      competition.status !== "archived" &&
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
 * Archive a competition so public list/detail/calendar surfaces no longer show
 * it while organizer dashboard URLs can still manage the retained records.
 */
export const archive = mutation({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    await ctx.db.patch(args.competitionId, {
      status: "archived",
      updatedAt: Date.now(),
    });
    return await ctx.db.get(args.competitionId);
  },
});

/**
 * Delete a setup-only competition. Owner only. Real-world/user data blocks
 * hard deletion; organizers should archive those competitions instead.
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

    const blockers = await competitionDeletionBlockers(ctx, args.competitionId);
    if (blockers.length > 0) {
      throw new ConvexError({
        code: "CONFLICT",
        message:
          "Cannot hard-delete a competition with user data. " +
          `Archive it instead. Blocking records: ${blockers.join(", ")}.`,
      });
    }

    await deleteCompetitionSetupRows(ctx, args.competitionId);
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

import { v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser } from "../lib/auth";
import { badRequest, notFound } from "../lib/errors";
import { requireOrgRole } from "../lib/permissions";
import { addDropType } from "../schema";

/**
 * Org-scoped views into a competition (schedule of org's entries, finance
 * summary per registration, results filtered to the org, and org-side add/drop
 * submissions). Ported from `src/domains/competitions/routers/org-competition.ts`.
 */

async function requireOrgMembership(
  ctx: QueryCtx | MutationCtx,
  orgId: Id<"organizations">,
) {
  // requireOrgRole defaults to `member` which accepts owners/admins/members.
  const { org, user } = await requireOrgRole(ctx, orgId);
  return { org, user };
}

export const getOrgSchedule = query({
  args: {
    competitionId: v.id("competitions"),
    orgId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await requireOrgMembership(ctx, args.orgId);
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) notFound("Competition not found");

    const orgRegs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_org", (q) =>
        q.eq("competitionId", args.competitionId).eq("orgId", args.orgId),
      )
      .collect();
    const activeRegs = orgRegs.filter((r) => !r.cancelled);
    const regIdSet = new Set(activeRegs.map((r) => r._id));

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    events.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const allEntries: Doc<"entries">[] = [];
    for (const event of events) {
      const es = await ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      allEntries.push(...es.filter((e) => !e.scratched));
    }

    const orgEntriesByEvent = new Map<
      Id<"competitionEvents">,
      Doc<"entries">[]
    >();
    for (const e of allEntries) {
      if (
        !regIdSet.has(e.leaderRegistrationId) &&
        !regIdSet.has(e.followerRegistrationId)
      ) {
        continue;
      }
      const arr = orgEntriesByEvent.get(e.eventId) ?? [];
      arr.push(e);
      orgEntriesByEvent.set(e.eventId, arr);
    }

    const orgEvents = [];
    for (const event of events) {
      const orgEntries = orgEntriesByEvent.get(event._id);
      if (!orgEntries || orgEntries.length === 0) continue;
      const couples = await Promise.all(
        orgEntries.map(async (entry) => {
          const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
          const followerReg = await ctx.db.get(entry.followerRegistrationId);
          const leader = leaderReg ? await ctx.db.get(leaderReg.userId) : null;
          const follower = followerReg
            ? await ctx.db.get(followerReg.userId)
            : null;
          return {
            entryId: entry._id,
            coupleNumber:
              leaderReg?.competitorNumber ??
              followerReg?.competitorNumber ??
              null,
            leaderName: leader?.displayName ?? null,
            followerName: follower?.displayName ?? null,
          };
        }),
      );
      orgEvents.push({
        eventId: event._id,
        eventName: event.name,
        sessionId: event.sessionId,
        position: event.position,
        couples,
      });
    }

    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    days.sort((a, b) => a.position - b.position);

    return {
      competitionName: comp.name,
      events: orgEvents,
      days,
    };
  },
});

export const getOrgEntries = query({
  args: {
    competitionId: v.id("competitions"),
    orgId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await requireOrgMembership(ctx, args.orgId);
    const orgRegs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_org", (q) =>
        q.eq("competitionId", args.competitionId).eq("orgId", args.orgId),
      )
      .collect();
    const activeRegs = orgRegs.filter((r) => !r.cancelled);
    if (activeRegs.length === 0) return [];

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const eventMap = new Map(events.map((e) => [e._id, e]));

    const enriched = [];
    for (const reg of activeRegs) {
      const user = await ctx.db.get(reg.userId);
      const leaderEntries = await ctx.db
        .query("entries")
        .withIndex("by_leader", (q) => q.eq("leaderRegistrationId", reg._id))
        .collect();
      const followerEntries = await ctx.db
        .query("entries")
        .withIndex("by_follower", (q) =>
          q.eq("followerRegistrationId", reg._id),
        )
        .collect();
      const regEntries = [...leaderEntries, ...followerEntries].filter(
        (e) => !e.scratched,
      );
      const eventNames = regEntries.map(
        (e) => eventMap.get(e.eventId)?.name ?? "Unknown",
      );
      const regPayments = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      const totalPaid = regPayments.reduce((s, p) => s + p.amount, 0);
      enriched.push({
        registrationId: reg._id,
        userId: reg.userId,
        displayName: user?.displayName ?? null,
        competitorNumber: reg.competitorNumber,
        checkedIn: reg.checkedIn,
        amountOwed: reg.amountOwed,
        totalPaid,
        eventCount: regEntries.length,
        eventNames,
      });
    }
    return enriched;
  },
});

export const getOrgResults = query({
  args: {
    competitionId: v.id("competitions"),
    orgId: v.id("organizations"),
  },
  handler: async (ctx, args) => {
    await requireOrgMembership(ctx, args.orgId);
    const orgRegs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_org", (q) =>
        q.eq("competitionId", args.competitionId).eq("orgId", args.orgId),
      )
      .collect();
    const activeRegs = orgRegs.filter((r) => !r.cancelled);
    if (activeRegs.length === 0) return [];
    const regIdSet = new Set(activeRegs.map((r) => r._id));

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    events.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const eventResults: Array<{
      eventId: Id<"competitionEvents">;
      eventName: string;
      results: Array<{
        placement: number;
        coupleNumber: number | null;
        leaderName: string | null;
        followerName: string | null;
      }>;
    }> = [];

    for (const event of events) {
      const eventRounds = await ctx.db
        .query("rounds")
        .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
        .collect();
      eventRounds.sort((a, b) => b.position - a.position);

      let publishedRound: Doc<"rounds"> | null = null;
      for (const r of eventRounds) {
        const meta = await ctx.db
          .query("roundResultsMeta")
          .withIndex("by_round", (q) => q.eq("roundId", r._id))
          .unique();
        if (meta && meta.status === "published") {
          publishedRound = r;
          break;
        }
      }
      if (!publishedRound) continue;

      const results = await ctx.db
        .query("finalResults")
        .withIndex("by_round_placement", (q) =>
          q.eq("roundId", publishedRound._id),
        )
        .collect();
      results.sort((a, b) => a.placement - b.placement);

      const overall = results.filter((r) => r.danceName === undefined);
      const baseResults = overall.length > 0 ? overall : [];

      const orgPlacements = [];
      for (const r of baseResults) {
        const entry = await ctx.db.get(r.entryId);
        if (!entry) continue;
        const isOrgEntry =
          regIdSet.has(entry.leaderRegistrationId) ||
          regIdSet.has(entry.followerRegistrationId);
        if (!isOrgEntry) continue;
        const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
        const followerReg = await ctx.db.get(entry.followerRegistrationId);
        const leader = leaderReg ? await ctx.db.get(leaderReg.userId) : null;
        const follower = followerReg
          ? await ctx.db.get(followerReg.userId)
          : null;
        orgPlacements.push({
          placement: r.placement,
          coupleNumber:
            leaderReg?.competitorNumber ??
            followerReg?.competitorNumber ??
            null,
          leaderName: leader?.displayName ?? null,
          followerName: follower?.displayName ?? null,
        });
      }

      if (orgPlacements.length > 0) {
        eventResults.push({
          eventId: event._id,
          eventName: event.name,
          results: orgPlacements,
        });
      }
    }
    return eventResults;
  },
});

export const submitAddDrop = mutation({
  args: {
    competitionId: v.id("competitions"),
    orgId: v.id("organizations"),
    type: addDropType,
    eventId: v.id("competitionEvents"),
    leaderRegistrationId: v.id("competitionRegistrations"),
    followerRegistrationId: v.id("competitionRegistrations"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    await requireOrgRole(ctx, args.orgId, "admin");

    const leaderReg = await ctx.db.get(args.leaderRegistrationId);
    const followerReg = await ctx.db.get(args.followerRegistrationId);
    const isOrgMember =
      leaderReg?.orgId === args.orgId || followerReg?.orgId === args.orgId;
    if (!isOrgMember) {
      badRequest("At least one partner must be a member of this organization");
    }

    const id = await ctx.db.insert("addDropRequests", {
      competitionId: args.competitionId,
      submittedBy: user._id,
      type: args.type,
      eventId: args.eventId,
      leaderRegistrationId: args.leaderRegistrationId,
      followerRegistrationId: args.followerRegistrationId,
      reason: args.reason,
      status: "pending",
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});


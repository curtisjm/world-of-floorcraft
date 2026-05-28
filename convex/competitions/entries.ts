import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { getCurrentUser } from "../lib/auth";
import { notFound } from "../lib/errors";
import { requireCompStaffRole } from "../lib/permissions";

/**
 * Entries — couples placed into a competition event. Ported from
 * `src/domains/competitions/routers/entry.ts` for Task 9 of the Convex
 * migration. Per-event pricing recalculates `amountOwed` on each entry
 * insert/delete using the helper below.
 */

async function recalcAmountOwed(
  ctx: MutationCtx,
  registrationId: Id<"competitionRegistrations">,
): Promise<void> {
  const reg = await ctx.db.get(registrationId);
  if (!reg) return;
  const comp = await ctx.db.get(reg.competitionId);
  if (!comp || comp.pricingModel !== "per_event") return;

  const leaderEntries = await ctx.db
    .query("entries")
    .withIndex("by_leader", (q) => q.eq("leaderRegistrationId", registrationId))
    .collect();
  const followerEntries = await ctx.db
    .query("entries")
    .withIndex("by_follower", (q) =>
      q.eq("followerRegistrationId", registrationId),
    )
    .collect();
  const seen = new Set<Id<"entries">>();
  let entryTotal = 0;
  for (const e of [...leaderEntries, ...followerEntries]) {
    if (e.scratched) continue;
    if (seen.has(e._id)) continue;
    seen.add(e._id);
    const event = await ctx.db.get(e.eventId);
    if (!event) continue;
    entryTotal += event.entryPrice ?? 0;
  }
  const baseFee = comp.baseFee ?? 0;
  await ctx.db.patch(registrationId, { amountOwed: baseFee + entryTotal });
}

// ── Queries ─────────────────────────────────────────────────────────

export const listByEvent = query({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const entries = await ctx.db
      .query("entries")
      .withIndex("by_event", (q) => q.eq("eventId", args.eventId))
      .collect();
    const enriched = await Promise.all(
      entries.map(async (entry) => {
        const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
        const followerReg = await ctx.db.get(entry.followerRegistrationId);
        const leaderUser = leaderReg
          ? await ctx.db.get(leaderReg.userId)
          : null;
        const followerUser = followerReg
          ? await ctx.db.get(followerReg.userId)
          : null;
        const leaderOrg = leaderReg?.orgId
          ? await ctx.db.get(leaderReg.orgId)
          : null;
        return {
          _id: entry._id,
          eventId: entry.eventId,
          scratched: entry.scratched,
          leaderRegistrationId: entry.leaderRegistrationId,
          followerRegistrationId: entry.followerRegistrationId,
          leaderNumber: leaderReg?.competitorNumber ?? null,
          leaderName: leaderUser?.displayName ?? null,
          followerName: followerUser?.displayName ?? null,
          leaderOrgName: leaderOrg?.name ?? null,
        };
      }),
    );
    enriched.sort(
      (a, b) => (a.leaderNumber ?? Infinity) - (b.leaderNumber ?? Infinity),
    );
    return enriched;
  },
});

export const listByRegistration = query({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    if (reg.userId !== user._id) {
      await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);
    }
    const leaderEntries = await ctx.db
      .query("entries")
      .withIndex("by_leader", (q) =>
        q.eq("leaderRegistrationId", args.registrationId),
      )
      .collect();
    const followerEntries = await ctx.db
      .query("entries")
      .withIndex("by_follower", (q) =>
        q.eq("followerRegistrationId", args.registrationId),
      )
      .collect();
    const seen = new Set<Id<"entries">>();
    const all = [...leaderEntries, ...followerEntries].filter((e) => {
      if (seen.has(e._id)) return false;
      seen.add(e._id);
      return true;
    });
    const enriched = await Promise.all(
      all.map(async (entry) => {
        const event = await ctx.db.get(entry.eventId);
        return {
          _id: entry._id,
          eventId: entry.eventId,
          eventName: event?.name ?? null,
          eventStyle: event?.style ?? null,
          eventLevel: event?.level ?? null,
          eventPosition: event?.position ?? 0,
          scratched: entry.scratched,
          leaderRegistrationId: entry.leaderRegistrationId,
          followerRegistrationId: entry.followerRegistrationId,
        };
      }),
    );
    enriched.sort(
      (a, b) => (a.eventPosition ?? 0) - (b.eventPosition ?? 0),
    );
    return enriched;
  },
});

export const listByCompetition = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    events.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    return await Promise.all(
      events.map(async (event) => {
        const eventEntries = await ctx.db
          .query("entries")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();
        const enriched = await Promise.all(
          eventEntries.map(async (entry) => {
            const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
            const followerReg = await ctx.db.get(entry.followerRegistrationId);
            const leaderUser = leaderReg
              ? await ctx.db.get(leaderReg.userId)
              : null;
            const followerUser = followerReg
              ? await ctx.db.get(followerReg.userId)
              : null;
            return {
              _id: entry._id,
              eventId: entry.eventId,
              scratched: entry.scratched,
              leaderRegistrationId: entry.leaderRegistrationId,
              followerRegistrationId: entry.followerRegistrationId,
              leaderNumber: leaderReg?.competitorNumber ?? null,
              leaderName: leaderUser?.displayName ?? null,
              followerName: followerUser?.displayName ?? null,
            };
          }),
        );
        return { ...event, entries: enriched };
      }),
    );
  },
});

// ── Mutations ───────────────────────────────────────────────────────

export const create = mutation({
  args: {
    eventId: v.id("competitionEvents"),
    leaderRegistrationId: v.id("competitionRegistrations"),
    followerRegistrationId: v.id("competitionRegistrations"),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const event = await ctx.db.get(args.eventId);
    if (!event) notFound("Event not found");
    const comp = await ctx.db.get(event.competitionId);
    if (!comp) notFound("Competition not found");
    if (comp.status !== "accepting_entries") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Competition is not accepting entries",
      });
    }

    const leaderReg = await ctx.db.get(args.leaderRegistrationId);
    const followerReg = await ctx.db.get(args.followerRegistrationId);
    if (
      !leaderReg ||
      !followerReg ||
      leaderReg.competitionId !== event.competitionId ||
      followerReg.competitionId !== event.competitionId
    ) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Both registrations must belong to this competition",
      });
    }
    if (leaderReg.userId === followerReg.userId) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Leader and follower cannot be the same person",
      });
    }

    const isParticipant =
      leaderReg.userId === user._id || followerReg.userId === user._id;
    if (!isParticipant) {
      await requireCompStaffRole(ctx, event.competitionId, ["registration"]);
    }

    const existing = await ctx.db
      .query("entries")
      .withIndex("by_event_couple", (q) =>
        q
          .eq("eventId", args.eventId)
          .eq("leaderRegistrationId", args.leaderRegistrationId)
          .eq("followerRegistrationId", args.followerRegistrationId),
      )
      .unique();
    if (existing) {
      throw new ConvexError({
        code: "CONFLICT",
        message: "Entry already exists",
      });
    }

    const id = await ctx.db.insert("entries", {
      competitionId: event.competitionId,
      eventId: args.eventId,
      leaderRegistrationId: args.leaderRegistrationId,
      followerRegistrationId: args.followerRegistrationId,
      createdAt: Date.now(),
      createdBy: user._id,
      scratched: false,
    });
    if (comp.pricingModel === "per_event") {
      await recalcAmountOwed(ctx, args.leaderRegistrationId);
      await recalcAmountOwed(ctx, args.followerRegistrationId);
    }
    return await ctx.db.get(id);
  },
});

export const remove = mutation({
  args: { entryId: v.id("entries") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const entry = await ctx.db.get(args.entryId);
    if (!entry) notFound("Entry not found");
    const event = await ctx.db.get(entry.eventId);
    if (!event) notFound("Event not found");

    const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
    const followerReg = await ctx.db.get(entry.followerRegistrationId);
    const isParticipant =
      leaderReg?.userId === user._id || followerReg?.userId === user._id;
    if (!isParticipant) {
      await requireCompStaffRole(ctx, event.competitionId, ["registration"]);
    }

    await ctx.db.delete(args.entryId);
    const comp = await ctx.db.get(event.competitionId);
    if (comp?.pricingModel === "per_event") {
      await recalcAmountOwed(ctx, entry.leaderRegistrationId);
      await recalcAmountOwed(ctx, entry.followerRegistrationId);
    }
    return { success: true };
  },
});

/**
 * Toggle the `scratched` flag on an entry. Deck-captain only — exposed here
 * because the dashboard registration list shares this surface. Live/scoring
 * (Task 10) re-uses the same mutation.
 */
export const scratch = mutation({
  args: { entryId: v.id("entries") },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.entryId);
    if (!entry) notFound("Entry not found");
    const event = await ctx.db.get(entry.eventId);
    if (!event) notFound("Event not found");
    await requireCompStaffRole(ctx, event.competitionId, ["deck_captain"]);
    await ctx.db.patch(args.entryId, { scratched: !entry.scratched });
    return await ctx.db.get(args.entryId);
  },
});

/**
 * Bulk-create entries from the register page. Validates competition state
 * once, registrations once, then inserts skipping pre-existing pairs. Per-
 * event pricing recalculates once per affected registration at the end.
 */
export const bulkCreate = mutation({
  args: {
    entries: v.array(
      v.object({
        eventId: v.id("competitionEvents"),
        leaderRegistrationId: v.id("competitionRegistrations"),
        followerRegistrationId: v.id("competitionRegistrations"),
      }),
    ),
  },
  handler: async (ctx, args) => {
    if (args.entries.length === 0) {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "No entries provided",
      });
    }
    const user = await getCurrentUser(ctx);
    const eventIds = new Set<Id<"competitionEvents">>();
    for (const e of args.entries) eventIds.add(e.eventId);

    const eventMap = new Map<
      Id<"competitionEvents">,
      Doc<"competitionEvents">
    >();
    let competitionId: Id<"competitions"> | null = null;
    for (const eventId of eventIds) {
      const event = await ctx.db.get(eventId);
      if (!event) notFound("Event not found");
      if (competitionId === null) {
        competitionId = event.competitionId;
      } else if (event.competitionId !== competitionId) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "All events must belong to the same competition",
        });
      }
      eventMap.set(eventId, event);
    }

    const comp = await ctx.db.get(competitionId!);
    if (!comp) notFound("Competition not found");
    if (comp.status !== "accepting_entries") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Competition is not accepting entries",
      });
    }

    const regIds = new Set<Id<"competitionRegistrations">>();
    for (const e of args.entries) {
      if (!eventMap.has(e.eventId)) notFound("Event not found");
      regIds.add(e.leaderRegistrationId);
      regIds.add(e.followerRegistrationId);
    }
    const regMap = new Map<
      Id<"competitionRegistrations">,
      Doc<"competitionRegistrations">
    >();
    for (const regId of regIds) {
      const reg = await ctx.db.get(regId);
      if (!reg || reg.competitionId !== comp._id) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: `Registration ${regId} does not belong to this competition`,
        });
      }
      regMap.set(regId, reg);
    }

    let staffChecked = false;
    for (const e of args.entries) {
      const leaderReg = regMap.get(e.leaderRegistrationId)!;
      const followerReg = regMap.get(e.followerRegistrationId)!;
      if (leaderReg.userId === followerReg.userId) {
        throw new ConvexError({
          code: "BAD_REQUEST",
          message: "Leader and follower cannot be the same person",
        });
      }
      const isParticipant =
        leaderReg.userId === user._id || followerReg.userId === user._id;
      if (!isParticipant && !staffChecked) {
        await requireCompStaffRole(ctx, comp._id, ["registration"]);
        staffChecked = true;
      }
    }

    const created: Doc<"entries">[] = [];
    const recalcRegIds = new Set<Id<"competitionRegistrations">>();
    for (const e of args.entries) {
      const existing = await ctx.db
        .query("entries")
        .withIndex("by_event_couple", (q) =>
          q
            .eq("eventId", e.eventId)
            .eq("leaderRegistrationId", e.leaderRegistrationId)
            .eq("followerRegistrationId", e.followerRegistrationId),
        )
        .unique();
      if (existing) {
        created.push(existing);
        continue;
      }
      const id = await ctx.db.insert("entries", {
        competitionId: comp._id,
        eventId: e.eventId,
        leaderRegistrationId: e.leaderRegistrationId,
        followerRegistrationId: e.followerRegistrationId,
        createdAt: Date.now(),
        createdBy: user._id,
        scratched: false,
      });
      const inserted = await ctx.db.get(id);
      if (inserted) created.push(inserted);
      recalcRegIds.add(e.leaderRegistrationId);
      recalcRegIds.add(e.followerRegistrationId);
    }

    if (comp.pricingModel === "per_event") {
      for (const regId of recalcRegIds) {
        await recalcAmountOwed(ctx, regId);
      }
    }
    return created;
  },
});

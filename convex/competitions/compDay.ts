import { ConvexError, v } from "convex/values";
import {
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { badRequest, notFound } from "../lib/errors";
import { requireCompStaffRole } from "../lib/permissions";
import { dollarsToCents } from "../lib/money";
import { announcementNoteType, paymentMethod } from "../schema";
import { applyApprovedAddDropRequest } from "./integrity";

/**
 * Competition-day workflows for the emcee, deck-captain, and registration
 * staff roles. Combines `emcee.ts`, `deck-captain.ts`, and
 * `registration-table.ts` from the tRPC routers. Replaces every Ably
 * `publishToLive(...)` call with Convex's natural reactivity — clients reading
 * the same records via `useQuery` re-render automatically when these
 * mutations write.
 */

// ── Emcee view + notes ──────────────────────────────────────────────

export const getEmceeView = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["emcee"]);

    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    days.sort((a, b) => a.position - b.position);

    const blocks: Doc<"scheduleBlocks">[] = [];
    for (const day of days) {
      const dayBlocks = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_day_position", (q) => q.eq("dayId", day._id))
        .collect();
      blocks.push(...dayBlocks);
    }
    blocks.sort((a, b) => a.position - b.position);

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    events.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const actives = await ctx.db
      .query("activeRounds")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const active = actives.find((a) => a.endedAt === undefined) ?? null;

    let currentEvent: {
      eventId?: Id<"competitionEvents">;
      eventName?: string;
      roundType?: Doc<"rounds">["roundType"];
      roundId?: Id<"rounds">;
    } | null = null;
    if (active) {
      const round = await ctx.db.get(active.roundId);
      if (round) {
        const event = await ctx.db.get(round.eventId);
        currentEvent = {
          eventId: event?._id,
          eventName: event?.name,
          roundType: round.roundType,
          roundId: round._id,
        };
      }
    }

    const notes = await ctx.db
      .query("announcementNotes")
      .withIndex("by_competition_day", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    notes.sort((a, b) => a.createdAt - b.createdAt);

    return { days, blocks, events, currentEvent, notes };
  },
});

export const getEventResultsForEmcee = query({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) notFound("Event not found");
    await requireCompStaffRole(ctx, event.competitionId, ["emcee"]);

    const eventRounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_position", (q) => q.eq("eventId", args.eventId))
      .collect();
    const finalRound = eventRounds.find((r) => r.roundType === "final");
    if (!finalRound) return { results: [], eventName: event.name };

    const meta = await ctx.db
      .query("roundResultsMeta")
      .withIndex("by_round", (q) => q.eq("roundId", finalRound._id))
      .unique();
    if (!meta || meta.status !== "published") {
      return {
        results: [],
        eventName: event.name,
        status: meta?.status ?? "none",
      };
    }

    const all = await ctx.db
      .query("finalResults")
      .withIndex("by_round_placement", (q) =>
        q.eq("roundId", finalRound._id),
      )
      .collect();
    all.sort((a, b) => a.placement - b.placement);
    const overall = all.filter((r) => r.danceName === undefined);
    const actual = overall.length > 0 ? overall : all;

    const enriched = await Promise.all(
      actual.map(async (r) => {
        const entry = await ctx.db.get(r.entryId);
        if (!entry) {
          return {
            ...r,
            coupleNumber: null,
            leaderName: "Unknown",
            followerName: "Unknown",
          };
        }
        const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
        const followerReg = await ctx.db.get(entry.followerRegistrationId);
        const leader = leaderReg ? await ctx.db.get(leaderReg.userId) : null;
        const follower = followerReg
          ? await ctx.db.get(followerReg.userId)
          : null;
        return {
          ...r,
          coupleNumber:
            leaderReg?.competitorNumber ?? followerReg?.competitorNumber,
          leaderName: leader?.displayName ?? "Unknown",
          followerName: follower?.displayName ?? "Unknown",
        };
      }),
    );

    return { results: enriched, eventName: event.name, status: "published" };
  },
});

export const createNote = mutation({
  args: {
    competitionId: v.id("competitions"),
    dayId: v.id("competitionDays"),
    positionAfterEventId: v.optional(v.id("competitionEvents")),
    content: v.string(),
    type: v.optional(announcementNoteType),
    visibleOnProjector: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { user } = await requireCompStaffRole(ctx, args.competitionId, [
      "emcee",
    ]);
    if (args.content.trim().length === 0) badRequest("Content is required");

    const now = Date.now();
    const id = await ctx.db.insert("announcementNotes", {
      competitionId: args.competitionId,
      dayId: args.dayId,
      positionAfterEventId: args.positionAfterEventId,
      content: args.content,
      type: args.type ?? "text",
      createdBy: user._id,
      visibleOnProjector: args.visibleOnProjector ?? true,
      createdAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(id);
  },
});

export const updateNote = mutation({
  args: {
    noteId: v.id("announcementNotes"),
    content: v.optional(v.string()),
    visibleOnProjector: v.optional(v.boolean()),
    positionAfterEventId: v.optional(
      v.union(v.id("competitionEvents"), v.null()),
    ),
  },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) notFound("Note not found");
    await requireCompStaffRole(ctx, note.competitionId, ["emcee"]);

    const patch: Partial<Doc<"announcementNotes">> = { updatedAt: Date.now() };
    if (args.content !== undefined) {
      if (args.content.trim().length === 0) badRequest("Content is required");
      patch.content = args.content;
    }
    if (args.visibleOnProjector !== undefined) {
      patch.visibleOnProjector = args.visibleOnProjector;
    }
    if (args.positionAfterEventId !== undefined) {
      patch.positionAfterEventId = args.positionAfterEventId ?? undefined;
    }
    await ctx.db.patch(args.noteId, patch);
    return await ctx.db.get(args.noteId);
  },
});

export const deleteNote = mutation({
  args: { noteId: v.id("announcementNotes") },
  handler: async (ctx, args) => {
    const note = await ctx.db.get(args.noteId);
    if (!note) notFound("Note not found");
    await requireCompStaffRole(ctx, note.competitionId, ["emcee"]);
    await ctx.db.delete(args.noteId);
    return { deleted: true };
  },
});

// ── Deck captain ────────────────────────────────────────────────────

async function computeStayOnFloor(
  ctx: QueryCtx | MutationCtx,
  competitionId: Id<"competitions">,
  currentEventId: Id<"competitionEvents">,
  currentEntries: Array<{
    entryId: Id<"entries">;
    leaderRegId: Id<"competitionRegistrations">;
    followerRegId: Id<"competitionRegistrations">;
  }>,
): Promise<Set<Id<"entries">>> {
  const stay = new Set<Id<"entries">>();
  const currentEvent = await ctx.db.get(currentEventId);
  if (!currentEvent?.sessionId) return stay;

  const sessionEvents = await ctx.db
    .query("competitionEvents")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  const inSession = sessionEvents
    .filter((e) => e.sessionId === currentEvent.sessionId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

  const currentIdx = inSession.findIndex((e) => e._id === currentEventId);
  if (currentIdx === -1 || currentIdx >= inSession.length - 1) return stay;

  const nextEvent = inSession[currentIdx + 1]!;
  const nextEntries = await ctx.db
    .query("entries")
    .withIndex("by_event", (q) => q.eq("eventId", nextEvent._id))
    .collect();
  const active = nextEntries.filter((e) => !e.scratched);
  const nextRegs = new Set<Id<"competitionRegistrations">>();
  for (const e of active) {
    nextRegs.add(e.leaderRegistrationId);
    nextRegs.add(e.followerRegistrationId);
  }
  for (const entry of currentEntries) {
    if (nextRegs.has(entry.leaderRegId) || nextRegs.has(entry.followerRegId)) {
      stay.add(entry.entryId);
    }
  }
  return stay;
}

export const getCheckinView = query({
  args: {
    competitionId: v.id("competitions"),
    roundId: v.optional(v.id("rounds")),
  },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["deck_captain"]);

    let roundId = args.roundId;
    if (!roundId) {
      const actives = await ctx.db
        .query("activeRounds")
        .withIndex("by_competition", (q) =>
          q.eq("competitionId", args.competitionId),
        )
        .collect();
      const active = actives.find((a) => a.endedAt === undefined);
      if (!active) {
        return {
          roundId: null,
          eventName: null,
          roundType: null,
          entries: [],
        };
      }
      roundId = active.roundId;
    }
    const round = await ctx.db.get(roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);

    const allEntries = await ctx.db
      .query("entries")
      .withIndex("by_event", (q) => q.eq("eventId", round.eventId))
      .collect();
    const active = allEntries.filter((e) => !e.scratched);

    const regIds = new Set<Id<"competitionRegistrations">>();
    for (const e of active) {
      regIds.add(e.leaderRegistrationId);
      regIds.add(e.followerRegistrationId);
    }
    const regDetails = new Map<
      Id<"competitionRegistrations">,
      {
        competitorNumber: number | undefined;
        displayName: string | undefined;
      }
    >();
    for (const regId of regIds) {
      const reg = await ctx.db.get(regId);
      if (!reg) continue;
      const user = await ctx.db.get(reg.userId);
      regDetails.set(regId, {
        competitorNumber: reg.competitorNumber,
        displayName: user?.displayName,
      });
    }

    const checkins = await ctx.db
      .query("deckCaptainCheckins")
      .withIndex("by_round_entry", (q) => q.eq("roundId", roundId))
      .collect();
    const checkinMap = new Map(checkins.map((c) => [c.entryId, c]));

    const stayOnFloorSet = await computeStayOnFloor(
      ctx,
      args.competitionId,
      round.eventId,
      active.map((e) => ({
        entryId: e._id,
        leaderRegId: e.leaderRegistrationId,
        followerRegId: e.followerRegistrationId,
      })),
    );

    const result = active.map((e) => {
      const leader = regDetails.get(e.leaderRegistrationId);
      const follower = regDetails.get(e.followerRegistrationId);
      const checkin = checkinMap.get(e._id);
      return {
        entryId: e._id,
        coupleNumber:
          leader?.competitorNumber ?? follower?.competitorNumber ?? null,
        leaderName: leader?.displayName ?? "Unknown",
        followerName: follower?.displayName ?? "Unknown",
        status: checkin?.status ?? "not_checked_in",
        stayOnFloor: stayOnFloorSet.has(e._id),
      };
    });
    result.sort((a, b) => (a.coupleNumber ?? 999) - (b.coupleNumber ?? 999));

    return {
      roundId,
      eventName: event?.name ?? "Unknown",
      roundType: round.roundType,
      entries: result,
    };
  },
});

export const getScheduleView = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["deck_captain"]);

    const days = await ctx.db
      .query("competitionDays")
      .withIndex("by_competition_position", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    days.sort((a, b) => a.position - b.position);

    const blocks: Doc<"scheduleBlocks">[] = [];
    for (const day of days) {
      const dayBlocks = await ctx.db
        .query("scheduleBlocks")
        .withIndex("by_day_position", (q) => q.eq("dayId", day._id))
        .collect();
      blocks.push(...dayBlocks);
    }
    blocks.sort((a, b) => a.position - b.position);

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    events.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

    const eventData = await Promise.all(
      events.map(async (event) => {
        const eventRounds = await ctx.db
          .query("rounds")
          .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
          .collect();
        eventRounds.sort((a, b) => a.position - b.position);
        const eventEntries = await ctx.db
          .query("entries")
          .withIndex("by_event", (q) => q.eq("eventId", event._id))
          .collect();
        return {
          ...event,
          rounds: eventRounds.map((r) => ({
            id: r._id,
            roundType: r.roundType,
            status: r.status,
          })),
          entryCount: eventEntries.filter((e) => !e.scratched).length,
        };
      }),
    );

    return { days, blocks, events: eventData };
  },
});

async function upsertDeckCheckin(
  ctx: MutationCtx,
  roundId: Id<"rounds">,
  entryId: Id<"entries">,
  status: string,
  userId: Id<"users">,
) {
  const existing = await ctx.db
    .query("deckCaptainCheckins")
    .withIndex("by_round_entry", (q) =>
      q.eq("roundId", roundId).eq("entryId", entryId),
    )
    .unique();
  if (existing) {
    await ctx.db.patch(existing._id, {
      status,
      checkedInBy: userId,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(existing._id);
  } else {
    const id = await ctx.db.insert("deckCaptainCheckins", {
      roundId,
      entryId,
      status,
      checkedInBy: userId,
      updatedAt: Date.now(),
    });
    return await ctx.db.get(id);
  }
}

export const checkinDeck = mutation({
  args: { roundId: v.id("rounds"), entryId: v.id("entries") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    const { user } = await requireCompStaffRole(ctx, event.competitionId, [
      "deck_captain",
    ]);
    await upsertDeckCheckin(ctx, args.roundId, args.entryId, "ready", user._id);
    return { status: "ready" };
  },
});

export const scratchDeck = mutation({
  args: { roundId: v.id("rounds"), entryId: v.id("entries") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    const { user } = await requireCompStaffRole(ctx, event.competitionId, [
      "deck_captain",
    ]);
    await upsertDeckCheckin(
      ctx,
      args.roundId,
      args.entryId,
      "scratched",
      user._id,
    );
    return { status: "scratched" };
  },
});

export const unscratchDeck = mutation({
  args: { roundId: v.id("rounds"), entryId: v.id("entries") },
  handler: async (ctx, args) => {
    const round = await ctx.db.get(args.roundId);
    if (!round) notFound("Round not found");
    const event = await ctx.db.get(round.eventId);
    if (!event) notFound("Event not found");
    const { user } = await requireCompStaffRole(ctx, event.competitionId, [
      "deck_captain",
    ]);
    const existing = await ctx.db
      .query("deckCaptainCheckins")
      .withIndex("by_round_entry", (q) =>
        q.eq("roundId", args.roundId).eq("entryId", args.entryId),
      )
      .unique();
    if (!existing) notFound("No check-in record to unscratch");
    await ctx.db.patch(existing._id, {
      status: "ready",
      checkedInBy: user._id,
      updatedAt: Date.now(),
    });
    return { status: "ready" };
  },
});

// ── Registration table ──────────────────────────────────────────────

export const getRegistrationTable = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["registration"]);

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const active = regs.filter((r) => !r.cancelled);

    const allEvents = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const allEntries: Doc<"entries">[] = [];
    for (const event of allEvents) {
      const es = await ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      allEntries.push(...es);
    }
    const entryCountByReg = new Map<Id<"competitionRegistrations">, number>();
    for (const e of allEntries) {
      entryCountByReg.set(
        e.leaderRegistrationId,
        (entryCountByReg.get(e.leaderRegistrationId) ?? 0) + 1,
      );
      entryCountByReg.set(
        e.followerRegistrationId,
        (entryCountByReg.get(e.followerRegistrationId) ?? 0) + 1,
      );
    }

    type EnrichedReg = {
      id: Id<"competitionRegistrations">;
      userId: Id<"users">;
      displayName: string | undefined;
      competitorNumber: number | undefined;
      amountOwed: number;
      paidConfirmed: boolean;
      checkedIn: boolean;
      orgId?: Id<"organizations">;
      orgName: string | null;
      registeredAt: number;
      totalPaid: number;
      balance: number;
      checkinDetail: Doc<"registrationCheckins"> | null;
      entryCount: number;
    };

    const enriched: EnrichedReg[] = [];
    for (const reg of active) {
      const user = await ctx.db.get(reg.userId);
      const org = reg.orgId ? await ctx.db.get(reg.orgId) : null;
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
      const checkin = (
        await ctx.db
          .query("registrationCheckins")
          .withIndex("by_registration", (q) =>
            q.eq("registrationId", reg._id),
          )
          .collect()
      )[0];
      enriched.push({
        id: reg._id,
        userId: reg.userId,
        displayName: user?.displayName,
        competitorNumber: reg.competitorNumber,
        amountOwed: reg.amountOwed,
        paidConfirmed: reg.paidConfirmed,
        checkedIn: reg.checkedIn,
        orgId: reg.orgId,
        orgName: org?.name ?? null,
        registeredAt: reg.registeredAt,
        totalPaid,
        balance: reg.amountOwed - totalPaid,
        checkinDetail: checkin ?? null,
        entryCount: entryCountByReg.get(reg._id) ?? 0,
      });
    }

    enriched.sort((a, b) => {
      const orgCmp = (a.orgName ?? "").localeCompare(b.orgName ?? "");
      if (orgCmp !== 0) return orgCmp;
      return (a.displayName ?? "").localeCompare(b.displayName ?? "");
    });

    const orgMap = new Map<
      Id<"organizations"> | null,
      { orgId: Id<"organizations"> | null; orgName: string; registrations: EnrichedReg[] }
    >();
    for (const reg of enriched) {
      const key = reg.orgId ?? null;
      if (!orgMap.has(key)) {
        orgMap.set(key, {
          orgId: key,
          orgName: reg.orgName ?? "Unaffiliated",
          registrations: [],
        });
      }
      orgMap.get(key)!.registrations.push(reg);
    }
    return [...orgMap.values()];
  },
});

export const getRegistrationDetail = query({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);

    const user = await ctx.db.get(reg.userId);
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
    const allEntries = [...leaderEntries, ...followerEntries];
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_registration", (q) =>
        q.eq("registrationId", args.registrationId),
      )
      .collect();
    payments.sort((a, b) => b.createdAt - a.createdAt);
    const checkin = (
      await ctx.db
        .query("registrationCheckins")
        .withIndex("by_registration", (q) =>
          q.eq("registrationId", args.registrationId),
        )
        .collect()
    )[0];
    const addDrops = await ctx.db
      .query("addDropRequests")
      .withIndex("by_competition_status", (q) =>
        q.eq("competitionId", reg.competitionId),
      )
      .collect();
    const myAddDrops = addDrops.filter(
      (r) =>
        r.leaderRegistrationId === args.registrationId ||
        r.followerRegistrationId === args.registrationId,
    );

    return {
      registration: reg,
      user,
      entries: allEntries,
      payments,
      checkin: checkin ?? null,
      addDropRequests: myAddDrops,
    };
  },
});

export const getPendingAddDrops = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["registration"]);
    const requests = await ctx.db
      .query("addDropRequests")
      .withIndex("by_competition_status", (q) =>
        q.eq("competitionId", args.competitionId).eq("status", "pending"),
      )
      .collect();
    requests.sort((a, b) => a.createdAt - b.createdAt);
    return {
      safe: requests.filter((r) => !r.affectsRounds),
      needsReview: requests.filter((r) => r.affectsRounds),
    };
  },
});

export const checkinRegistration = mutation({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    const { user } = await requireCompStaffRole(ctx, reg.competitionId, [
      "registration",
    ]);

    const existing = await ctx.db
      .query("registrationCheckins")
      .withIndex("by_registration", (q) =>
        q.eq("registrationId", args.registrationId),
      )
      .collect();
    if (existing.length > 0) badRequest("Already checked in");

    const id = await ctx.db.insert("registrationCheckins", {
      registrationId: args.registrationId,
      checkedInBy: user._id,
      checkedInAt: Date.now(),
    });
    await ctx.db.patch(args.registrationId, { checkedIn: true });
    return await ctx.db.get(id);
  },
});

export const undoCheckin = mutation({
  args: { registrationId: v.id("competitionRegistrations") },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    await requireCompStaffRole(ctx, reg.competitionId, ["registration"]);
    const existing = await ctx.db
      .query("registrationCheckins")
      .withIndex("by_registration", (q) =>
        q.eq("registrationId", args.registrationId),
      )
      .collect();
    for (const c of existing) await ctx.db.delete(c._id);
    await ctx.db.patch(args.registrationId, { checkedIn: false });
    return { undone: true };
  },
});

export const recordOfflinePayment = mutation({
  args: {
    registrationId: v.id("competitionRegistrations"),
    amount: v.string(),
    method: paymentMethod,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const reg = await ctx.db.get(args.registrationId);
    if (!reg) notFound("Registration not found");
    const { user } = await requireCompStaffRole(ctx, reg.competitionId, [
      "registration",
    ]);
    if (args.method === "online") {
      throw new ConvexError({
        code: "BAD_REQUEST",
        message: "Online payments are recorded by Stripe webhooks",
      });
    }
    const cents = dollarsToCents(args.amount);
    const id = await ctx.db.insert("payments", {
      competitionId: reg.competitionId,
      registrationId: args.registrationId,
      amount: cents,
      method: args.method,
      note: args.note,
      processedBy: user._id,
      createdAt: Date.now(),
    });
    return await ctx.db.get(id);
  },
});

export const approveAddDrop = mutation({
  args: { requestId: v.id("addDropRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) notFound("Request not found");
    const { user } = await requireCompStaffRole(ctx, request.competitionId, [
      "registration",
    ]);
    if (request.status !== "pending") badRequest("Request already resolved");

    await applyApprovedAddDropRequest(ctx, request, user._id);
    return await ctx.db.get(args.requestId);
  },
});

export const rejectAddDrop = mutation({
  args: {
    requestId: v.id("addDropRequests"),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId);
    if (!request) notFound("Request not found");
    const { user } = await requireCompStaffRole(ctx, request.competitionId, [
      "registration",
    ]);
    if (request.status !== "pending") badRequest("Request already resolved");
    await ctx.db.patch(args.requestId, {
      status: "rejected",
      reviewedBy: user._id,
      reviewedAt: Date.now(),
      reviewNotes: args.reason,
    });
    return await ctx.db.get(args.requestId);
  },
});


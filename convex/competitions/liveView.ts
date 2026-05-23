import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Public live-view screens — schedule, my-events, published results.
 * Replaces `live-view.ts` tRPC router. The old `getAblyToken` query is dropped
 * because Convex reactive queries replace the Ably broadcast loop.
 */

export const getSchedule = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) return null;

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

    let activeEventId: Id<"competitionEvents"> | null = null;
    if (active) {
      const round = await ctx.db.get(active.roundId);
      activeEventId = round?.eventId ?? null;
    }

    const allEntries: Doc<"entries">[] = [];
    const allRounds: Doc<"rounds">[] = [];
    for (const event of events) {
      const eventRounds = await ctx.db
        .query("rounds")
        .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
        .collect();
      allRounds.push(...eventRounds);
      const eventEntries = await ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      allEntries.push(...eventEntries.filter((e) => !e.scratched));
    }

    const roundsByEvent = new Map<Id<"competitionEvents">, Doc<"rounds">[]>();
    for (const r of allRounds) {
      const arr = roundsByEvent.get(r.eventId) ?? [];
      arr.push(r);
      roundsByEvent.set(r.eventId, arr);
    }
    const entriesByEvent = new Map<
      Id<"competitionEvents">,
      Doc<"entries">[]
    >();
    for (const e of allEntries) {
      const arr = entriesByEvent.get(e.eventId) ?? [];
      arr.push(e);
      entriesByEvent.set(e.eventId, arr);
    }

    const regIds = new Set<Id<"competitionRegistrations">>();
    for (const e of allEntries) {
      regIds.add(e.leaderRegistrationId);
      regIds.add(e.followerRegistrationId);
    }
    const regMap = new Map<
      Id<"competitionRegistrations">,
      Doc<"competitionRegistrations">
    >();
    for (const regId of regIds) {
      const reg = await ctx.db.get(regId);
      if (reg) regMap.set(regId, reg);
    }

    const eventData = events.map((event) => {
      const eventRounds = roundsByEvent.get(event._id) ?? [];
      const eventEntries = entriesByEvent.get(event._id) ?? [];

      let status: "upcoming" | "in_progress" | "completed" = "upcoming";
      if (event._id === activeEventId) {
        status = "in_progress";
      } else if (
        eventRounds.length > 0 &&
        eventRounds.every((r) => r.status === "completed")
      ) {
        status = "completed";
      } else if (eventRounds.some((r) => r.status !== "pending")) {
        status = "completed";
      }

      const coupleNumbers = [
        ...new Set(
          eventEntries
            .flatMap((e) => [e.leaderRegistrationId, e.followerRegistrationId])
            .map((id) => regMap.get(id)?.competitorNumber)
            .filter((n): n is number => n !== null && n !== undefined),
        ),
      ].sort((a, b) => a - b);

      return {
        id: event._id,
        name: event.name,
        sessionId: event.sessionId,
        position: event.position,
        status,
        coupleNumbers,
        entryCount: eventEntries.length,
      };
    });

    const notes = (
      await ctx.db
        .query("announcementNotes")
        .withIndex("by_competition_day", (q) =>
          q.eq("competitionId", args.competitionId),
        )
        .collect()
    )
      .filter((n) => n.visibleOnProjector)
      .sort((a, b) => a.createdAt - b.createdAt);

    return {
      competition: { id: comp._id, name: comp.name, slug: comp.slug },
      days,
      blocks,
      events: eventData,
      activeEventId,
      notes,
    };
  },
});

export const getMyEvents = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { myEventIds: [] as Id<"competitionEvents">[] };

    const user = await ctx.db
      .query("users")
      .withIndex("by_token_identifier", (q) =>
        q.eq("tokenIdentifier", identity.tokenIdentifier),
      )
      .unique();
    if (!user) return { myEventIds: [] as Id<"competitionEvents">[] };

    const reg = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId).eq("userId", user._id),
      )
      .unique();
    if (!reg || reg.cancelled) {
      return { myEventIds: [] as Id<"competitionEvents">[] };
    }

    const leaderEntries = await ctx.db
      .query("entries")
      .withIndex("by_leader", (q) => q.eq("leaderRegistrationId", reg._id))
      .collect();
    const followerEntries = await ctx.db
      .query("entries")
      .withIndex("by_follower", (q) => q.eq("followerRegistrationId", reg._id))
      .collect();
    const all = [...leaderEntries, ...followerEntries].filter(
      (e) => !e.scratched,
    );
    return {
      myEventIds: [...new Set(all.map((e) => e.eventId))],
    };
  },
});

export const getPublishedResults = query({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    const eventRounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_position", (q) => q.eq("eventId", args.eventId))
      .collect();
    eventRounds.sort((a, b) => a.position - b.position);

    if (eventRounds.length === 0) {
      return { eventName: event.name, rounds: [] };
    }

    const publishedRounds: Doc<"rounds">[] = [];
    for (const r of eventRounds) {
      const meta = await ctx.db
        .query("roundResultsMeta")
        .withIndex("by_round", (q) => q.eq("roundId", r._id))
        .unique();
      if (meta && meta.status === "published") {
        publishedRounds.push(r);
      }
    }
    if (publishedRounds.length === 0) {
      return { eventName: event.name, rounds: [] };
    }

    const rounds = [] as Array<{
      roundId: Id<"rounds">;
      roundType: Doc<"rounds">["roundType"];
      results: Array<
        Doc<"finalResults"> & {
          coupleNumber: number | null;
          leaderName: string | null;
          followerName: string | null;
        }
      >;
    }>;

    for (const round of publishedRounds) {
      const allResults = await ctx.db
        .query("finalResults")
        .withIndex("by_round_placement", (q) => q.eq("roundId", round._id))
        .collect();
      allResults.sort((a, b) => a.placement - b.placement);

      const overall = allResults.filter((r) => r.danceName === undefined);
      const actual = overall.length > 0 ? overall : allResults;

      const enriched = await Promise.all(
        actual.map(async (r) => {
          const entry = await ctx.db.get(r.entryId);
          if (!entry) {
            return {
              ...r,
              coupleNumber: null,
              leaderName: null,
              followerName: null,
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
              leaderReg?.competitorNumber ??
              followerReg?.competitorNumber ??
              null,
            leaderName: leader?.displayName ?? null,
            followerName: follower?.displayName ?? null,
          };
        }),
      );

      rounds.push({
        roundId: round._id,
        roundType: round.roundType,
        results: enriched,
      });
    }

    return { eventName: event.name, rounds };
  },
});

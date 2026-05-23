import { v } from "convex/values";
import { query, type QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

/**
 * Public results screens — by competition, by event, by competitor, and
 * competitor search. Ported from `src/domains/competitions/routers/results.ts`.
 *
 * Removal handling: an approved `recordRemovalRequests` row hides either a
 * specific entry (entry-level removal) or the user's entire participation in
 * a competition (user-level removal).
 */

async function getApprovedRemovals(
  ctx: QueryCtx,
  competitionId: Id<"competitions">,
) {
  const removals = await ctx.db
    .query("recordRemovalRequests")
    .withIndex("by_competition", (q) => q.eq("competitionId", competitionId))
    .collect();
  return removals.filter((r) => r.status === "approved");
}

export const getByCompetition = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) return null;
    const org = await ctx.db.get(comp.orgId);

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    events.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));

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

    const removals = await getApprovedRemovals(ctx, args.competitionId);
    const hiddenEntryIds = new Set(
      removals
        .filter((r) => r.entryId !== undefined)
        .map((r) => r.entryId as Id<"entries">),
    );
    const hiddenUserIds = new Set(
      removals
        .filter((r) => r.entryId === undefined)
        .map((r) => r.userId),
    );

    const eventResults: Array<{
      eventId: Id<"competitionEvents">;
      eventName: string;
      style: Doc<"competitionEvents">["style"];
      level: Doc<"competitionEvents">["level"];
      sessionId?: Id<"scheduleBlocks">;
      dances: string[];
      placements: Array<{
        placement: number;
        coupleNumber: number | null;
        leaderName: string | null;
        leaderUserId: Id<"users"> | null;
        followerName: string | null;
        followerUserId: Id<"users"> | null;
        organization: string | null;
      }>;
    }> = [];

    for (const event of events) {
      const dances = await ctx.db
        .query("eventDances")
        .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
        .collect();
      dances.sort((a, b) => a.position - b.position);

      const eventRounds = await ctx.db
        .query("rounds")
        .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
        .collect();
      eventRounds.sort((a, b) => b.position - a.position);

      let publishedRound: Doc<"rounds"> | null = null;
      for (const round of eventRounds) {
        const meta = await ctx.db
          .query("roundResultsMeta")
          .withIndex("by_round", (q) => q.eq("roundId", round._id))
          .unique();
        if (meta && meta.status === "published" && round.roundType === "final") {
          publishedRound = round;
          break;
        }
        if (meta && meta.status === "published" && !publishedRound) {
          publishedRound = round;
        }
      }
      if (!publishedRound) continue;

      const allResults = await ctx.db
        .query("finalResults")
        .withIndex("by_round_placement", (q) =>
          q.eq("roundId", publishedRound._id),
        )
        .collect();
      allResults.sort((a, b) => a.placement - b.placement);
      const overall = allResults.filter((r) => r.danceName === undefined);
      const baseResults = overall.length > 0 ? overall : allResults;

      const placements = (
        await Promise.all(
          baseResults.map(async (r) => {
            if (hiddenEntryIds.has(r.entryId)) return null;
            const entry = await ctx.db.get(r.entryId);
            if (!entry) return null;
            const leaderReg = await ctx.db.get(entry.leaderRegistrationId);
            const followerReg = await ctx.db.get(entry.followerRegistrationId);
            if (leaderReg && hiddenUserIds.has(leaderReg.userId)) return null;
            if (followerReg && hiddenUserIds.has(followerReg.userId))
              return null;
            const leader = leaderReg ? await ctx.db.get(leaderReg.userId) : null;
            const follower = followerReg
              ? await ctx.db.get(followerReg.userId)
              : null;
            const leaderOrg = leaderReg?.orgId
              ? await ctx.db.get(leaderReg.orgId)
              : null;
            return {
              placement: r.placement,
              coupleNumber:
                leaderReg?.competitorNumber ??
                followerReg?.competitorNumber ??
                null,
              leaderName: leader?.displayName ?? null,
              leaderUserId: leader?._id ?? null,
              followerName: follower?.displayName ?? null,
              followerUserId: follower?._id ?? null,
              organization: leaderOrg?.name ?? null,
            };
          }),
        )
      ).filter(
        (p): p is NonNullable<typeof p> => p !== null,
      );

      eventResults.push({
        eventId: event._id,
        eventName: event.name,
        style: event.style,
        level: event.level,
        sessionId: event.sessionId,
        dances: dances.map((d) => d.danceName),
        placements,
      });
    }

    return {
      competition: {
        id: comp._id,
        name: comp.name,
        slug: comp.slug,
        organization: org?.name ?? null,
      },
      days,
      blocks,
      events: eventResults,
    };
  },
});

export const getEventResults = query({
  args: { eventId: v.id("competitionEvents") },
  handler: async (ctx, args) => {
    const event = await ctx.db.get(args.eventId);
    if (!event) return null;

    const dances = await ctx.db
      .query("eventDances")
      .withIndex("by_event_position", (q) => q.eq("eventId", args.eventId))
      .collect();
    dances.sort((a, b) => a.position - b.position);

    const eventRounds = await ctx.db
      .query("rounds")
      .withIndex("by_event_position", (q) => q.eq("eventId", args.eventId))
      .collect();
    eventRounds.sort((a, b) => a.position - b.position);

    const publishedRounds: Doc<"rounds">[] = [];
    for (const r of eventRounds) {
      const meta = await ctx.db
        .query("roundResultsMeta")
        .withIndex("by_round", (q) => q.eq("roundId", r._id))
        .unique();
      if (meta && meta.status === "published") publishedRounds.push(r);
    }
    if (publishedRounds.length === 0) return null;

    const removals = await getApprovedRemovals(ctx, event.competitionId);
    const hiddenEntryIds = new Set(
      removals
        .filter((r) => r.entryId !== undefined)
        .map((r) => r.entryId as Id<"entries">),
    );

    const compJudges = await ctx.db
      .query("competitionJudges")
      .withIndex("by_competition_judge", (q) =>
        q.eq("competitionId", event.competitionId),
      )
      .collect();
    const judgeRows = (
      await Promise.all(compJudges.map((cj) => ctx.db.get(cj.judgeId)))
    ).filter((j): j is Doc<"judges"> => j !== null);

    const roundData = await Promise.all(
      publishedRounds.map(async (round) => {
        const all = await ctx.db
          .query("finalResults")
          .withIndex("by_round_placement", (q) => q.eq("roundId", round._id))
          .collect();
        all.sort((a, b) => a.placement - b.placement);
        const overall = all.filter((r) => r.danceName === undefined);
        const baseResults = overall.length > 0 ? overall : all;
        const visible = baseResults.filter((r) => !hiddenEntryIds.has(r.entryId));

        const summary = await Promise.all(
          visible.map(async (r) => {
            const entry = await ctx.db.get(r.entryId);
            const leaderReg = entry
              ? await ctx.db.get(entry.leaderRegistrationId)
              : null;
            const followerReg = entry
              ? await ctx.db.get(entry.followerRegistrationId)
              : null;
            const leader = leaderReg ? await ctx.db.get(leaderReg.userId) : null;
            const follower = followerReg
              ? await ctx.db.get(followerReg.userId)
              : null;
            const leaderOrg = leaderReg?.orgId
              ? await ctx.db.get(leaderReg.orgId)
              : null;
            const perDance =
              dances.length > 1
                ? all.filter(
                    (pd) =>
                      pd.entryId === r.entryId && pd.danceName !== undefined,
                  )
                : [];
            return {
              placement: r.placement,
              placementValue: r.placementValue,
              tiebreakRule: r.tiebreakRule,
              coupleNumber:
                leaderReg?.competitorNumber ??
                followerReg?.competitorNumber ??
                null,
              leaderName: leader?.displayName ?? null,
              followerName: follower?.displayName ?? null,
              organization: leaderOrg?.name ?? null,
              perDancePlacements: perDance.map((pd) => ({
                danceName: pd.danceName!,
                placement: pd.placement,
              })),
            };
          }),
        );

        const tabulation = (
          await ctx.db
            .query("tabulationTables")
            .withIndex("by_round_entry_dance", (q) =>
              q.eq("roundId", round._id),
            )
            .collect()
        )
          .filter((t) => !hiddenEntryIds.has(t.entryId))
          .map((t) => ({
            entryId: t.entryId,
            danceName: t.danceName,
            tableData: t.tableData,
          }));

        return {
          roundId: round._id,
          roundType: round.roundType,
          summary,
          tabulation,
          judges: judgeRows.map((j) => ({
            id: j._id,
            initials: j.initials ?? `${j.firstName[0]}${j.lastName[0]}`,
            name: `${j.firstName} ${j.lastName}`,
          })),
        };
      }),
    );

    return {
      eventName: event.name,
      style: event.style,
      level: event.level,
      dances: dances.map((d) => d.danceName),
      rounds: roundData,
    };
  },
});

export const getCompetitorHistory = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const activeRegs = regs.filter((r) => !r.cancelled);

    const removals = await ctx.db
      .query("recordRemovalRequests")
      .withIndex("by_user_competition", (q) => q.eq("userId", args.userId))
      .collect();
    const approvedRemovals = removals.filter((r) => r.status === "approved");
    const hiddenCompIds = new Set(
      approvedRemovals
        .filter((r) => r.entryId === undefined)
        .map((r) => r.competitionId),
    );
    const hiddenEntryIds = new Set(
      approvedRemovals
        .filter((r) => r.entryId !== undefined)
        .map((r) => r.entryId as Id<"entries">),
    );

    const compResults: Array<{
      competitionId: Id<"competitions">;
      competitionName: string;
      competitionSlug: string;
      organizationName: string | null;
      date: string | null;
      events: Array<{
        eventId: Id<"competitionEvents">;
        eventName: string;
        placement: number | null;
        partnerName: string | null;
      }>;
    }> = [];

    for (const reg of activeRegs) {
      if (hiddenCompIds.has(reg.competitionId)) continue;
      const comp = await ctx.db.get(reg.competitionId);
      if (!comp || comp.status !== "finished") continue;
      const org = await ctx.db.get(comp.orgId);

      const days = await ctx.db
        .query("competitionDays")
        .withIndex("by_competition_position", (q) =>
          q.eq("competitionId", comp._id),
        )
        .collect();
      days.sort((a, b) => a.position - b.position);
      const firstDay = days[0] ?? null;

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
      const userEntries = [...leaderEntries, ...followerEntries].filter(
        (e) => !e.scratched,
      );

      const eventPlacements: Array<{
        eventId: Id<"competitionEvents">;
        eventName: string;
        placement: number | null;
        partnerName: string | null;
      }> = [];

      for (const entry of userEntries) {
        if (hiddenEntryIds.has(entry._id)) continue;
        const event = await ctx.db.get(entry.eventId);
        if (!event) continue;
        const eventRounds = await ctx.db
          .query("rounds")
          .withIndex("by_event_position", (q) => q.eq("eventId", event._id))
          .collect();
        eventRounds.sort((a, b) => b.position - a.position);

        let placement: number | null = null;
        for (const round of eventRounds) {
          const meta = await ctx.db
            .query("roundResultsMeta")
            .withIndex("by_round", (q) => q.eq("roundId", round._id))
            .unique();
          if (!meta || meta.status !== "published") continue;
          const results = await ctx.db
            .query("finalResults")
            .withIndex("by_round_entry_dance", (q) =>
              q.eq("roundId", round._id).eq("entryId", entry._id),
            )
            .collect();
          const overall = results.find((r) => r.danceName === undefined);
          const chosen = overall ?? results[0];
          if (chosen) {
            placement = chosen.placement;
            break;
          }
        }

        const isLeader = entry.leaderRegistrationId === reg._id;
        const partnerRegId = isLeader
          ? entry.followerRegistrationId
          : entry.leaderRegistrationId;
        const partnerReg = await ctx.db.get(partnerRegId);
        const partner = partnerReg ? await ctx.db.get(partnerReg.userId) : null;

        eventPlacements.push({
          eventId: event._id,
          eventName: event.name,
          placement,
          partnerName: partner?.displayName ?? null,
        });
      }

      if (eventPlacements.length > 0) {
        compResults.push({
          competitionId: comp._id,
          competitionName: comp.name,
          competitionSlug: comp.slug,
          organizationName: org?.name ?? null,
          date: firstDay?.date ?? null,
          events: eventPlacements,
        });
      }
    }

    compResults.sort((a, b) => {
      if (!a.date && !b.date) return 0;
      if (!a.date) return 1;
      if (!b.date) return -1;
      return b.date.localeCompare(a.date);
    });

    return {
      user: { id: user._id, displayName: user.displayName },
      competitions: compResults,
    };
  },
});

export const searchCompetitors = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const q = args.query.trim();
    if (q.length === 0 || q.length > 100) return [];
    const lc = q.toLowerCase();

    const users = await ctx.db.query("users").collect();
    const matching = users.filter((u) => {
      return (
        (u.displayName?.toLowerCase().includes(lc) ?? false) ||
        (u.username?.toLowerCase().includes(lc) ?? false)
      );
    });

    const enriched = await Promise.all(
      matching.map(async (u) => {
        const regs = await ctx.db
          .query("competitionRegistrations")
          .withIndex("by_user", (qq) => qq.eq("userId", u._id))
          .collect();
        const active = regs.filter((r) => !r.cancelled);
        const compIds = new Set(active.map((r) => r.competitionId));
        return {
          userId: u._id,
          displayName: u.displayName ?? null,
          username: u.username ?? null,
          competitionCount: compIds.size,
        };
      }),
    );

    enriched.sort((a, b) => b.competitionCount - a.competitionCount);
    return enriched.slice(0, 20);
  },
});

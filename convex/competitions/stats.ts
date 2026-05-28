import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireCompStaffRole } from "../lib/permissions";
import { centsToDollarString } from "../lib/money";

export const getCompetitionStats = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompStaffRole(ctx, args.competitionId, ["registration"]);

    const regs = await ctx.db
      .query("competitionRegistrations")
      .withIndex("by_competition_user", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    const activeRegs = regs.filter((r) => !r.cancelled);

    const events = await ctx.db
      .query("competitionEvents")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();

    const eventStats = new Map(
      events.map((event) => [
        event._id,
        { eventId: event._id, eventName: event.name, entryCount: 0 },
      ]),
    );
    const competitionEntries = await ctx.db
      .query("entries")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();

    let totalEntries = 0;
    for (const entry of competitionEntries) {
      if (entry.scratched) continue;
      const eventStat = eventStats.get(entry.eventId);
      if (!eventStat) continue;
      eventStat.entryCount += 1;
      totalEntries += 1;
    }

    const entriesPerEvent = Array.from(eventStats.values());
    entriesPerEvent.sort((a, b) => a.eventName.localeCompare(b.eventName));

    const orgCounts = new Map<string | null, number>();
    for (const reg of activeRegs) {
      const key = reg.orgId ?? null;
      orgCounts.set(key, (orgCounts.get(key) ?? 0) + 1);
    }
    const registrationsByOrg = Array.from(orgCounts.entries()).map(
      ([orgId, count]) => ({ orgId, count }),
    );

    const activeRegIds = new Set(activeRegs.map((reg) => reg._id));
    const totalOwedCents = activeRegs.reduce(
      (sum, reg) => sum + reg.amountOwed,
      0,
    );
    const competitionPayments = await ctx.db
      .query("payments")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .collect();
    let totalCollectedCents = 0;
    for (const payment of competitionPayments) {
      if (!activeRegIds.has(payment.registrationId)) continue;
      if (payment.amount > 0) totalCollectedCents += payment.amount;
    }

    return {
      totalRegistrations: activeRegs.length,
      totalEntries,
      totalEvents: events.length,
      entriesPerEvent,
      registrationsByOrg,
      totalCollected: centsToDollarString(totalCollectedCents),
      totalOwed: centsToDollarString(totalOwedCents),
    };
  },
});

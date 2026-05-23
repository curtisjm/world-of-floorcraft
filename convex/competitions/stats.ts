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

    let totalEntries = 0;
    const entriesPerEvent: {
      eventId: string;
      eventName: string;
      entryCount: number;
    }[] = [];
    for (const event of events) {
      const rows = await ctx.db
        .query("entries")
        .withIndex("by_event", (q) => q.eq("eventId", event._id))
        .collect();
      const activeEntries = rows.filter((r) => !r.scratched);
      totalEntries += activeEntries.length;
      entriesPerEvent.push({
        eventId: event._id,
        eventName: event.name,
        entryCount: activeEntries.length,
      });
    }
    entriesPerEvent.sort((a, b) => a.eventName.localeCompare(b.eventName));

    const orgCounts = new Map<string | null, number>();
    for (const reg of activeRegs) {
      const key = reg.orgId ?? null;
      orgCounts.set(key, (orgCounts.get(key) ?? 0) + 1);
    }
    const registrationsByOrg = Array.from(orgCounts.entries()).map(
      ([orgId, count]) => ({ orgId, count }),
    );

    let totalCollectedCents = 0;
    let totalOwedCents = 0;
    for (const reg of activeRegs) {
      totalOwedCents += reg.amountOwed;
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_registration", (q) => q.eq("registrationId", reg._id))
        .collect();
      for (const p of payments) {
        if (p.amount > 0) totalCollectedCents += p.amount;
      }
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

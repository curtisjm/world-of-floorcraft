import { z } from "zod";
import { eq, and, sql, count, countDistinct } from "drizzle-orm";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionEvents,
  competitionRegistrations,
  entries,
  payments,
} from "@competitions/schema";
import { requireCompStaffRole } from "@competitions/lib/auth";

export const statsRouter = router({
  getCompetitionStats: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["registration"]);

      // Total registrations (non-cancelled)
      const [regCount] = await db
        .select({ count: countDistinct(competitionRegistrations.id) })
        .from(competitionRegistrations)
        .where(
          and(
            eq(competitionRegistrations.competitionId, input.competitionId),
            eq(competitionRegistrations.cancelled, false),
          ),
        );

      // Total entries (non-scratched)
      const [entryCount] = await db
        .select({ count: count(entries.id) })
        .from(entries)
        .innerJoin(competitionEvents, eq(entries.eventId, competitionEvents.id))
        .where(
          and(
            eq(competitionEvents.competitionId, input.competitionId),
            eq(entries.scratched, false),
          ),
        );

      // Total events
      const [eventCount] = await db
        .select({ count: count(competitionEvents.id) })
        .from(competitionEvents)
        .where(eq(competitionEvents.competitionId, input.competitionId));

      // Entries per event
      const entriesPerEvent = await db
        .select({
          eventId: competitionEvents.id,
          eventName: competitionEvents.name,
          entryCount: count(entries.id),
        })
        .from(competitionEvents)
        .leftJoin(
          entries,
          and(eq(entries.eventId, competitionEvents.id), eq(entries.scratched, false)),
        )
        .where(eq(competitionEvents.competitionId, input.competitionId))
        .groupBy(competitionEvents.id, competitionEvents.name)
        .orderBy(competitionEvents.name);

      // Registrations by org
      const registrationsByOrg = await db
        .select({
          orgId: competitionRegistrations.orgId,
          count: count(competitionRegistrations.id),
        })
        .from(competitionRegistrations)
        .where(
          and(
            eq(competitionRegistrations.competitionId, input.competitionId),
            eq(competitionRegistrations.cancelled, false),
          ),
        )
        .groupBy(competitionRegistrations.orgId);

      // Payment summary
      const [paymentSummary] = await db
        .select({
          totalCollected: sql<string>`coalesce(sum(case when ${payments.amount} > 0 then ${payments.amount} else 0 end), 0)`,
          totalOwed: sql<string>`coalesce(sum(${competitionRegistrations.amountOwed}), 0)`,
        })
        .from(competitionRegistrations)
        .leftJoin(payments, eq(payments.registrationId, competitionRegistrations.id))
        .where(
          and(
            eq(competitionRegistrations.competitionId, input.competitionId),
            eq(competitionRegistrations.cancelled, false),
          ),
        );

      return {
        totalRegistrations: regCount.count,
        totalEntries: entryCount.count,
        totalEvents: eventCount.count,
        entriesPerEvent,
        registrationsByOrg,
        totalCollected: paymentSummary.totalCollected,
        totalOwed: paymentSummary.totalOwed,
      };
    }),
});

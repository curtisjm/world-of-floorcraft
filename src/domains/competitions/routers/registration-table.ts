import { z } from "zod";
import { eq, and, sql, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitionRegistrations,
  registrationCheckins,
  entries,
  payments,
  addDropRequests,
} from "@competitions/schema";
import { users } from "@shared/schema";
import { organizations } from "@orgs/schema";
import { requireCompStaffRole } from "@competitions/lib/auth";

export const registrationTableRouter = router({
  getRegistrationTable: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["registration"]);

      // Get all non-cancelled registrations with user and org info
      const regs = await db
        .select({
          id: competitionRegistrations.id,
          userId: competitionRegistrations.userId,
          competitorNumber: competitionRegistrations.competitorNumber,
          amountOwed: competitionRegistrations.amountOwed,
          paidConfirmed: competitionRegistrations.paidConfirmed,
          checkedIn: competitionRegistrations.checkedIn,
          orgId: competitionRegistrations.orgId,
          registeredAt: competitionRegistrations.registeredAt,
          displayName: users.displayName,
          orgName: organizations.name,
        })
        .from(competitionRegistrations)
        .innerJoin(users, eq(users.id, competitionRegistrations.userId))
        .leftJoin(organizations, eq(organizations.id, competitionRegistrations.orgId))
        .where(
          and(
            eq(competitionRegistrations.competitionId, input.competitionId),
            eq(competitionRegistrations.cancelled, false),
          ),
        )
        .orderBy(organizations.name, users.displayName);

      // Get payment totals per registration
      const paymentTotals = await db
        .select({
          registrationId: payments.registrationId,
          totalPaid: sql<string>`coalesce(sum(${payments.amount}), 0)`,
        })
        .from(payments)
        .where(
          sql`${payments.registrationId} IN (${sql.raw(
            regs.map((r) => r.id).join(",") || "0",
          )})`,
        )
        .groupBy(payments.registrationId);

      const paymentMap = new Map(paymentTotals.map((p) => [p.registrationId, p.totalPaid]));

      // Get check-in details
      const checkinDetails = await db
        .select({
          registrationId: registrationCheckins.registrationId,
          checkedInBy: registrationCheckins.checkedInBy,
          checkedInAt: registrationCheckins.checkedInAt,
        })
        .from(registrationCheckins)
        .where(
          sql`${registrationCheckins.registrationId} IN (${sql.raw(
            regs.map((r) => r.id).join(",") || "0",
          )})`,
        );

      const checkinMap = new Map(checkinDetails.map((c) => [c.registrationId, c]));

      // Get entry counts per registration
      const entryCounts = await db
        .select({
          registrationId: sql<number>`registration_id`,
          entryCount: sql<number>`count(*)::int`,
        })
        .from(
          sql`(
            SELECT ${entries.leaderRegistrationId} as registration_id FROM ${entries}
            WHERE ${entries.eventId} IN (
              SELECT id FROM competition_events WHERE competition_id = ${input.competitionId}
            )
            UNION ALL
            SELECT ${entries.followerRegistrationId} as registration_id FROM ${entries}
            WHERE ${entries.eventId} IN (
              SELECT id FROM competition_events WHERE competition_id = ${input.competitionId}
            )
          ) as reg_entries`,
        )
        .groupBy(sql`registration_id`);

      const entryCountMap = new Map(entryCounts.map((e) => [e.registrationId, e.entryCount]));

      // Group by org
      const orgMap = new Map<number | null, typeof enrichedRegs>();
      type EnrichedReg = (typeof regs)[0] & {
        totalPaid: string;
        balance: string;
        checkinDetail: { checkedInBy: string; checkedInAt: Date } | null;
        entryCount: number;
      };
      type enrichedRegs = EnrichedReg[];

      const enrichedRegs: EnrichedReg[] = regs.map((r) => {
        const totalPaid = paymentMap.get(r.id) ?? "0";
        const balance = (parseFloat(r.amountOwed) - parseFloat(totalPaid)).toFixed(2);
        return {
          ...r,
          totalPaid,
          balance,
          checkinDetail: checkinMap.get(r.id) ?? null,
          entryCount: entryCountMap.get(r.id) ?? 0,
        };
      });

      for (const reg of enrichedRegs) {
        const key = reg.orgId;
        if (!orgMap.has(key)) orgMap.set(key, []);
        orgMap.get(key)!.push(reg);
      }

      return Array.from(orgMap.entries()).map(([orgId, registrations]) => ({
        orgId,
        orgName: registrations[0]?.orgName ?? "Unaffiliated",
        registrations,
      }));
    }),

  getRegistrationDetail: protectedProcedure
    .input(z.object({ registrationId: z.number() }))
    .query(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);

      const user = await db.query.users.findFirst({
        where: eq(users.id, reg.userId),
      });

      const regEntries = await db.query.entries.findMany({
        where: sql`${entries.leaderRegistrationId} = ${input.registrationId} OR ${entries.followerRegistrationId} = ${input.registrationId}`,
      });

      const regPayments = await db
        .select()
        .from(payments)
        .where(eq(payments.registrationId, input.registrationId))
        .orderBy(desc(payments.createdAt));

      const checkin = await db.query.registrationCheckins.findFirst({
        where: eq(registrationCheckins.registrationId, input.registrationId),
      });

      const addDrops = await db.query.addDropRequests.findMany({
        where: eq(addDropRequests.leaderRegistrationId, input.registrationId),
      });

      return {
        registration: reg,
        user,
        entries: regEntries,
        payments: regPayments,
        checkin,
        addDropRequests: addDrops,
      };
    }),

  getPendingAddDrops: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["registration"]);

      const requests = await db.query.addDropRequests.findMany({
        where: and(
          eq(addDropRequests.competitionId, input.competitionId),
          eq(addDropRequests.status, "pending"),
        ),
        orderBy: addDropRequests.createdAt,
      });

      const safe = requests.filter((r) => !r.affectsRounds);
      const needsReview = requests.filter((r) => r.affectsRounds);

      return { safe, needsReview };
    }),

  checkinRegistration: protectedProcedure
    .input(z.object({ registrationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      const comp = await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);

      // Check not already checked in
      const existing = await db.query.registrationCheckins.findFirst({
        where: eq(registrationCheckins.registrationId, input.registrationId),
      });
      if (existing) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Already checked in" });
      }

      // Insert checkin record
      const [checkin] = await db
        .insert(registrationCheckins)
        .values({
          registrationId: input.registrationId,
          checkedInBy: ctx.userId,
        })
        .returning();

      // Sync the boolean flag
      await db
        .update(competitionRegistrations)
        .set({ checkedIn: true })
        .where(eq(competitionRegistrations.id, input.registrationId));

      // Ably broadcast (best-effort)
      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "checkin:registration", {
          registrationId: input.registrationId,
          checkedIn: true,
        });
      } catch {
        // Ably not available
      }

      return checkin;
    }),

  undoCheckin: protectedProcedure
    .input(z.object({ registrationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      const comp = await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);

      // Delete checkin record
      await db
        .delete(registrationCheckins)
        .where(eq(registrationCheckins.registrationId, input.registrationId));

      // Sync the boolean flag
      await db
        .update(competitionRegistrations)
        .set({ checkedIn: false })
        .where(eq(competitionRegistrations.id, input.registrationId));

      // Ably broadcast
      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "checkin:registration", {
          registrationId: input.registrationId,
          checkedIn: false,
        });
      } catch {
        // Ably not available
      }

      return { undone: true };
    }),

  recordPayment: protectedProcedure
    .input(
      z.object({
        registrationId: z.number(),
        amount: z.string(),
        method: z.enum(["cash", "check", "other"]),
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      const comp = await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);

      const [payment] = await db
        .insert(payments)
        .values({
          registrationId: input.registrationId,
          amount: input.amount,
          method: input.method,
          note: input.note,
          processedBy: ctx.userId,
        })
        .returning();

      // Ably broadcast
      try {
        const { publishToLive } = await import("@competitions/lib/ably-comp");
        await publishToLive(comp.id, "checkin:registration", {
          registrationId: input.registrationId,
          checkedIn: reg.checkedIn,
        });
      } catch {
        // Ably not available
      }

      return payment;
    }),

  approveAddDrop: protectedProcedure
    .input(z.object({ requestId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const request = await db.query.addDropRequests.findFirst({
        where: eq(addDropRequests.id, input.requestId),
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      await requireCompStaffRole(request.competitionId, ctx.userId, ["registration"]);

      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request already resolved" });
      }

      if (request.type === "add") {
        await db.insert(entries).values({
          eventId: request.eventId,
          leaderRegistrationId: request.leaderRegistrationId,
          followerRegistrationId: request.followerRegistrationId,
          createdBy: ctx.userId,
        });
      } else {
        await db
          .delete(entries)
          .where(
            and(
              eq(entries.eventId, request.eventId),
              eq(entries.leaderRegistrationId, request.leaderRegistrationId),
              eq(entries.followerRegistrationId, request.followerRegistrationId),
            ),
          );
      }

      const [updated] = await db
        .update(addDropRequests)
        .set({
          status: "approved",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(addDropRequests.id, input.requestId))
        .returning();

      return updated;
    }),

  rejectAddDrop: protectedProcedure
    .input(z.object({ requestId: z.number(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const request = await db.query.addDropRequests.findFirst({
        where: eq(addDropRequests.id, input.requestId),
      });
      if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "Request not found" });

      await requireCompStaffRole(request.competitionId, ctx.userId, ["registration"]);

      if (request.status !== "pending") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Request already resolved" });
      }

      const [updated] = await db
        .update(addDropRequests)
        .set({
          status: "rejected",
          reviewedBy: ctx.userId,
          reviewedAt: new Date(),
        })
        .where(eq(addDropRequests.id, input.requestId))
        .returning();

      return updated;
    }),
});

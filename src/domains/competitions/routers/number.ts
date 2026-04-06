import { z } from "zod";
import { eq, and, sql, isNull, isNotNull, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionRegistrations,
  entries,
} from "@competitions/schema";
import { users } from "@shared/schema";
import { requireCompStaffRole, requireCompOrgRole } from "@competitions/lib/auth";

export const numberRouter = router({
  listAssignments: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["registration"]);

      const assignments = await db
        .select({
          registrationId: competitionRegistrations.id,
          userId: competitionRegistrations.userId,
          competitorNumber: competitionRegistrations.competitorNumber,
          displayName: users.displayName,
          username: users.username,
        })
        .from(competitionRegistrations)
        .innerJoin(users, eq(users.id, competitionRegistrations.userId))
        .where(
          and(
            eq(competitionRegistrations.competitionId, input.competitionId),
            eq(competitionRegistrations.cancelled, false),
          ),
        )
        .orderBy(asc(competitionRegistrations.competitorNumber));

      return assignments;
    }),

  autoAssign: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, ["registration"]);

      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });

      // Find registrations that lead in at least one event and don't have a number
      const leadersWithoutNumbers = await db.execute(sql`
        SELECT DISTINCT cr.id
        FROM competition_registrations cr
        JOIN entries e ON e.leader_registration_id = cr.id
        WHERE cr.competition_id = ${input.competitionId}
          AND cr.cancelled = false
          AND cr.competitor_number IS NULL
        ORDER BY cr.id
      `);

      const leaderIds = (leadersWithoutNumbers.rows as { id: number }[]).map((r) => r.id);
      if (leaderIds.length === 0) return { assigned: 0 };

      // Get already-assigned numbers
      const existingNumbers = await db
        .select({ num: competitionRegistrations.competitorNumber })
        .from(competitionRegistrations)
        .where(
          and(
            eq(competitionRegistrations.competitionId, input.competitionId),
            isNotNull(competitionRegistrations.competitorNumber),
          ),
        );

      const taken = new Set(existingNumbers.map((r) => r.num));
      const exclusions = new Set(comp.numberExclusions ?? []);

      let nextNumber = comp.numberStart ?? 1;
      let assigned = 0;

      for (const regId of leaderIds) {
        while (taken.has(nextNumber) || exclusions.has(nextNumber)) {
          nextNumber++;
        }

        await db
          .update(competitionRegistrations)
          .set({ competitorNumber: nextNumber })
          .where(eq(competitionRegistrations.id, regId));

        taken.add(nextNumber);
        nextNumber++;
        assigned++;
      }

      return { assigned };
    }),

  manualAssign: protectedProcedure
    .input(
      z.object({
        registrationId: z.number(),
        number: z.number().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);

      // Check uniqueness
      const existing = await db.query.competitionRegistrations.findFirst({
        where: and(
          eq(competitionRegistrations.competitionId, reg.competitionId),
          eq(competitionRegistrations.competitorNumber, input.number),
        ),
      });
      if (existing && existing.id !== input.registrationId) {
        throw new TRPCError({ code: "CONFLICT", message: `Number ${input.number} is already assigned` });
      }

      const [updated] = await db
        .update(competitionRegistrations)
        .set({ competitorNumber: input.number })
        .where(eq(competitionRegistrations.id, input.registrationId))
        .returning();

      return updated;
    }),

  unassign: protectedProcedure
    .input(z.object({ registrationId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const reg = await db.query.competitionRegistrations.findFirst({
        where: eq(competitionRegistrations.id, input.registrationId),
      });
      if (!reg) throw new TRPCError({ code: "NOT_FOUND", message: "Registration not found" });

      await requireCompStaffRole(reg.competitionId, ctx.userId, ["registration"]);

      const [updated] = await db
        .update(competitionRegistrations)
        .set({ competitorNumber: null })
        .where(eq(competitionRegistrations.id, input.registrationId))
        .returning();

      return updated;
    }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        numberStart: z.number().min(1).optional(),
        numberExclusions: z.number().array().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const { competitionId, ...updates } = input;
      const [updated] = await db
        .update(competitions)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(competitions.id, competitionId))
        .returning();

      return updated;
    }),
});

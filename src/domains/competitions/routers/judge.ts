import { z } from "zod";
import { eq, and, ilike, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { competitions, judges, competitionJudges, competitionStaff } from "@competitions/schema";
import { organizations, memberships } from "@orgs/schema";

async function requireCompOrgRole(competitionId: number, userId: string) {
  const comp = await db.query.competitions.findFirst({
    where: eq(competitions.id, competitionId),
  });
  if (!comp) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });
  }

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, comp.orgId),
  });
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, comp.orgId), eq(memberships.userId, userId)),
  });

  const isOwner = org?.ownerId === userId;
  const isAdmin = membership?.role === "admin";
  if (isOwner || isAdmin) return comp;

  const staff = await db.query.competitionStaff.findFirst({
    where: and(
      eq(competitionStaff.competitionId, competitionId),
      eq(competitionStaff.userId, userId),
      eq(competitionStaff.role, "scrutineer"),
    ),
  });
  if (staff) return comp;

  throw new TRPCError({ code: "FORBIDDEN", message: "Org admin/owner or scrutineer required" });
}

export const judgeRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1) }))
    .query(async ({ input }) => {
      const results = await db
        .select()
        .from(judges)
        .where(
          sql`${judges.firstName} || ' ' || ${judges.lastName} ILIKE ${'%' + input.query + '%'}`,
        )
        .limit(20);

      return results;
    }),

  listByCompetition: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const results = await db
        .select({
          id: competitionJudges.id,
          judgeId: judges.id,
          firstName: judges.firstName,
          lastName: judges.lastName,
          initials: judges.initials,
          affiliation: judges.affiliation,
          assignedAt: competitionJudges.createdAt,
        })
        .from(competitionJudges)
        .innerJoin(judges, eq(judges.id, competitionJudges.judgeId))
        .where(eq(competitionJudges.competitionId, input.competitionId));

      return results;
    }),

  create: protectedProcedure
    .input(
      z.object({
        firstName: z.string().min(1),
        lastName: z.string().min(1),
        initials: z.string().max(5).optional(),
        affiliation: z.string().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const [judge] = await db
        .insert(judges)
        .values({
          firstName: input.firstName,
          lastName: input.lastName,
          initials: input.initials,
          affiliation: input.affiliation,
        })
        .returning();

      return judge;
    }),

  update: protectedProcedure
    .input(
      z.object({
        judgeId: z.number(),
        firstName: z.string().min(1).optional(),
        lastName: z.string().min(1).optional(),
        initials: z.string().max(5).nullable().optional(),
        affiliation: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await db.query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
      });
      if (!existing) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Judge not found" });
      }

      const { judgeId, ...updates } = input;
      const [updated] = await db
        .update(judges)
        .set(updates)
        .where(eq(judges.id, judgeId))
        .returning();

      return updated;
    }),

  assignToCompetition: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        judgeId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      // Verify judge exists
      const judge = await db.query.judges.findFirst({
        where: eq(judges.id, input.judgeId),
      });
      if (!judge) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Judge not found" });
      }

      // Check for duplicate
      const existing = await db.query.competitionJudges.findFirst({
        where: and(
          eq(competitionJudges.competitionId, input.competitionId),
          eq(competitionJudges.judgeId, input.judgeId),
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Judge already assigned to this competition" });
      }

      const [assignment] = await db
        .insert(competitionJudges)
        .values({
          competitionId: input.competitionId,
          judgeId: input.judgeId,
        })
        .returning();

      return assignment;
    }),

  removeFromCompetition: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        judgeId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const result = await db
        .delete(competitionJudges)
        .where(
          and(
            eq(competitionJudges.competitionId, input.competitionId),
            eq(competitionJudges.judgeId, input.judgeId),
          ),
        )
        .returning();

      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Judge assignment not found" });
      }

      return { success: true };
    }),
});

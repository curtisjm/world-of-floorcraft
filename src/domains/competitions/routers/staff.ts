import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { competitions, competitionStaff } from "@competitions/schema";
import { organizations, memberships } from "@orgs/schema";
import { users } from "@shared/schema";

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

export const staffRouter = router({
  listByCompetition: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const staffList = await db
        .select({
          id: competitionStaff.id,
          userId: competitionStaff.userId,
          role: competitionStaff.role,
          createdAt: competitionStaff.createdAt,
          username: users.username,
          displayName: users.displayName,
        })
        .from(competitionStaff)
        .innerJoin(users, eq(users.id, competitionStaff.userId))
        .where(eq(competitionStaff.competitionId, input.competitionId));

      return staffList;
    }),

  assign: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        userId: z.string(),
        role: z.enum([
          "scrutineer",
          "chairman",
          "judge",
          "emcee",
          "deck_captain",
          "registration",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      // Verify target user exists
      const targetUser = await db.query.users.findFirst({
        where: eq(users.id, input.userId),
      });
      if (!targetUser) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      // Check for duplicate assignment
      const existing = await db.query.competitionStaff.findFirst({
        where: and(
          eq(competitionStaff.competitionId, input.competitionId),
          eq(competitionStaff.userId, input.userId),
          eq(competitionStaff.role, input.role),
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "User already has this role" });
      }

      const [staff] = await db
        .insert(competitionStaff)
        .values({
          competitionId: input.competitionId,
          userId: input.userId,
          role: input.role,
        })
        .returning();

      return staff;
    }),

  remove: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        userId: z.string(),
        role: z.enum([
          "scrutineer",
          "chairman",
          "judge",
          "emcee",
          "deck_captain",
          "registration",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const result = await db
        .delete(competitionStaff)
        .where(
          and(
            eq(competitionStaff.competitionId, input.competitionId),
            eq(competitionStaff.userId, input.userId),
            eq(competitionStaff.role, input.role),
          ),
        )
        .returning();

      if (result.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Staff assignment not found" });
      }

      return { success: true };
    }),
});

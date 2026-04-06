import { z } from "zod";
import { eq, and, sql, desc, ilike } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  competitionDays,
  scheduleBlocks,
  competitionEvents,
  competitionStaff,
  competitionJudges,
} from "@competitions/schema";
import { organizations, memberships } from "@orgs/schema";
import * as bcrypt from "bcryptjs";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Check that the user is an org admin/owner for the competition's org,
 * or an assigned scrutineer for this competition.
 */
async function requireCompOrgRole(
  competitionId: number,
  userId: string,
): Promise<{ competition: typeof competitions.$inferSelect }> {
  const comp = await db.query.competitions.findFirst({
    where: eq(competitions.id, competitionId),
  });

  if (!comp) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });
  }

  // Check org admin/owner
  const membership = await db.query.memberships.findFirst({
    where: and(
      eq(memberships.orgId, comp.orgId),
      eq(memberships.userId, userId),
    ),
  });

  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, comp.orgId),
  });

  const isOwner = org?.ownerId === userId;
  const isAdmin = membership?.role === "admin";

  if (isOwner || isAdmin) {
    return { competition: comp };
  }

  // Check scrutineer assignment
  const staff = await db.query.competitionStaff.findFirst({
    where: and(
      eq(competitionStaff.competitionId, competitionId),
      eq(competitionStaff.userId, userId),
      eq(competitionStaff.role, "scrutineer"),
    ),
  });

  if (staff) {
    return { competition: comp };
  }

  throw new TRPCError({ code: "FORBIDDEN", message: "Org admin/owner or scrutineer required" });
}

export const competitionRouter = router({
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const [result] = await db
        .select({
          id: competitions.id,
          orgId: competitions.orgId,
          name: competitions.name,
          slug: competitions.slug,
          status: competitions.status,
          description: competitions.description,
          rules: competitions.rules,
          venueName: competitions.venueName,
          streetAddress: competitions.streetAddress,
          city: competitions.city,
          state: competitions.state,
          zip: competitions.zip,
          country: competitions.country,
          venueNotes: competitions.venueNotes,
          baseFee: competitions.baseFee,
          createdAt: competitions.createdAt,
          orgName: organizations.name,
          orgSlug: organizations.slug,
          orgAvatarUrl: organizations.avatarUrl,
        })
        .from(competitions)
        .innerJoin(organizations, eq(organizations.id, competitions.orgId))
        .where(eq(competitions.slug, input.slug));

      return result ?? null;
    }),

  list: publicProcedure
    .input(
      z.object({
        status: z
          .enum([
            "draft",
            "advertised",
            "accepting_entries",
            "entries_closed",
            "running",
            "finished",
          ])
          .optional(),
        orgId: z.number().optional(),
        limit: z.number().min(1).max(50).default(20),
        cursor: z.number().optional(),
      }),
    )
    .query(async ({ input }) => {
      const conditions = [];
      if (input.status) conditions.push(eq(competitions.status, input.status));
      if (input.orgId) conditions.push(eq(competitions.orgId, input.orgId));
      if (input.cursor) conditions.push(sql`${competitions.id} < ${input.cursor}`);

      const items = await db
        .select({
          id: competitions.id,
          orgId: competitions.orgId,
          name: competitions.name,
          slug: competitions.slug,
          status: competitions.status,
          city: competitions.city,
          state: competitions.state,
          createdAt: competitions.createdAt,
          orgName: organizations.name,
          orgSlug: organizations.slug,
        })
        .from(competitions)
        .innerJoin(organizations, eq(organizations.id, competitions.orgId))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(competitions.id))
        .limit(input.limit + 1);

      let nextCursor: number | undefined;
      if (items.length > input.limit) {
        items.pop();
        nextCursor = items[items.length - 1]!.id;
      }

      return { items, nextCursor };
    }),

  getForDashboard: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const { competition } = await requireCompOrgRole(input.competitionId, ctx.userId);

      const days = await db.query.competitionDays.findMany({
        where: eq(competitionDays.competitionId, competition.id),
        orderBy: competitionDays.position,
      });

      const blocks = await db.query.scheduleBlocks.findMany({
        where: sql`${scheduleBlocks.dayId} IN (${sql.join(
          days.map((d) => sql`${d.id}`),
          sql`, `,
        )})`,
        orderBy: scheduleBlocks.position,
      });

      const eventCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(competitionEvents)
        .where(eq(competitionEvents.competitionId, competition.id));

      const staffCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(competitionStaff)
        .where(eq(competitionStaff.competitionId, competition.id));

      const judgeCount = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(competitionJudges)
        .where(eq(competitionJudges.competitionId, competition.id));

      return {
        ...competition,
        days: days.map((day) => ({
          ...day,
          blocks: blocks.filter((b) => b.dayId === day.id),
        })),
        eventCount: eventCount[0]?.count ?? 0,
        staffCount: staffCount[0]?.count ?? 0,
        judgeCount: judgeCount[0]?.count ?? 0,
      };
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(200),
        orgId: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Verify org admin/owner
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });
      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const membership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId),
        ),
      });
      const isOwner = org.ownerId === ctx.userId;
      const isAdmin = membership?.role === "admin";
      if (!isOwner && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Org admin or owner required" });
      }

      // Generate unique slug
      let slug = slugify(input.name);
      const existing = await db.query.competitions.findFirst({
        where: eq(competitions.slug, slug),
      });
      if (existing) {
        slug = `${slug}-${Date.now()}`;
      }

      const [comp] = await db
        .insert(competitions)
        .values({
          name: input.name,
          orgId: input.orgId,
          createdBy: ctx.userId,
          slug,
        })
        .returning();

      return comp;
    }),

  update: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        name: z.string().min(1).max(200).optional(),
        description: z.string().nullable().optional(),
        rules: z.string().nullable().optional(),
        venueName: z.string().nullable().optional(),
        streetAddress: z.string().nullable().optional(),
        city: z.string().nullable().optional(),
        state: z.string().nullable().optional(),
        zip: z.string().nullable().optional(),
        country: z.string().nullable().optional(),
        venueNotes: z.string().nullable().optional(),
        maxFinalSize: z.number().min(1).nullable().optional(),
        maxHeatSize: z.number().min(1).nullable().optional(),
        baseFee: z.string().nullable().optional(),
        numberStart: z.number().min(1).optional(),
        numberExclusions: z.number().array().nullable().optional(),
        minutesPerCouplePerDance: z.string().optional(),
        transitionMinutes: z.string().optional(),
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

  updateStatus: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        status: z.enum([
          "draft",
          "advertised",
          "accepting_entries",
          "entries_closed",
          "running",
          "finished",
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const [updated] = await db
        .update(competitions)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(competitions.id, input.competitionId))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });
      }

      // Only org owner can delete
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, comp.orgId),
      });
      if (org?.ownerId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the org owner can delete a competition" });
      }

      await db.delete(competitions).where(eq(competitions.id, input.competitionId));
      return { success: true };
    }),

  setCompCode: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        compCode: z.string().min(3).max(4).regex(/^[A-Z0-9]+$/, "Must be 3-4 uppercase letters/numbers"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const existing = await db.query.competitions.findFirst({
        where: and(
          eq(competitions.compCode, input.compCode),
          sql`${competitions.id} != ${input.competitionId}`,
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Competition code already in use" });
      }

      const [updated] = await db
        .update(competitions)
        .set({ compCode: input.compCode, updatedAt: new Date() })
        .where(eq(competitions.id, input.competitionId))
        .returning();

      return updated;
    }),

  setMasterPassword: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        password: z.string().min(4),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const hash = await bcrypt.hash(input.password, 10);
      const [updated] = await db
        .update(competitions)
        .set({ masterPasswordHash: hash, updatedAt: new Date() })
        .where(eq(competitions.id, input.competitionId))
        .returning();

      return updated;
    }),
});

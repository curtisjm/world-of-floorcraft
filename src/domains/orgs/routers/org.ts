import { z } from "zod";
import { eq, sql, lt, desc, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { organizations, memberships } from "@orgs/schema";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const orgRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).max(100),
        slug: z.string().min(1).max(100).optional(),
        description: z.string().max(500).optional(),
        membershipModel: z.enum(["open", "invite", "request"]).default("open"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const slug = input.slug ?? slugify(input.name);

      const existing = await db.query.organizations.findFirst({
        where: eq(organizations.slug, slug),
      });

      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Slug already taken" });
      }

      const [org] = await db
        .insert(organizations)
        .values({
          name: input.name,
          slug,
          description: input.description,
          membershipModel: input.membershipModel,
          ownerId: ctx.userId,
        })
        .returning();

      await db.insert(memberships).values({
        orgId: org.id,
        userId: ctx.userId,
        role: "admin",
      });

      return org;
    }),

  getBySlug: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const [result] = await db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          description: organizations.description,
          avatarUrl: organizations.avatarUrl,
          membershipModel: organizations.membershipModel,
          ownerId: organizations.ownerId,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
          memberCount: sql<number>`count(${memberships.id})::int`,
        })
        .from(organizations)
        .leftJoin(memberships, eq(memberships.orgId, organizations.id))
        .where(eq(organizations.slug, input.slug))
        .groupBy(organizations.id);

      return result ?? null;
    }),

  update: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        name: z.string().min(1).max(100).optional(),
        description: z.string().max(500).nullable().optional(),
        avatarUrl: z.string().url().nullable().optional(),
        membershipModel: z.enum(["open", "invite", "request"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      const membership = await db.query.memberships.findFirst({
        where: and(
          eq(memberships.orgId, input.orgId),
          eq(memberships.userId, ctx.userId)
        ),
      });

      const isOwner = org.ownerId === ctx.userId;
      const isAdmin = membership?.role === "admin";

      if (!isOwner && !isAdmin) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Admin or owner required" });
      }

      const { orgId, ...updates } = input;
      const [updated] = await db
        .update(organizations)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(organizations.id, orgId))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const org = await db.query.organizations.findFirst({
        where: eq(organizations.id, input.orgId),
      });

      if (!org) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
      }

      if (org.ownerId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the owner can delete this organization" });
      }

      await db.delete(organizations).where(eq(organizations.id, input.orgId));

      return { success: true };
    }),

  listUserOrgs: protectedProcedure.query(async ({ ctx }) => {
    const results = await db
      .select({
        id: organizations.id,
        slug: organizations.slug,
        name: organizations.name,
        description: organizations.description,
        avatarUrl: organizations.avatarUrl,
        membershipModel: organizations.membershipModel,
        ownerId: organizations.ownerId,
        createdAt: organizations.createdAt,
        role: memberships.role,
        joinedAt: memberships.createdAt,
      })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, ctx.userId))
      .orderBy(desc(memberships.createdAt));

    return results;
  }),

  discover: publicProcedure
    .input(
      z.object({
        cursor: z.number().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const { cursor, limit } = input;

      const conditions = cursor ? lt(organizations.id, cursor) : undefined;

      const items = await db
        .select({
          id: organizations.id,
          slug: organizations.slug,
          name: organizations.name,
          description: organizations.description,
          avatarUrl: organizations.avatarUrl,
          membershipModel: organizations.membershipModel,
          createdAt: organizations.createdAt,
          memberCount: sql<number>`count(${memberships.id})::int`,
        })
        .from(organizations)
        .leftJoin(memberships, eq(memberships.orgId, organizations.id))
        .where(conditions)
        .groupBy(organizations.id)
        .orderBy(desc(organizations.id))
        .limit(limit + 1);

      let nextCursor: number | undefined;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next!.id;
      }

      return { items, nextCursor };
    }),
});

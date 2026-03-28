import { z } from "zod";
import { eq, and, desc, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { organizations, memberships } from "@orgs/schema";
import { posts } from "@social/schema";

async function requireAdminOrOwner(orgId: number, userId: string) {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.id, orgId),
  });

  if (!org) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Organization not found" });
  }

  const isOwner = org.ownerId === userId;

  if (!isOwner) {
    const membership = await db.query.memberships.findFirst({
      where: and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
    });

    if (!membership || membership.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: "Admin or owner required" });
    }
  }

  return org;
}

export const orgPostRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        orgId: z.number(),
        type: z.enum(["routine_share", "article"]),
        title: z.string().min(1).max(200).optional(),
        body: z.string().optional(),
        routineId: z.number().optional(),
        visibility: z.enum(["public", "followers", "organization"]).default("public"),
        publish: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      const [post] = await db
        .insert(posts)
        .values({
          authorId: null,
          orgId: input.orgId,
          type: input.type,
          title: input.title,
          body: input.body,
          routineId: input.routineId,
          visibility: input.visibility,
          visibilityOrgId: input.visibility === "organization" ? input.orgId : null,
          publishedAt: input.publish ? new Date() : null,
        })
        .returning();

      return post;
    }),

  listByOrg: publicProcedure
    .input(
      z.object({
        orgId: z.number(),
        cursor: z.number().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const { orgId, cursor, limit } = input;

      const items = await db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.orgId, orgId),
            eq(posts.visibility, "public"),
            isNotNull(posts.publishedAt),
            ...(cursor ? [and(eq(posts.id, cursor))] : [])
          )
        )
        .orderBy(desc(posts.publishedAt))
        .limit(limit + 1);

      // For cursor pagination, filter out the cursor item and take items after it
      let nextCursor: number | undefined;
      if (items.length > limit) {
        const next = items.pop();
        nextCursor = next!.id;
      }

      return { items, nextCursor };
    }),
});

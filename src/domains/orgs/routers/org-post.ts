import { z } from "zod";
import { eq, and, desc, lt, isNotNull, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { memberships, organizations } from "@orgs/schema";
import { posts } from "@social/schema";
import { createBulkNotifications } from "@social/lib/notify";
import { requireAdminOrOwner } from "@orgs/lib/auth";

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

      if (input.publish) {
        const members = await db
          .select({ userId: memberships.userId })
          .from(memberships)
          .where(eq(memberships.orgId, input.orgId));

        await createBulkNotifications(
          members.map((m) => m.userId),
          { type: "org_post", actorId: ctx.userId, postId: post.id, orgId: input.orgId }
        );
      }

      return post;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        orgId: z.number(),
        title: z.string().min(1).max(200).optional(),
        body: z.string().optional(),
        visibility: z.enum(["public", "followers", "organization"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      const { id, orgId, ...updates } = input;
      const setValues: Record<string, unknown> = {
        ...updates,
        updatedAt: new Date(),
      };
      if (input.visibility === "organization") {
        setValues.visibilityOrgId = orgId;
      } else if (input.visibility) {
        setValues.visibilityOrgId = null;
      }

      const [post] = await db
        .update(posts)
        .set(setValues)
        .where(and(eq(posts.id, id), eq(posts.orgId, orgId)))
        .returning();

      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Org post not found" });
      }
      return post;
    }),

  publish: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      const [post] = await db
        .update(posts)
        .set({ publishedAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(posts.id, input.id),
            eq(posts.orgId, input.orgId),
            isNull(posts.publishedAt)
          )
        )
        .returning();

      if (!post) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Draft not found" });
      }

      const members = await db
        .select({ userId: memberships.userId })
        .from(memberships)
        .where(eq(memberships.orgId, input.orgId));

      await createBulkNotifications(
        members.map((m) => m.userId),
        { type: "org_post", actorId: ctx.userId, postId: post.id, orgId: input.orgId }
      );

      return post;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number(), orgId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      const [deleted] = await db
        .delete(posts)
        .where(and(eq(posts.id, input.id), eq(posts.orgId, input.orgId)))
        .returning({ id: posts.id });

      if (!deleted) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Org post not found" });
      }
      return { success: true };
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
        .select({
          id: posts.id,
          type: posts.type,
          title: posts.title,
          body: posts.body,
          visibility: posts.visibility,
          publishedAt: posts.publishedAt,
          createdAt: posts.createdAt,
          orgId: posts.orgId,
          orgName: organizations.name,
          orgSlug: organizations.slug,
          orgAvatarUrl: organizations.avatarUrl,
        })
        .from(posts)
        .innerJoin(organizations, eq(posts.orgId, organizations.id))
        .where(
          and(
            eq(posts.orgId, orgId),
            eq(posts.visibility, "public"),
            isNotNull(posts.publishedAt),
            ...(cursor ? [lt(posts.id, cursor)] : [])
          )
        )
        .orderBy(desc(posts.publishedAt))
        .limit(limit + 1);

      let nextCursor: number | undefined;
      if (items.length > limit) {
        items.pop();
        nextCursor = items[items.length - 1]!.id;
      }

      return { items, nextCursor };
    }),

  listDrafts: protectedProcedure
    .input(z.object({ orgId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireAdminOrOwner(input.orgId, ctx.userId);

      return db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts.orgId, input.orgId),
            isNull(posts.publishedAt)
          )
        )
        .orderBy(desc(posts.updatedAt));
    }),
});

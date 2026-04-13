import { z } from "zod";
import { and, eq, desc, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { posts } from "@social/schema";
import { memberships } from "@orgs/schema";
import { isPostAccessible } from "@social/lib/post-access";

async function requireOrgMembership(orgId: number, userId: string) {
  const membership = await db.query.memberships.findFirst({
    where: and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)),
  });
  if (!membership) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be a member of this organization",
    });
  }
}

export const postRouter = router({
  get: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const [post] = await db
        .select({
          id: posts.id,
          authorId: posts.authorId,
          type: posts.type,
          visibility: posts.visibility,
          visibilityOrgId: posts.visibilityOrgId,
          title: posts.title,
          body: posts.body,
          routineId: posts.routineId,
          publishedAt: posts.publishedAt,
          createdAt: posts.createdAt,
          updatedAt: posts.updatedAt,
          authorUsername: users.username,
          authorDisplayName: users.displayName,
          authorAvatarUrl: users.avatarUrl,
        })
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .where(eq(posts.id, input.id));

      if (!post) return null;

      const accessible = await isPostAccessible(post, ctx.userId);
      return accessible ? post : null;
    }),

  createArticle: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(200),
        body: z.string(),
        visibility: z.enum(["public", "followers", "organization"]).default("public"),
        visibilityOrgId: z.number().optional(),
        publish: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.visibility === "organization") {
        if (!input.visibilityOrgId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "visibilityOrgId is required when visibility is 'organization'",
          });
        }
        await requireOrgMembership(input.visibilityOrgId, ctx.userId);
      }
      const [post] = await db
        .insert(posts)
        .values({
          authorId: ctx.userId,
          type: "article",
          title: input.title,
          body: input.body,
          visibility: input.visibility,
          visibilityOrgId: input.visibility === "organization" ? input.visibilityOrgId! : null,
          publishedAt: input.publish ? new Date() : null,
        })
        .returning();
      return post;
    }),

  createRoutineShare: protectedProcedure
    .input(
      z.object({
        routineId: z.number(),
        body: z.string().max(1000).nullable(),
        visibility: z.enum(["public", "followers", "organization"]).default("public"),
        visibilityOrgId: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      if (input.visibility === "organization") {
        if (!input.visibilityOrgId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "visibilityOrgId is required when visibility is 'organization'",
          });
        }
        await requireOrgMembership(input.visibilityOrgId, ctx.userId);
      }
      const [post] = await db
        .insert(posts)
        .values({
          authorId: ctx.userId,
          type: "routine_share",
          body: input.body,
          routineId: input.routineId,
          visibility: input.visibility,
          visibilityOrgId: input.visibility === "organization" ? input.visibilityOrgId! : null,
          publishedAt: new Date(),
        })
        .returning();
      return post;
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        title: z.string().min(1).max(200).optional(),
        body: z.string().optional(),
        visibility: z.enum(["public", "followers", "organization"]).optional(),
        visibilityOrgId: z.number().nullable().optional(),
        publish: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, visibilityOrgId, publish, ...updates } = input;
      if (input.visibility === "organization") {
        if (visibilityOrgId === undefined || visibilityOrgId === null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "visibilityOrgId is required when visibility is 'organization'",
          });
        }
        await requireOrgMembership(visibilityOrgId, ctx.userId);
      }
      const setValues: Record<string, unknown> = {
        ...updates,
        updatedAt: new Date(),
      };
      if (input.visibility === "organization") {
        setValues.visibilityOrgId = visibilityOrgId;
      } else if (input.visibility) {
        setValues.visibilityOrgId = null;
      }
      if (publish) {
        setValues.publishedAt = new Date();
      }
      const [post] = await db
        .update(posts)
        .set(setValues)
        .where(and(eq(posts.id, id), eq(posts.authorId, ctx.userId)))
        .returning();
      return post ?? null;
    }),

  publish: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const [post] = await db
        .update(posts)
        .set({ publishedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(posts.id, input.id), eq(posts.authorId, ctx.userId)))
        .returning();
      return post ?? null;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      await db
        .delete(posts)
        .where(and(eq(posts.id, input.id), eq(posts.authorId, ctx.userId)));
      return { success: true };
    }),

  myDrafts: protectedProcedure.query(async ({ ctx }) => {
    return db
      .select()
      .from(posts)
      .where(
        and(
          eq(posts.authorId, ctx.userId),
          eq(posts.type, "article"),
          isNull(posts.publishedAt)
        )
      )
      .orderBy(desc(posts.updatedAt));
  }),
});

import { z } from "zod";
import { eq, and, ne, or, ilike, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { follows } from "@social/schema";

const COMPETITION_LEVELS = [
  "newcomer", "bronze", "silver", "gold", "novice", "prechamp", "champ", "professional",
] as const;

export const profileRouter = router({
  search: protectedProcedure
    .input(z.object({ query: z.string().min(1).max(50) }))
    .query(async ({ ctx, input }) => {
      const pattern = `%${input.query}%`;
      const results = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(users)
        .where(
          and(
            ne(users.id, ctx.userId),
            or(
              ilike(users.username, pattern),
              ilike(users.displayName, pattern)
            )
          )
        )
        .limit(20);

      return results;
    }),

  needsOnboarding: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db
      .select({ username: users.username })
      .from(users)
      .where(eq(users.id, ctx.userId));

    return { needsOnboarding: !user?.username };
  }),

  getByUsername: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const [user] = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          bio: users.bio,
          competitionLevel: users.competitionLevel,
          competitionLevelHigh: users.competitionLevelHigh,
          isPrivate: users.isPrivate,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(eq(users.username, input.username));

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const [followerCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(and(eq(follows.followingId, user.id), eq(follows.status, "active")));

      const [followingCount] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(follows)
        .where(and(eq(follows.followerId, user.id), eq(follows.status, "active")));

      return {
        ...user,
        followerCount: followerCount?.count ?? 0,
        followingCount: followingCount?.count ?? 0,
      };
    }),

  me: protectedProcedure.query(async ({ ctx }) => {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, ctx.userId));

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    return user;
  }),

  update: protectedProcedure
    .input(
      z.object({
        username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/).optional(),
        displayName: z.string().max(60).optional(),
        bio: z.string().max(500).optional(),
        competitionLevel: z.enum(COMPETITION_LEVELS).nullable().optional(),
        competitionLevelHigh: z.enum(COMPETITION_LEVELS).nullable().optional(),
        isPrivate: z.boolean().optional(),
        avatarUrl: z.string().url().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate username uniqueness if changing
      if (input.username !== undefined) {
        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.username, input.username));

        if (existing && existing.id !== ctx.userId) {
          throw new TRPCError({ code: "CONFLICT", message: "Username already taken" });
        }
      }

      // Validate consecutive levels: competitionLevelHigh >= competitionLevel
      if (input.competitionLevel && input.competitionLevelHigh) {
        const lowIdx = COMPETITION_LEVELS.indexOf(input.competitionLevel);
        const highIdx = COMPETITION_LEVELS.indexOf(input.competitionLevelHigh);
        if (highIdx < lowIdx) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "competitionLevelHigh must be greater than or equal to competitionLevel",
          });
        }
      }

      const [updated] = await db
        .update(users)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(users.id, ctx.userId))
        .returning();

      return updated;
    }),

  followers: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, input.username));

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const result = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(follows)
        .innerJoin(users, eq(users.id, follows.followerId))
        .where(and(eq(follows.followingId, target.id), eq(follows.status, "active")));

      return result;
    }),

  following: publicProcedure
    .input(z.object({ username: z.string() }))
    .query(async ({ input }) => {
      const [target] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.username, input.username));

      if (!target) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const result = await db
        .select({
          id: users.id,
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
        })
        .from(follows)
        .innerJoin(users, eq(users.id, follows.followingId))
        .where(and(eq(follows.followerId, target.id), eq(follows.status, "active")));

      return result;
    }),
});

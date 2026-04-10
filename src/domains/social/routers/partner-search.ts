import { z } from "zod";
import { eq, and, lt, desc, ilike, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { users } from "@shared/schema";
import { partnerSearchProfiles } from "@social/schema";

const DANCE_STYLES = ["standard", "smooth", "latin", "rhythm", "nightclub"] as const;
const ROLE_PREFERENCES = ["lead", "follow", "both"] as const;

const upsertInput = z.object({
  danceStyles: z.array(z.enum(DANCE_STYLES)).min(1, "Select at least one dance style"),
  height: z.string().max(30).optional(),
  location: z.string().max(100).optional(),
  bio: z.string().max(500).optional(),
  rolePreference: z.enum(ROLE_PREFERENCES),
});

export const partnerSearchRouter = router({
  /** Get the current user's partner search profile (null if not searching) */
  me: protectedProcedure.query(async ({ ctx }) => {
    const [profile] = await db
      .select()
      .from(partnerSearchProfiles)
      .where(eq(partnerSearchProfiles.userId, ctx.userId));

    return profile ?? null;
  }),

  /** Get a user's partner search profile by userId (public — for viewing profiles) */
  getByUserId: publicProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ input }) => {
      const [profile] = await db
        .select()
        .from(partnerSearchProfiles)
        .where(eq(partnerSearchProfiles.userId, input.userId));

      return profile ?? null;
    }),

  /** Enable or update partner search profile */
  upsert: protectedProcedure
    .input(upsertInput)
    .mutation(async ({ ctx, input }) => {
      const [profile] = await db
        .insert(partnerSearchProfiles)
        .values({
          userId: ctx.userId,
          danceStyles: input.danceStyles,
          height: input.height ?? null,
          location: input.location ?? null,
          bio: input.bio ?? null,
          rolePreference: input.rolePreference,
        })
        .onConflictDoUpdate({
          target: partnerSearchProfiles.userId,
          set: {
            danceStyles: input.danceStyles,
            height: input.height ?? null,
            location: input.location ?? null,
            bio: input.bio ?? null,
            rolePreference: input.rolePreference,
            updatedAt: new Date(),
          },
        })
        .returning();

      return profile;
    }),

  /** Disable partner search (remove profile) */
  remove: protectedProcedure.mutation(async ({ ctx }) => {
    const [deleted] = await db
      .delete(partnerSearchProfiles)
      .where(eq(partnerSearchProfiles.userId, ctx.userId))
      .returning();

    if (!deleted) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No partner search profile to remove",
      });
    }

    return { success: true };
  }),

  /** Browse partner seekers with optional filters */
  discover: protectedProcedure
    .input(
      z.object({
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
        style: z.enum(DANCE_STYLES).optional(),
        rolePreference: z.enum(ROLE_PREFERENCES).optional(),
        location: z.string().max(100).optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { cursor, limit, style, rolePreference, location } = input;

      const conditions = [
        // Exclude current user from discovery results
        sql`${partnerSearchProfiles.userId} != ${ctx.userId}`,
      ];

      if (style) {
        conditions.push(sql`${style} = ANY(${partnerSearchProfiles.danceStyles})`);
      }

      if (rolePreference) {
        conditions.push(eq(partnerSearchProfiles.rolePreference, rolePreference));
      }

      if (location) {
        conditions.push(ilike(partnerSearchProfiles.location, `%${location}%`));
      }

      if (cursor) {
        conditions.push(sql`${partnerSearchProfiles.userId} < ${cursor}`);
      }

      const results = await db
        .select({
          userId: partnerSearchProfiles.userId,
          danceStyles: partnerSearchProfiles.danceStyles,
          height: partnerSearchProfiles.height,
          location: partnerSearchProfiles.location,
          bio: partnerSearchProfiles.bio,
          rolePreference: partnerSearchProfiles.rolePreference,
          updatedAt: partnerSearchProfiles.updatedAt,
          // Join user info
          username: users.username,
          displayName: users.displayName,
          avatarUrl: users.avatarUrl,
          competitionLevel: users.competitionLevel,
          competitionLevelHigh: users.competitionLevelHigh,
        })
        .from(partnerSearchProfiles)
        .innerJoin(users, eq(users.id, partnerSearchProfiles.userId))
        .where(and(...conditions))
        .orderBy(desc(partnerSearchProfiles.updatedAt))
        .limit(limit + 1);

      const hasMore = results.length > limit;
      const items = hasMore ? results.slice(0, limit) : results;

      return {
        items,
        nextCursor: hasMore ? items[items.length - 1]?.userId : undefined,
      };
    }),
});

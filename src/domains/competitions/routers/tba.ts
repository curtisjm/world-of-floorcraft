import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { tbaListings } from "@competitions/schema";
import { users } from "@shared/schema";

export const tbaRouter = router({
  listByCompetition: publicProcedure
    .input(
      z.object({
        competitionId: z.number(),
        style: z.enum(["standard", "smooth", "latin", "rhythm", "nightclub"]).optional(),
        level: z
          .enum(["newcomer", "bronze", "silver", "gold", "novice", "prechamp", "champ", "professional"])
          .optional(),
        role: z.enum(["leader", "follower"]).optional(),
      }),
    )
    .query(async ({ input }) => {
      const conditions = [
        eq(tbaListings.competitionId, input.competitionId),
        eq(tbaListings.fulfilled, false),
      ];
      if (input.style) conditions.push(eq(tbaListings.style, input.style));
      if (input.level) conditions.push(eq(tbaListings.level, input.level));
      if (input.role) conditions.push(eq(tbaListings.role, input.role));

      const listings = await db
        .select({
          id: tbaListings.id,
          style: tbaListings.style,
          level: tbaListings.level,
          role: tbaListings.role,
          notes: tbaListings.notes,
          createdAt: tbaListings.createdAt,
          displayName: users.displayName,
          username: users.username,
        })
        .from(tbaListings)
        .innerJoin(users, eq(users.id, tbaListings.userId))
        .where(and(...conditions));

      return listings;
    }),

  create: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        style: z.enum(["standard", "smooth", "latin", "rhythm", "nightclub"]),
        level: z.enum(["newcomer", "bronze", "silver", "gold", "novice", "prechamp", "champ", "professional"]),
        role: z.enum(["leader", "follower"]),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [listing] = await db
        .insert(tbaListings)
        .values({
          competitionId: input.competitionId,
          userId: ctx.userId,
          style: input.style,
          level: input.level,
          role: input.role,
          notes: input.notes,
        })
        .returning();

      return listing;
    }),

  markFulfilled: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await db.query.tbaListings.findFirst({
        where: eq(tbaListings.id, input.listingId),
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
      if (listing.userId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Can only update your own listing" });
      }

      const [updated] = await db
        .update(tbaListings)
        .set({ fulfilled: true })
        .where(eq(tbaListings.id, input.listingId))
        .returning();

      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ listingId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const listing = await db.query.tbaListings.findFirst({
        where: eq(tbaListings.id, input.listingId),
      });
      if (!listing) throw new TRPCError({ code: "NOT_FOUND", message: "Listing not found" });
      if (listing.userId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Can only delete your own listing" });
      }

      await db.delete(tbaListings).where(eq(tbaListings.id, input.listingId));
      return { success: true };
    }),
});

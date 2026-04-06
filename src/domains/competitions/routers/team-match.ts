import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import { teamMatchSubmissions } from "@competitions/schema";
import { users } from "@shared/schema";
import { requireCompStaffRole } from "@competitions/lib/auth";

export const teamMatchRouter = router({
  listByCompetition: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompStaffRole(input.competitionId, ctx.userId, []);

      const submissions = await db
        .select({
          id: teamMatchSubmissions.id,
          content: teamMatchSubmissions.content,
          createdAt: teamMatchSubmissions.createdAt,
          displayName: users.displayName,
          username: users.username,
        })
        .from(teamMatchSubmissions)
        .innerJoin(users, eq(users.id, teamMatchSubmissions.userId))
        .where(eq(teamMatchSubmissions.competitionId, input.competitionId))
        .orderBy(desc(teamMatchSubmissions.createdAt));

      return submissions;
    }),

  submit: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        content: z.string().min(1).max(2000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [submission] = await db
        .insert(teamMatchSubmissions)
        .values({
          competitionId: input.competitionId,
          userId: ctx.userId,
          content: input.content,
        })
        .returning();

      return submission;
    }),

  delete: protectedProcedure
    .input(z.object({ submissionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const submission = await db.query.teamMatchSubmissions.findFirst({
        where: eq(teamMatchSubmissions.id, input.submissionId),
      });
      if (!submission) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Submission not found" });
      }
      if (submission.userId !== ctx.userId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Can only delete your own submission" });
      }

      await db.delete(teamMatchSubmissions).where(eq(teamMatchSubmissions.id, input.submissionId));
      return { success: true };
    }),
});

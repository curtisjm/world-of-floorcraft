import { z } from "zod";
import { eq, and, asc, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "@shared/auth/trpc";
import { db } from "@shared/db";
import {
  competitions,
  feedbackForms,
  feedbackQuestions,
  feedbackResponses,
  feedbackAnswers,
} from "@competitions/schema";
import { requireCompOrgRole } from "@competitions/lib/auth";
import { users } from "@shared/schema";

// Default feedback template questions
const DEFAULT_QUESTIONS = [
  { questionType: "rating" as const, label: "How would you rate your overall experience?", required: true, position: 0 },
  { questionType: "rating" as const, label: "How would you rate the venue?", required: true, position: 1 },
  { questionType: "rating" as const, label: "How would you rate the organization and scheduling?", required: true, position: 2 },
  { questionType: "rating" as const, label: "How would you rate the judging quality?", required: true, position: 3 },
  { questionType: "yes_no" as const, label: "Would you attend this competition again?", required: true, position: 4 },
  { questionType: "text" as const, label: "Any additional comments or suggestions?", required: false, position: 5 },
];

export const feedbackRouter = router({
  // ── Get feedback form (public, but only if comp is finished) ────
  getForm: publicProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ input }) => {
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, input.competitionId),
      });
      if (!comp) throw new TRPCError({ code: "NOT_FOUND", message: "Competition not found" });
      if (comp.status !== "finished") return null;

      const form = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.competitionId, input.competitionId),
      });
      if (!form) return null;

      const questions = await db.query.feedbackQuestions.findMany({
        where: eq(feedbackQuestions.formId, form.id),
        orderBy: asc(feedbackQuestions.position),
      });

      return { ...form, questions };
    }),

  // ── Get current user's response ─────────────────────────────────
  getMyResponse: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      const form = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.competitionId, input.competitionId),
      });
      if (!form) return null;

      const response = await db.query.feedbackResponses.findFirst({
        where: and(
          eq(feedbackResponses.formId, form.id),
          eq(feedbackResponses.userId, ctx.userId),
        ),
      });
      if (!response) return null;

      const answers = await db.query.feedbackAnswers.findMany({
        where: eq(feedbackAnswers.responseId, response.id),
      });

      return { ...response, answers };
    }),

  // ── Get all responses (org admin) ───────────────────────────────
  getResponses: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const form = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.competitionId, input.competitionId),
      });
      if (!form) return { form: null, responses: [] };

      const responses = await db.query.feedbackResponses.findMany({
        where: eq(feedbackResponses.formId, form.id),
      });

      const enriched = await Promise.all(
        responses.map(async (r) => {
          const answers = await db.query.feedbackAnswers.findMany({
            where: eq(feedbackAnswers.responseId, r.id),
          });
          const user = await db.query.users.findFirst({
            where: eq(users.id, r.userId),
          });
          return { ...r, userName: user?.displayName ?? null, answers };
        }),
      );

      return { form, responses: enriched };
    }),

  // ── Analytics (org admin) ───────────────────────────────────────
  getAnalytics: protectedProcedure
    .input(z.object({ competitionId: z.number() }))
    .query(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      const form = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.competitionId, input.competitionId),
      });
      if (!form) return null;

      const questions = await db.query.feedbackQuestions.findMany({
        where: eq(feedbackQuestions.formId, form.id),
        orderBy: asc(feedbackQuestions.position),
      });

      const responses = await db.query.feedbackResponses.findMany({
        where: eq(feedbackResponses.formId, form.id),
      });

      const allAnswers: { questionId: number; value: string }[] = [];
      for (const response of responses) {
        const answers = await db.query.feedbackAnswers.findMany({
          where: eq(feedbackAnswers.responseId, response.id),
        });
        allAnswers.push(...answers.map((a) => ({ questionId: a.questionId, value: a.value })));
      }

      // Build per-question analytics
      const questionAnalytics = questions.map((q) => {
        const answers = allAnswers.filter((a) => a.questionId === q.id);

        if (q.questionType === "rating") {
          const values = answers.map((a) => parseInt(a.value, 10)).filter((v) => !isNaN(v));
          const distribution = [0, 0, 0, 0, 0]; // 1-5
          for (const v of values) {
            if (v >= 1 && v <= 5) distribution[v - 1]!++;
          }
          return {
            questionId: q.id,
            label: q.label,
            type: q.questionType,
            average: values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null,
            distribution,
            count: values.length,
          };
        }

        if (q.questionType === "yes_no") {
          const yesCount = answers.filter((a) => a.value === "true").length;
          const noCount = answers.filter((a) => a.value === "false").length;
          return {
            questionId: q.id,
            label: q.label,
            type: q.questionType,
            yesCount,
            noCount,
            percentage: yesCount + noCount > 0 ? (yesCount / (yesCount + noCount)) * 100 : null,
            count: yesCount + noCount,
          };
        }

        if (q.questionType === "multiple_choice") {
          const optionCounts: Record<string, number> = {};
          for (const opt of q.options ?? []) {
            optionCounts[opt] = 0;
          }
          for (const a of answers) {
            optionCounts[a.value] = (optionCounts[a.value] ?? 0) + 1;
          }
          return {
            questionId: q.id,
            label: q.label,
            type: q.questionType,
            optionCounts,
            count: answers.length,
          };
        }

        // text
        return {
          questionId: q.id,
          label: q.label,
          type: q.questionType,
          answers: answers.map((a) => a.value),
          count: answers.length,
        };
      });

      return {
        totalResponses: responses.length,
        questions: questionAnalytics,
      };
    }),

  // ── Create feedback form (org admin) ────────────────────────────
  createForm: protectedProcedure
    .input(
      z.object({
        competitionId: z.number(),
        title: z.string().optional(),
        description: z.string().optional(),
        useTemplate: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requireCompOrgRole(input.competitionId, ctx.userId);

      // Check no form exists yet
      const existing = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.competitionId, input.competitionId),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Feedback form already exists for this competition" });
      }

      const [form] = await db
        .insert(feedbackForms)
        .values({
          competitionId: input.competitionId,
          title: input.title ?? "Competition Feedback",
          description: input.description ?? null,
        })
        .returning();

      if (input.useTemplate) {
        for (const q of DEFAULT_QUESTIONS) {
          await db.insert(feedbackQuestions).values({
            formId: form!.id,
            questionType: q.questionType,
            label: q.label,
            required: q.required,
            position: q.position,
          });
        }
      }

      return form;
    }),

  // ── Update form title/description ───────────────────────────────
  updateForm: protectedProcedure
    .input(
      z.object({
        formId: z.number(),
        title: z.string().optional(),
        description: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const form = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.id, input.formId),
      });
      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });

      await requireCompOrgRole(form.competitionId, ctx.userId);

      const updates: Partial<typeof feedbackForms.$inferInsert> = {};
      if (input.title !== undefined) updates.title = input.title;
      if (input.description !== undefined) updates.description = input.description;
      updates.updatedAt = new Date();

      const [updated] = await db
        .update(feedbackForms)
        .set(updates)
        .where(eq(feedbackForms.id, input.formId))
        .returning();

      return updated;
    }),

  // ── Add question ────────────────────────────────────────────────
  addQuestion: protectedProcedure
    .input(
      z.object({
        formId: z.number(),
        questionType: z.enum(["text", "rating", "multiple_choice", "yes_no"]),
        label: z.string(),
        options: z.array(z.string()).optional(),
        required: z.boolean().default(false),
        position: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const form = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.id, input.formId),
      });
      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });

      await requireCompOrgRole(form.competitionId, ctx.userId);

      const [question] = await db
        .insert(feedbackQuestions)
        .values({
          formId: input.formId,
          questionType: input.questionType,
          label: input.label,
          options: input.options ?? null,
          required: input.required,
          position: input.position,
        })
        .returning();

      return question;
    }),

  // ── Update question ─────────────────────────────────────────────
  updateQuestion: protectedProcedure
    .input(
      z.object({
        questionId: z.number(),
        label: z.string().optional(),
        options: z.array(z.string()).optional(),
        required: z.boolean().optional(),
        position: z.number().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const question = await db.query.feedbackQuestions.findFirst({
        where: eq(feedbackQuestions.id, input.questionId),
      });
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });

      const form = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.id, question.formId),
      });
      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });

      await requireCompOrgRole(form.competitionId, ctx.userId);

      const updates: Partial<typeof feedbackQuestions.$inferInsert> = {};
      if (input.label !== undefined) updates.label = input.label;
      if (input.options !== undefined) updates.options = input.options;
      if (input.required !== undefined) updates.required = input.required;
      if (input.position !== undefined) updates.position = input.position;

      const [updated] = await db
        .update(feedbackQuestions)
        .set(updates)
        .where(eq(feedbackQuestions.id, input.questionId))
        .returning();

      return updated;
    }),

  // ── Remove question ─────────────────────────────────────────────
  removeQuestion: protectedProcedure
    .input(z.object({ questionId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const question = await db.query.feedbackQuestions.findFirst({
        where: eq(feedbackQuestions.id, input.questionId),
      });
      if (!question) throw new TRPCError({ code: "NOT_FOUND", message: "Question not found" });

      const form = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.id, question.formId),
      });
      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });

      await requireCompOrgRole(form.competitionId, ctx.userId);

      // Can't remove questions once responses exist
      const [responseCount] = await db
        .select({ count: count() })
        .from(feedbackResponses)
        .where(eq(feedbackResponses.formId, form.id));

      if (responseCount && responseCount.count > 0) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Cannot modify form after responses have been submitted",
        });
      }

      await db.delete(feedbackQuestions).where(eq(feedbackQuestions.id, input.questionId));
      return { success: true };
    }),

  // ── Submit feedback response ────────────────────────────────────
  submitResponse: protectedProcedure
    .input(
      z.object({
        formId: z.number(),
        answers: z.array(
          z.object({
            questionId: z.number(),
            value: z.string(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const form = await db.query.feedbackForms.findFirst({
        where: eq(feedbackForms.id, input.formId),
      });
      if (!form) throw new TRPCError({ code: "NOT_FOUND", message: "Form not found" });

      // Verify competition is finished
      const comp = await db.query.competitions.findFirst({
        where: eq(competitions.id, form.competitionId),
      });
      if (!comp || comp.status !== "finished") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Competition must be finished to submit feedback" });
      }

      // Check user hasn't already submitted
      const existing = await db.query.feedbackResponses.findFirst({
        where: and(
          eq(feedbackResponses.formId, input.formId),
          eq(feedbackResponses.userId, ctx.userId),
        ),
      });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "You have already submitted feedback" });
      }

      // Validate required questions
      const questions = await db.query.feedbackQuestions.findMany({
        where: eq(feedbackQuestions.formId, input.formId),
      });
      const answerMap = new Map(input.answers.map((a) => [a.questionId, a.value]));
      for (const q of questions) {
        if (q.required && !answerMap.has(q.id)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Required question "${q.label}" must be answered`,
          });
        }
      }

      // Create response + answers
      const [response] = await db
        .insert(feedbackResponses)
        .values({
          formId: input.formId,
          userId: ctx.userId,
        })
        .returning();

      if (input.answers.length > 0) {
        await db.insert(feedbackAnswers).values(
          input.answers.map((a) => ({
            responseId: response!.id,
            questionId: a.questionId,
            value: a.value,
          })),
        );
      }

      return response;
    }),
});

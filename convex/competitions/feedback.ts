import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { getCurrentUser } from "../lib/auth";
import { badRequest, forbidden, notFound } from "../lib/errors";
import { requireCompOrgRole } from "../lib/permissions";
import { feedbackQuestionType } from "../schema";

/**
 * Post-competition feedback forms — ported from
 * `src/domains/competitions/routers/feedback.ts`.
 *
 * Forms live per-competition with ordered questions and a default template
 * that organizers can opt into when creating the form. Responses are
 * one-per-user-per-form, and only competitions in `finished` status can
 * receive responses.
 */

const DEFAULT_QUESTIONS: Array<{
  questionType: Doc<"feedbackQuestions">["questionType"];
  label: string;
  required: boolean;
  position: number;
}> = [
  {
    questionType: "rating",
    label: "How would you rate your overall experience?",
    required: true,
    position: 0,
  },
  {
    questionType: "rating",
    label: "How would you rate the venue?",
    required: true,
    position: 1,
  },
  {
    questionType: "rating",
    label: "How would you rate the organization and scheduling?",
    required: true,
    position: 2,
  },
  {
    questionType: "rating",
    label: "How would you rate the judging quality?",
    required: true,
    position: 3,
  },
  {
    questionType: "yes_no",
    label: "Would you attend this competition again?",
    required: true,
    position: 4,
  },
  {
    questionType: "text",
    label: "Any additional comments or suggestions?",
    required: false,
    position: 5,
  },
];

export const getForm = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const comp = await ctx.db.get(args.competitionId);
    if (!comp) notFound("Competition not found");
    if (comp.status !== "finished") return null;

    const form = await ctx.db
      .query("feedbackForms")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .unique();
    if (!form) return null;

    const questions = await ctx.db
      .query("feedbackQuestions")
      .withIndex("by_form_position", (q) => q.eq("formId", form._id))
      .collect();
    questions.sort((a, b) => a.position - b.position);

    return { ...form, questions };
  },
});

export const getMyResponse = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const form = await ctx.db
      .query("feedbackForms")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .unique();
    if (!form) return null;

    const response = await ctx.db
      .query("feedbackResponses")
      .withIndex("by_form_user", (q) =>
        q.eq("formId", form._id).eq("userId", user._id),
      )
      .unique();
    if (!response) return null;

    const answers = await ctx.db
      .query("feedbackAnswers")
      .withIndex("by_response_question", (q) =>
        q.eq("responseId", response._id),
      )
      .collect();
    return { ...response, answers };
  },
});

export const getResponses = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    const form = await ctx.db
      .query("feedbackForms")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .unique();
    if (!form) return { form: null, responses: [] };

    const responses = await ctx.db
      .query("feedbackResponses")
      .withIndex("by_form_user", (q) => q.eq("formId", form._id))
      .collect();

    const enriched = await Promise.all(
      responses.map(async (r) => {
        const answers = await ctx.db
          .query("feedbackAnswers")
          .withIndex("by_response_question", (q) =>
            q.eq("responseId", r._id),
          )
          .collect();
        const user = await ctx.db.get(r.userId);
        return { ...r, userName: user?.displayName ?? null, answers };
      }),
    );

    return { form, responses: enriched };
  },
});

export const getAnalytics = query({
  args: { competitionId: v.id("competitions") },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);

    const form = await ctx.db
      .query("feedbackForms")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .unique();
    if (!form) return null;

    const questions = await ctx.db
      .query("feedbackQuestions")
      .withIndex("by_form_position", (q) => q.eq("formId", form._id))
      .collect();
    questions.sort((a, b) => a.position - b.position);

    const responses = await ctx.db
      .query("feedbackResponses")
      .withIndex("by_form_user", (q) => q.eq("formId", form._id))
      .collect();

    const allAnswers: Array<{ questionId: Doc<"feedbackAnswers">["questionId"]; value: string }> = [];
    for (const response of responses) {
      const answers = await ctx.db
        .query("feedbackAnswers")
        .withIndex("by_response_question", (q) =>
          q.eq("responseId", response._id),
        )
        .collect();
      allAnswers.push(
        ...answers.map((a) => ({ questionId: a.questionId, value: a.value })),
      );
    }

    const questionAnalytics = questions.map((q) => {
      const answers = allAnswers.filter((a) => a.questionId === q._id);
      if (q.questionType === "rating") {
        const values = answers
          .map((a) => parseInt(a.value, 10))
          .filter((v) => !isNaN(v));
        const distribution = [0, 0, 0, 0, 0];
        for (const v of values) {
          if (v >= 1 && v <= 5) distribution[v - 1]!++;
        }
        return {
          questionId: q._id,
          label: q.label,
          type: q.questionType,
          average:
            values.length > 0
              ? values.reduce((a, b) => a + b, 0) / values.length
              : null,
          distribution,
          count: values.length,
        };
      }
      if (q.questionType === "yes_no") {
        const yesCount = answers.filter((a) => a.value === "true").length;
        const noCount = answers.filter((a) => a.value === "false").length;
        return {
          questionId: q._id,
          label: q.label,
          type: q.questionType,
          yesCount,
          noCount,
          percentage:
            yesCount + noCount > 0
              ? (yesCount / (yesCount + noCount)) * 100
              : null,
          count: yesCount + noCount,
        };
      }
      if (q.questionType === "multiple_choice") {
        const optionCounts: Record<string, number> = {};
        for (const opt of q.options ?? []) optionCounts[opt] = 0;
        for (const a of answers) {
          optionCounts[a.value] = (optionCounts[a.value] ?? 0) + 1;
        }
        return {
          questionId: q._id,
          label: q.label,
          type: q.questionType,
          optionCounts,
          count: answers.length,
        };
      }
      return {
        questionId: q._id,
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
  },
});

export const createForm = mutation({
  args: {
    competitionId: v.id("competitions"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    useTemplate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireCompOrgRole(ctx, args.competitionId);
    const existing = await ctx.db
      .query("feedbackForms")
      .withIndex("by_competition", (q) =>
        q.eq("competitionId", args.competitionId),
      )
      .unique();
    if (existing) {
      forbidden("Feedback form already exists for this competition");
    }
    const now = Date.now();
    const formId = await ctx.db.insert("feedbackForms", {
      competitionId: args.competitionId,
      title: args.title ?? "Competition Feedback",
      description: args.description,
      createdAt: now,
      updatedAt: now,
    });
    const useTemplate = args.useTemplate ?? true;
    if (useTemplate) {
      for (const q of DEFAULT_QUESTIONS) {
        await ctx.db.insert("feedbackQuestions", {
          formId,
          questionType: q.questionType,
          label: q.label,
          required: q.required,
          position: q.position,
        });
      }
    }
    return await ctx.db.get(formId);
  },
});

export const updateForm = mutation({
  args: {
    formId: v.id("feedbackForms"),
    title: v.optional(v.string()),
    description: v.optional(v.union(v.string(), v.null())),
  },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) notFound("Form not found");
    await requireCompOrgRole(ctx, form.competitionId);
    const patch: Partial<Doc<"feedbackForms">> = { updatedAt: Date.now() };
    if (args.title !== undefined) patch.title = args.title;
    if (args.description !== undefined) {
      patch.description = args.description ?? undefined;
    }
    await ctx.db.patch(args.formId, patch);
    return await ctx.db.get(args.formId);
  },
});

export const addQuestion = mutation({
  args: {
    formId: v.id("feedbackForms"),
    questionType: feedbackQuestionType,
    label: v.string(),
    options: v.optional(v.array(v.string())),
    required: v.optional(v.boolean()),
    position: v.number(),
  },
  handler: async (ctx, args) => {
    const form = await ctx.db.get(args.formId);
    if (!form) notFound("Form not found");
    await requireCompOrgRole(ctx, form.competitionId);
    const id = await ctx.db.insert("feedbackQuestions", {
      formId: args.formId,
      questionType: args.questionType,
      label: args.label,
      options: args.options,
      required: args.required ?? false,
      position: args.position,
    });
    return await ctx.db.get(id);
  },
});

export const updateQuestion = mutation({
  args: {
    questionId: v.id("feedbackQuestions"),
    label: v.optional(v.string()),
    options: v.optional(v.array(v.string())),
    required: v.optional(v.boolean()),
    position: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) notFound("Question not found");
    const form = await ctx.db.get(question.formId);
    if (!form) notFound("Form not found");
    await requireCompOrgRole(ctx, form.competitionId);

    const patch: Partial<Doc<"feedbackQuestions">> = {};
    if (args.label !== undefined) patch.label = args.label;
    if (args.options !== undefined) patch.options = args.options;
    if (args.required !== undefined) patch.required = args.required;
    if (args.position !== undefined) patch.position = args.position;
    await ctx.db.patch(args.questionId, patch);
    return await ctx.db.get(args.questionId);
  },
});

export const removeQuestion = mutation({
  args: { questionId: v.id("feedbackQuestions") },
  handler: async (ctx, args) => {
    const question = await ctx.db.get(args.questionId);
    if (!question) notFound("Question not found");
    const form = await ctx.db.get(question.formId);
    if (!form) notFound("Form not found");
    await requireCompOrgRole(ctx, form.competitionId);

    const responses = await ctx.db
      .query("feedbackResponses")
      .withIndex("by_form_user", (q) => q.eq("formId", form._id))
      .collect();
    if (responses.length > 0) {
      forbidden("Cannot modify form after responses have been submitted");
    }
    await ctx.db.delete(args.questionId);
    return { success: true };
  },
});

export const submitResponse = mutation({
  args: {
    formId: v.id("feedbackForms"),
    answers: v.array(
      v.object({
        questionId: v.id("feedbackQuestions"),
        value: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    const form = await ctx.db.get(args.formId);
    if (!form) notFound("Form not found");
    const comp = await ctx.db.get(form.competitionId);
    if (!comp || comp.status !== "finished") {
      forbidden("Competition must be finished to submit feedback");
    }
    const existing = await ctx.db
      .query("feedbackResponses")
      .withIndex("by_form_user", (q) =>
        q.eq("formId", args.formId).eq("userId", user._id),
      )
      .unique();
    if (existing) {
      forbidden("You have already submitted feedback");
    }
    const questions = await ctx.db
      .query("feedbackQuestions")
      .withIndex("by_form_position", (q) => q.eq("formId", args.formId))
      .collect();
    const answered = new Set(args.answers.map((a) => a.questionId));
    for (const q of questions) {
      if (q.required && !answered.has(q._id)) {
        badRequest(`Required question "${q.label}" must be answered`);
      }
    }
    const responseId = await ctx.db.insert("feedbackResponses", {
      formId: args.formId,
      userId: user._id,
      submittedAt: Date.now(),
    });
    for (const a of args.answers) {
      await ctx.db.insert("feedbackAnswers", {
        responseId,
        questionId: a.questionId,
        value: a.value,
      });
    }
    return await ctx.db.get(responseId);
  },
});

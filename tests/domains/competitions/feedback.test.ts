import { describe, it, expect, beforeEach } from "vitest";
import {
  createCaller,
  createPublicCaller,
  createUser,
  createOrg,
  truncateAll,
} from "../../setup/helpers";

describe("feedback router", () => {
  let ownerId: string;
  let compId: number;
  let ownerCaller: ReturnType<typeof createCaller>;

  beforeEach(async () => {
    await truncateAll();
    const owner = await createUser();
    ownerId = owner.id;
    const org = await createOrg(ownerId);
    ownerCaller = createCaller(ownerId);

    const comp = await ownerCaller.competition.create({
      name: "Feedback Test Comp",
      orgId: org.id,
    });
    compId = comp.id;
  });

  // ── createForm ────────────────────────────────────────────────

  describe("createForm", () => {
    it("creates a form with default template", async () => {
      const form = await ownerCaller.feedback.createForm({
        competitionId: compId,
        useTemplate: true,
      });

      expect(form).toBeDefined();
      expect(form!.competitionId).toBe(compId);
      expect(form!.title).toBe("Competition Feedback");
    });

    it("creates a form without template", async () => {
      const form = await ownerCaller.feedback.createForm({
        competitionId: compId,
        useTemplate: false,
        title: "Custom Form",
      });

      expect(form!.title).toBe("Custom Form");
    });

    it("prevents duplicate forms", async () => {
      await ownerCaller.feedback.createForm({ competitionId: compId });

      await expect(
        ownerCaller.feedback.createForm({ competitionId: compId }),
      ).rejects.toThrow("already exists");
    });

    it("rejects non-org-admin", async () => {
      const random = await createUser();
      const randomCaller = createCaller(random.id);

      await expect(
        randomCaller.feedback.createForm({ competitionId: compId }),
      ).rejects.toThrow();
    });
  });

  // ── getForm ───────────────────────────────────────────────────

  describe("getForm", () => {
    it("returns null when comp is not finished", async () => {
      await ownerCaller.feedback.createForm({ competitionId: compId });

      const caller = createPublicCaller();
      const form = await caller.feedback.getForm({ competitionId: compId });
      expect(form).toBeNull();
    });

    it("returns form with questions when comp is finished", async () => {
      await ownerCaller.feedback.createForm({ competitionId: compId });
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      const caller = createPublicCaller();
      const form = await caller.feedback.getForm({ competitionId: compId });

      expect(form).toBeDefined();
      expect(form!.questions.length).toBe(6); // Default template has 6 questions
    });

    it("returns null when no form exists", async () => {
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      const caller = createPublicCaller();
      const form = await caller.feedback.getForm({ competitionId: compId });
      expect(form).toBeNull();
    });
  });

  // ── Question management ───────────────────────────────────────

  describe("question management", () => {
    it("adds a custom question", async () => {
      const form = await ownerCaller.feedback.createForm({
        competitionId: compId,
        useTemplate: false,
      });

      const question = await ownerCaller.feedback.addQuestion({
        formId: form!.id,
        questionType: "multiple_choice",
        label: "Favorite style?",
        options: ["Standard", "Latin", "Smooth", "Rhythm"],
        required: false,
        position: 0,
      });

      expect(question!.label).toBe("Favorite style?");
      expect(question!.options).toEqual(["Standard", "Latin", "Smooth", "Rhythm"]);
    });

    it("updates a question", async () => {
      const form = await ownerCaller.feedback.createForm({
        competitionId: compId,
        useTemplate: false,
      });
      const question = await ownerCaller.feedback.addQuestion({
        formId: form!.id,
        questionType: "text",
        label: "Original",
        position: 0,
      });

      const updated = await ownerCaller.feedback.updateQuestion({
        questionId: question!.id,
        label: "Updated label",
      });

      expect(updated!.label).toBe("Updated label");
    });

    it("removes a question (no responses yet)", async () => {
      const form = await ownerCaller.feedback.createForm({
        competitionId: compId,
        useTemplate: false,
      });
      const question = await ownerCaller.feedback.addQuestion({
        formId: form!.id,
        questionType: "text",
        label: "Removable",
        position: 0,
      });

      const result = await ownerCaller.feedback.removeQuestion({
        questionId: question!.id,
      });
      expect(result.success).toBe(true);
    });

    it("prevents removing questions after responses exist", async () => {
      const form = await ownerCaller.feedback.createForm({ competitionId: compId });
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      // Get questions
      const publicCaller = createPublicCaller();
      const formData = await publicCaller.feedback.getForm({ competitionId: compId });
      const questionId = formData!.questions[0]!.id;

      // Submit a response
      const competitor = await createUser();
      const competitorCaller = createCaller(competitor.id);
      await competitorCaller.feedback.submitResponse({
        formId: form!.id,
        answers: formData!.questions
          .filter((q) => q.required)
          .map((q) => ({
            questionId: q.id,
            value: q.questionType === "yes_no" ? "true" : "5",
          })),
      });

      // Try to remove question
      await expect(
        ownerCaller.feedback.removeQuestion({ questionId }),
      ).rejects.toThrow("responses have been submitted");
    });
  });

  // ── submitResponse ────────────────────────────────────────────

  describe("submitResponse", () => {
    it("submits feedback for a finished competition", async () => {
      const form = await ownerCaller.feedback.createForm({ competitionId: compId });
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      const publicCaller = createPublicCaller();
      const formData = await publicCaller.feedback.getForm({ competitionId: compId });

      const competitor = await createUser();
      const competitorCaller = createCaller(competitor.id);

      const response = await competitorCaller.feedback.submitResponse({
        formId: form!.id,
        answers: formData!.questions
          .filter((q) => q.required)
          .map((q) => ({
            questionId: q.id,
            value: q.questionType === "yes_no" ? "true" : q.questionType === "rating" ? "4" : "Great comp!",
          })),
      });

      expect(response).toBeDefined();
    });

    it("prevents double submission", async () => {
      // Use a form WITHOUT template so there are no required questions
      const form = await ownerCaller.feedback.createForm({
        competitionId: compId,
        useTemplate: false,
      });
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      const competitor = await createUser();
      const competitorCaller = createCaller(competitor.id);

      await competitorCaller.feedback.submitResponse({
        formId: form!.id,
        answers: [],
      });

      await expect(
        competitorCaller.feedback.submitResponse({
          formId: form!.id,
          answers: [],
        }),
      ).rejects.toThrow("already submitted");
    });

    it("rejects submission before comp is finished", async () => {
      const form = await ownerCaller.feedback.createForm({ competitionId: compId });

      const competitor = await createUser();
      const competitorCaller = createCaller(competitor.id);

      await expect(
        competitorCaller.feedback.submitResponse({
          formId: form!.id,
          answers: [],
        }),
      ).rejects.toThrow("must be finished");
    });
  });

  // ── getMyResponse ─────────────────────────────────────────���───

  describe("getMyResponse", () => {
    it("returns null when no response submitted", async () => {
      await ownerCaller.feedback.createForm({ competitionId: compId });
      const competitor = await createUser();
      const competitorCaller = createCaller(competitor.id);

      const result = await competitorCaller.feedback.getMyResponse({
        competitionId: compId,
      });
      expect(result).toBeNull();
    });

    it("returns submitted response with answers", async () => {
      const form = await ownerCaller.feedback.createForm({
        competitionId: compId,
        useTemplate: false,
      });
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      // Add a single non-required question
      const question = await ownerCaller.feedback.addQuestion({
        formId: form!.id,
        questionType: "rating",
        label: "How was it?",
        required: false,
        position: 0,
      });

      const competitor = await createUser();
      const competitorCaller = createCaller(competitor.id);

      await competitorCaller.feedback.submitResponse({
        formId: form!.id,
        answers: [{ questionId: question!.id, value: "5" }],
      });

      const result = await competitorCaller.feedback.getMyResponse({
        competitionId: compId,
      });

      expect(result).toBeDefined();
      expect(result!.answers.length).toBe(1);
      expect(result!.answers[0]!.value).toBe("5");
    });
  });

  // ── getAnalytics ─────────────────────────────────────────���────

  describe("getAnalytics", () => {
    it("returns analytics with response aggregation", async () => {
      const form = await ownerCaller.feedback.createForm({ competitionId: compId });
      await ownerCaller.competition.updateStatus({ competitionId: compId, status: "finished" });

      const publicCaller = createPublicCaller();
      const formData = await publicCaller.feedback.getForm({ competitionId: compId });
      const ratingQuestion = formData!.questions.find((q) => q.questionType === "rating")!;
      const yesNoQuestion = formData!.questions.find((q) => q.questionType === "yes_no")!;

      // Submit 2 responses (must answer all required questions)
      const requiredQuestions = formData!.questions.filter((q: { required: boolean }) => q.required);
      for (let i = 0; i < 2; i++) {
        const user = await createUser();
        const userCaller = createCaller(user.id);
        await userCaller.feedback.submitResponse({
          formId: form!.id,
          answers: requiredQuestions.map((q: { id: number; questionType: string }) => ({
            questionId: q.id,
            value:
              q.id === ratingQuestion.id
                ? String(4 + i) // 4 and 5
                : q.questionType === "yes_no"
                  ? "true"
                  : q.questionType === "rating"
                    ? "4"
                    : "Good",
          })),
        });
      }

      const analytics = await ownerCaller.feedback.getAnalytics({
        competitionId: compId,
      });

      expect(analytics).toBeDefined();
      expect(analytics!.totalResponses).toBe(2);

      const ratingAnalytic = analytics!.questions.find(
        (q) => q.questionId === ratingQuestion.id,
      )!;
      expect(ratingAnalytic.type).toBe("rating");
      expect((ratingAnalytic as { average: number }).average).toBe(4.5);
    });

    it("rejects non-admin", async () => {
      const random = await createUser();
      const randomCaller = createCaller(random.id);

      await expect(
        randomCaller.feedback.getAnalytics({ competitionId: compId }),
      ).rejects.toThrow();
    });
  });
});

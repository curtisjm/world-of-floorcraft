"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Label } from "@shared/ui/label";
import { Skeleton } from "@shared/ui/skeleton";
import { Textarea } from "@shared/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@shared/ui/radio-group";
import { ArrowLeft, CheckCircle2, MessageSquare, Star } from "lucide-react";
import { toast } from "sonner";

export default function FeedbackPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });

  const form = useQuery(
    api.competitions.feedback.getForm,
    comp ? { competitionId: comp._id } : "skip",
  );
  const formLoading = comp !== undefined && form === undefined;

  const myResponse = useQuery(
    api.competitions.feedback.getMyResponse,
    comp ? { competitionId: comp._id } : "skip",
  );
  const responseLoading = comp !== undefined && myResponse === undefined;

  if (!comp || formLoading || responseLoading) {
    return <FeedbackSkeleton slug={slug} />;
  }

  if (!form) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
        <BackLink slug={slug} />
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MessageSquare className="size-10 mx-auto mb-3 opacity-30" />
            <p>Feedback is not available for this competition.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (myResponse) {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
        <BackLink slug={slug} />
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <CheckCircle2 className="size-10 mx-auto text-status-sage" />
            <h2 className="text-lg font-semibold">Thank you!</h2>
            <p className="text-muted-foreground">
              Your feedback has been submitted. Thank you for helping improve
              future competitions.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <BackLink slug={slug} />

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{form.title}</h1>
        {form.description && (
          <p className="text-sm text-muted-foreground">{form.description}</p>
        )}
        <p className="text-sm text-muted-foreground">{comp.name}</p>
      </div>

      <FeedbackForm formId={form._id} questions={form.questions} />
    </div>
  );
}

// ── Feedback Form ─────────────────────────────────────────────

type Question = {
  _id: Id<"feedbackQuestions">;
  questionType: "text" | "rating" | "multiple_choice" | "yes_no";
  label: string;
  options?: string[];
  required: boolean;
  position: number;
};

function FeedbackForm({
  formId,
  questions,
}: {
  formId: Id<"feedbackForms">;
  questions: Question[];
}) {
  const [answers, setAnswers] = useState<
    Record<Id<"feedbackQuestions">, string>
  >({} as Record<Id<"feedbackQuestions">, string>);
  const [submitting, setSubmitting] = useState(false);
  const submitResponse = useMutation(api.competitions.feedback.submitResponse);

  const setAnswer = (questionId: Id<"feedbackQuestions">, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const sorted = [...questions].sort((a, b) => a.position - b.position);

  const requiredMissing = sorted.some(
    (q) => q.required && !answers[q._id]?.trim(),
  );

  const handleSubmit = async () => {
    const answerList = Object.entries(answers)
      .filter(([, v]) => v.trim())
      .map(([qId, value]) => ({
        questionId: qId as Id<"feedbackQuestions">,
        value,
      }));

    setSubmitting(true);
    try {
      await submitResponse({ formId, answers: answerList });
      toast.success("Feedback submitted!");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {sorted.map((q) => (
        <Card key={q._id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              {q.label}
              {q.required && <span className="text-destructive ml-1">*</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QuestionInput
              question={q}
              value={answers[q._id] ?? ""}
              onChange={(v) => setAnswer(q._id, v)}
            />
          </CardContent>
        </Card>
      ))}

      <Button
        onClick={handleSubmit}
        disabled={requiredMissing || submitting}
        className="w-full"
        size="lg"
      >
        {submitting ? "Submitting..." : "Submit Feedback"}
      </Button>
    </div>
  );
}

// ── Question Input ────────────────────────────────────────────

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: string;
  onChange: (v: string) => void;
}) {
  switch (question.questionType) {
    case "text":
      return (
        <Textarea
          placeholder="Your answer..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
        />
      );

    case "rating":
      return <RatingInput value={value} onChange={onChange} />;

    case "yes_no":
      return (
        <RadioGroup value={value} onValueChange={onChange}>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="true" id={`${question._id}-yes`} />
              <Label htmlFor={`${question._id}-yes`}>Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="false" id={`${question._id}-no`} />
              <Label htmlFor={`${question._id}-no`}>No</Label>
            </div>
          </div>
        </RadioGroup>
      );

    case "multiple_choice":
      return (
        <RadioGroup value={value} onValueChange={onChange}>
          <div className="space-y-2">
            {(question.options ?? []).map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`${question._id}-${opt}`} />
                <Label htmlFor={`${question._id}-${opt}`}>{opt}</Label>
              </div>
            ))}
          </div>
        </RadioGroup>
      );
  }
}

// ── Rating Input ──────────────────────────────────────────────

function RatingInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const rating = parseInt(value, 10) || 0;

  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n.toString())}
          className="p-1 transition-colors"
        >
          <Star
            className={`size-7 ${
              n <= rating
                ? "fill-gold text-gold"
                : "text-muted-foreground/40"
            }`}
          />
        </button>
      ))}
      {rating > 0 && (
        <span className="ml-2 text-sm text-muted-foreground">{rating}/5</span>
      )}
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────

function BackLink({ slug }: { slug: string }) {
  return (
    <Link
      href={`/competitions/${slug}`}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="size-4" />
      Back to competition
    </Link>
  );
}

function FeedbackSkeleton({ slug }: { slug: string }) {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <BackLink slug={slug} />
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-32 rounded-lg" />
      ))}
    </div>
  );
}

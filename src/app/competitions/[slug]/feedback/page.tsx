"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
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
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });

  const { data: form, isLoading: formLoading } =
    trpc.feedback.getForm.useQuery(
      { competitionId: comp?.id ?? 0 },
      { enabled: !!comp },
    );

  const { data: myResponse, isLoading: responseLoading } =
    trpc.feedback.getMyResponse.useQuery(
      { competitionId: comp?.id ?? 0 },
      { enabled: !!comp },
    );

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
            <CheckCircle2 className="size-10 mx-auto text-green-500" />
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

      <FeedbackForm formId={form.id} questions={form.questions} competitionId={comp.id} />
    </div>
  );
}

// ── Feedback Form ─────────────────────────────────────────────

type Question = {
  id: number;
  questionType: "text" | "rating" | "multiple_choice" | "yes_no";
  label: string;
  options: string[] | null;
  required: boolean;
  position: number;
};

function FeedbackForm({
  formId,
  questions,
  competitionId,
}: {
  formId: number;
  questions: Question[];
  competitionId: number;
}) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const utils = trpc.useUtils();

  const submit = trpc.feedback.submitResponse.useMutation({
    onSuccess: () => {
      toast.success("Feedback submitted!");
      utils.feedback.getMyResponse.invalidate({ competitionId });
    },
    onError: (err) => toast.error(err.message),
  });

  const setAnswer = (questionId: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  const sorted = [...questions].sort((a, b) => a.position - b.position);

  const requiredMissing = sorted.some(
    (q) => q.required && !answers[q.id]?.trim(),
  );

  const handleSubmit = () => {
    const answerList = Object.entries(answers)
      .filter(([, v]) => v.trim())
      .map(([qId, value]) => ({ questionId: parseInt(qId, 10), value }));

    submit.mutate({ formId, answers: answerList });
  };

  return (
    <div className="space-y-6">
      {sorted.map((q) => (
        <Card key={q.id}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              {q.label}
              {q.required && <span className="text-destructive ml-1">*</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <QuestionInput
              question={q}
              value={answers[q.id] ?? ""}
              onChange={(v) => setAnswer(q.id, v)}
            />
          </CardContent>
        </Card>
      ))}

      <Button
        onClick={handleSubmit}
        disabled={requiredMissing || submit.isPending}
        className="w-full"
        size="lg"
      >
        {submit.isPending ? "Submitting..." : "Submit Feedback"}
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
              <RadioGroupItem value="true" id={`${question.id}-yes`} />
              <Label htmlFor={`${question.id}-yes`}>Yes</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="false" id={`${question.id}-no`} />
              <Label htmlFor={`${question.id}-no`}>No</Label>
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
                <RadioGroupItem value={opt} id={`${question.id}-${opt}`} />
                <Label htmlFor={`${question.id}-${opt}`}>{opt}</Label>
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
                ? "fill-amber-400 text-amber-400"
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

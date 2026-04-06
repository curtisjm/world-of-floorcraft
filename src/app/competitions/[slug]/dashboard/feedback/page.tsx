"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Badge } from "@shared/ui/badge";
import { Button } from "@shared/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { Progress } from "@shared/ui/progress";
import {
  MessageSquare,
  Star,
  CheckCircle2,
  XCircle,
  BarChart3,
  ClipboardList,
} from "lucide-react";
import { toast } from "sonner";

export default function FeedbackDashboardPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const utils = trpc.useUtils();

  const { data: form, isLoading: formLoading } =
    trpc.feedback.getForm.useQuery(
      { competitionId: comp?.id ?? 0 },
      { enabled: !!comp },
    );

  const { data: analytics, isLoading: analyticsLoading } =
    trpc.feedback.getAnalytics.useQuery(
      { competitionId: comp?.id ?? 0 },
      { enabled: !!comp },
    );

  const createForm = trpc.feedback.createForm.useMutation({
    onSuccess: () => {
      toast.success("Feedback form created");
      utils.feedback.getForm.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  if (!comp || formLoading) {
    return <FeedbackSkeleton />;
  }

  // No form yet — show creation prompt
  if (!form) {
    return (
      <div className="space-y-6">
        <PageHeader />
        <Card>
          <CardContent className="py-12 text-center space-y-4">
            <MessageSquare className="size-10 mx-auto opacity-30 text-muted-foreground" />
            <div className="space-y-1">
              <h3 className="font-semibold">No feedback form yet</h3>
              <p className="text-sm text-muted-foreground">
                Create a form to collect feedback from competitors after the
                competition finishes.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <Button
                onClick={() =>
                  createForm.mutate({
                    competitionId: comp.id,
                    useTemplate: true,
                  })
                }
                disabled={createForm.isPending}
              >
                <ClipboardList className="size-4 mr-2" />
                Use Default Template
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  createForm.mutate({
                    competitionId: comp.id,
                    useTemplate: false,
                    title: "Competition Feedback",
                  })
                }
                disabled={createForm.isPending}
              >
                Start from Scratch
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader />

      {/* Summary stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Responses"
          value={analytics?.totalResponses ?? 0}
          icon={<MessageSquare className="size-4" />}
        />
        <StatCard
          label="Questions"
          value={analytics?.questions.length ?? 0}
          icon={<ClipboardList className="size-4" />}
        />
        <StatCard
          label="Form Link"
          value={`/competitions/${slug}/feedback`}
          icon={<BarChart3 className="size-4" />}
          isLink
        />
      </div>

      {/* Analytics per question */}
      {analyticsLoading && (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      )}

      {analytics && analytics.questions.length > 0 && (
        <div className="space-y-4">
          {analytics.questions.map((q) => (
            <QuestionAnalytics key={q.questionId} question={q} />
          ))}
        </div>
      )}

      {analytics && analytics.totalResponses === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <BarChart3 className="size-8 mx-auto mb-2 opacity-30" />
            <p>No responses yet. Analytics will appear here once competitors submit feedback.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Question Analytics ────────────────────────────────────────

type QuestionData =
  | {
      questionId: number;
      label: string;
      type: "rating";
      average: number | null;
      distribution: number[];
      count: number;
    }
  | {
      questionId: number;
      label: string;
      type: "yes_no";
      yesCount: number;
      noCount: number;
      percentage: number | null;
      count: number;
    }
  | {
      questionId: number;
      label: string;
      type: "multiple_choice";
      optionCounts: Record<string, number>;
      count: number;
    }
  | {
      questionId: number;
      label: string;
      type: "text";
      answers: string[];
      count: number;
    };

function QuestionAnalytics({ question }: { question: QuestionData }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium">
            {question.label}
          </CardTitle>
          <Badge variant="secondary" className="text-xs capitalize">
            {question.type.replace("_", "/")}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          {question.count} {question.count === 1 ? "response" : "responses"}
        </p>
      </CardHeader>
      <CardContent>
        {question.type === "rating" && <RatingAnalytics data={question} />}
        {question.type === "yes_no" && <YesNoAnalytics data={question} />}
        {question.type === "multiple_choice" && (
          <MultipleChoiceAnalytics data={question} />
        )}
        {question.type === "text" && <TextAnalytics data={question} />}
      </CardContent>
    </Card>
  );
}

function RatingAnalytics({
  data,
}: {
  data: Extract<QuestionData, { type: "rating" }>;
}) {
  const maxCount = Math.max(...data.distribution, 1);

  return (
    <div className="space-y-3">
      {data.average != null && (
        <div className="flex items-center gap-2">
          <div className="flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <Star
                key={n}
                className={`size-5 ${
                  n <= Math.round(data.average!)
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <span className="text-lg font-semibold tabular-nums">
            {data.average.toFixed(1)}
          </span>
          <span className="text-sm text-muted-foreground">/ 5</span>
        </div>
      )}
      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((rating) => {
          const count = data.distribution[rating - 1] ?? 0;
          const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
          return (
            <div key={rating} className="flex items-center gap-2 text-sm">
              <span className="w-3 text-right tabular-nums text-muted-foreground">
                {rating}
              </span>
              <Star className="size-3 text-muted-foreground" />
              <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-6 text-right tabular-nums text-xs text-muted-foreground">
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YesNoAnalytics({
  data,
}: {
  data: Extract<QuestionData, { type: "yes_no" }>;
}) {
  const total = data.yesCount + data.noCount;
  const yesPct = total > 0 ? (data.yesCount / total) * 100 : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <CheckCircle2 className="size-4 text-green-500" />
          <span className="text-sm font-medium">Yes: {data.yesCount}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <XCircle className="size-4 text-red-500" />
          <span className="text-sm font-medium">No: {data.noCount}</span>
        </div>
      </div>
      <Progress value={yesPct} className="h-2" />
      {data.percentage != null && (
        <p className="text-xs text-muted-foreground">
          {data.percentage.toFixed(0)}% yes
        </p>
      )}
    </div>
  );
}

function MultipleChoiceAnalytics({
  data,
}: {
  data: Extract<QuestionData, { type: "multiple_choice" }>;
}) {
  const entries = Object.entries(data.optionCounts).sort(
    ([, a], [, b]) => b - a,
  );
  const maxCount = Math.max(...entries.map(([, c]) => c), 1);

  return (
    <div className="space-y-2">
      {entries.map(([option, count]) => {
        const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
        return (
          <div key={option} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span>{option}</span>
              <span className="tabular-nums text-muted-foreground">{count}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TextAnalytics({
  data,
}: {
  data: Extract<QuestionData, { type: "text" }>;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? data.answers : data.answers.slice(0, 5);

  return (
    <div className="space-y-2">
      {shown.map((answer, i) => (
        <div
          key={i}
          className="text-sm bg-muted/50 rounded-md px-3 py-2"
        >
          {answer}
        </div>
      ))}
      {data.answers.length > 5 && !expanded && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setExpanded(true)}
          className="text-xs"
        >
          Show all {data.answers.length} responses
        </Button>
      )}
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────

function PageHeader() {
  return (
    <div className="flex items-center gap-2">
      <MessageSquare className="size-5" />
      <h1 className="text-xl font-bold">Feedback</h1>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  isLink,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  isLink?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-1">
          {icon}
          <span className="text-xs font-medium">{label}</span>
        </div>
        {isLink ? (
          <p className="text-sm font-mono truncate">{value}</p>
        ) : (
          <p className="text-2xl font-bold tabular-nums">{value}</p>
        )}
      </CardContent>
    </Card>
  );
}

function FeedbackSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-32" />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-lg" />
      ))}
    </div>
  );
}

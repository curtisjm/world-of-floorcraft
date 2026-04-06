"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { trpc } from "@shared/lib/trpc";
import { Button } from "@shared/ui/button";
import { Textarea } from "@shared/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

export default function TeamMatchPage() {
  const { slug } = useParams<{ slug: string }>();
  const { data: comp } = trpc.competition.getBySlug.useQuery({ slug });
  const { data: submissions, isLoading, refetch } = trpc.teamMatch.listByCompetition.useQuery(
    { competitionId: comp?.id ?? 0 },
    { enabled: !!comp },
  );

  const submitMutation = trpc.teamMatch.submit.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Submission posted");
      setContent("");
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteMutation = trpc.teamMatch.delete.useMutation({
    onSuccess: () => {
      refetch();
      toast.success("Submission removed");
    },
    onError: (err) => toast.error(err.message),
  });

  const [content, setContent] = useState("");

  if (isLoading || !comp) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{comp.name}</h1>
        <p className="text-muted-foreground">Team Match Ideas</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submit an Idea</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Share your team match ideas or suggestions..."
            rows={3}
            maxLength={2000}
          />
          <Button
            onClick={() => {
              submitMutation.mutate({
                competitionId: comp.id,
                content,
              });
            }}
            disabled={submitMutation.isPending || content.trim().length === 0}
          >
            {submitMutation.isPending ? "Submitting..." : "Submit"}
          </Button>
        </CardContent>
      </Card>

      {submissions?.length ? (
        <div className="space-y-2">
          {submissions.map((sub: any) => (
            <Card key={sub.id}>
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {sub.displayName ?? sub.username ?? "Anonymous"}
                    </p>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{sub.content}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {new Date(sub.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  {sub.isOwner && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive shrink-0"
                      onClick={() => deleteMutation.mutate({ submissionId: sub.id })}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No submissions yet. Be the first to share an idea!
          </CardContent>
        </Card>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { Button } from "@shared/ui/button";
import { Textarea } from "@shared/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@shared/ui/card";
import { Skeleton } from "@shared/ui/skeleton";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export default function TeamMatchPage() {
  const { slug } = useParams<{ slug: string }>();
  const comp = useQuery(api.competitions.core.getBySlug, { slug });
  const submissions = useQuery(
    api.competitions.teamMatch.listByCompetition,
    comp ? { competitionId: comp._id } : "skip",
  );
  const isLoading = submissions === undefined;

  const submitMutation = useMutation(api.competitions.teamMatch.submit);
  const deleteMutation = useMutation(api.competitions.teamMatch.remove);

  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<Id<"teamMatchSubmissions"> | null>(null);
  const [content, setContent] = useState("");

  if (isLoading || !comp) {
    return (
      <div className="max-w-3xl mx-auto py-8 px-4 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  async function handleSubmit() {
    if (!comp) return;
    setSubmitting(true);
    try {
      await submitMutation({
        competitionId: comp._id,
        content,
      });
      toast.success("Submission posted");
      setContent("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(submissionId: Id<"teamMatchSubmissions">) {
    setDeletingId(submissionId);
    try {
      await deleteMutation({ submissionId });
      toast.success("Submission removed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setDeletingId(null);
    }
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
            onClick={handleSubmit}
            disabled={submitting || content.trim().length === 0}
          >
            {submitting ? "Submitting..." : "Submit"}
          </Button>
        </CardContent>
      </Card>

      {submissions?.length ? (
        <div className="space-y-2">
          {submissions.map((sub) => (
            <Card key={sub._id}>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-destructive shrink-0"
                    disabled={deletingId === sub._id}
                    onClick={() => handleDelete(sub._id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
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

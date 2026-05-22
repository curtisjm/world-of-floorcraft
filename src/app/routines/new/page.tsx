"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { Input } from "@shared/ui/input";
import { Button } from "@shared/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@shared/ui/card";

export default function NewRoutinePage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-lg mx-auto px-6 py-12 text-muted-foreground">
          Loading...
        </div>
      }
    >
      <NewRoutineContent />
    </Suspense>
  );
}

function NewRoutineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const danceName = searchParams.get("dance") ?? "";
  const danceIdParam = searchParams.get("danceId");
  const danceId = (danceIdParam as Id<"dances"> | null) ?? null;

  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const allDances = useQuery(
    api.syllabus.dances.list,
    danceId ? "skip" : {},
  );

  const createRoutine = useMutation(api.routines.create);

  const handleCreate = async () => {
    if (!name.trim() || !danceId) return;
    setSubmitting(true);
    try {
      const routine = await createRoutine({
        danceId,
        name: name.trim(),
      });
      router.push(`/routines/${routine.id}/edit`);
    } finally {
      setSubmitting(false);
    }
  };

  // If no danceId, show dance selector
  if (!danceId) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">New Routine</h1>
            <p className="text-muted-foreground mt-2">
              Select a dance to get started.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(allDances ?? []).map((dance) => (
              <Button
                key={dance.id}
                variant="outline"
                className="h-auto py-4 justify-start"
                onClick={() =>
                  router.push(
                    `/routines/new?dance=${dance.name}&danceId=${dance.id}`
                  )
                }
              >
                {dance.displayName}
              </Button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-6 py-12">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">New Routine</h1>
          <p className="text-muted-foreground mt-2">
            Create a new {danceName} routine.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Routine Name</CardTitle>
            <CardDescription>
              Give your routine a name to identify it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="e.g., Competition Waltz"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
              autoFocus
            />
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() =>
                  router.push(danceName ? `/routines/dance/${danceName}` : "/routines")
                }
              >
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!name.trim() || submitting}
              >
                {submitting ? "Creating..." : "Create & Build"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

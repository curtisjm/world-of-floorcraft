"use client";

import Link from "next/link";
import { trpc } from "@shared/lib/trpc";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@shared/ui/card";
import { Badge } from "@shared/ui/badge";
import { Skeleton } from "@shared/ui/skeleton";

export function DanceRoutinesList({
  danceId,
  danceName,
}: {
  danceId: number;
  danceName: string;
}) {
  const { data: routines, isLoading } = trpc.routine.listByDance.useQuery({
    danceId,
  });

  if (isLoading) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>
    );
  }

  if (!routines || routines.length === 0) {
    return (
      <div className="atelier-empty-state atelier-empty-state-centered min-h-64 justify-center">
        <span className="atelier-empty-glyph" aria-hidden="true" />
        <div className="space-y-2">
          <p className="text-foreground">No routines yet.</p>
          <p className="text-sm text-muted-foreground">
            Build the first {danceName} sequence when you are ready to test the
            floor plan.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {routines.map((routine) => (
        <Link key={routine.id} href={`/routines/${routine.id}/edit`}>
          <Card className="hover:border-foreground/25 transition-colors cursor-pointer">
            <CardHeader className="flex flex-row items-center justify-between py-4">
              <div>
                <CardTitle className="text-base">{routine.name}</CardTitle>
                {routine.description && (
                  <CardDescription>{routine.description}</CardDescription>
                )}
              </div>
              <Badge variant="outline" className="ml-4 shrink-0">
                {new Date(routine.createdAt).toLocaleDateString()}
              </Badge>
            </CardHeader>
          </Card>
        </Link>
      ))}
    </div>
  );
}

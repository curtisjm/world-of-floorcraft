"use client";

import Link from "next/link";
import { trpc } from "@/lib/trpc";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
      <div className="flex items-center justify-center h-32">
        <p className="text-muted-foreground">Loading routines...</p>
      </div>
    );
  }

  if (!routines || routines.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 rounded-lg border border-dashed border-border">
        <div className="text-center space-y-2">
          <p className="text-muted-foreground">No routines yet.</p>
          <p className="text-sm text-muted-foreground">
            Create your first {danceName} routine to get started.
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

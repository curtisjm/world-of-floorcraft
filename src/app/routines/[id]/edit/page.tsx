"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";
import { RoutineBuilder } from "@routines/components/routine-builder";

export default function EditRoutinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const routineId = id as Id<"routines">;

  const routine = useQuery(api.routines.get, { routineId });
  const allDances = useQuery(api.syllabus.dances.list, {});

  if (routine === undefined || allDances === undefined) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-12">
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading routine...</p>
        </div>
      </div>
    );
  }

  if (!routine) {
    notFound();
  }

  const dance = allDances.find((d) => d.id === routine.danceId);

  return (
    <div className="max-w-7xl mx-auto px-6 py-12">
      <RoutineBuilder
        routineId={routine.id}
        danceId={routine.danceId}
        danceName={dance?.name ?? ""}
        initialName={routine.name}
        initialEntries={routine.entries}
      />
    </div>
  );
}
